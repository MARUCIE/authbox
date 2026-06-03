/**
 * Client-side transaction building + signing for the Auth Box wallet.
 *
 * This is the SPEND half of the wallet. `wallet.ts` derives watch-only material
 * (xpub + addresses) that is safe to share; this module derives the PRIVATE key
 * for the exact moment of signing and zeroes it immediately after. Nothing here
 * ever touches the network — it returns a fully-signed raw transaction as hex.
 * Broadcasting is a separate, server-side relay (the server forwards bytes it
 * cannot have produced), so the self-custody / watch-only contract is intact:
 *
 *   seed (client) ──derive──▶ private key ──sign──▶ raw tx hex ──relay──▶ network
 *                              └── zeroed in `finally`, never persisted ──┘
 *
 * Security contract:
 *   - Private keys are derived locally, used once, and `fill(0)`-ed in a
 *     `finally` block so an exception mid-sign still wipes them.
 *   - For ETH we recover the sender from the signed payload and assert it equals
 *     the address we derived. A mismatch means a derivation/signing bug, and we
 *     would rather throw than hand back a transaction that spends from an
 *     unexpected key.
 *   - Crypto is delegated to audited libraries: @scure/btc-signer (UTXO coin
 *     selection + PSBT signing) and micro-eth-signer (EIP-1559 RLP + secp256k1).
 *     Hand-rolling RLP or coin selection is exactly where wallets acquire CVEs.
 *
 * Byte-order note (BTC): @scure/btc-signer takes `txid` in big-endian DISPLAY
 * order — the same string block explorers and mempool.space show — so UTXO ids
 * pass straight through with no manual reversal.
 */

import * as btc from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Transaction as EthTransaction } from 'micro-eth-signer';
import { derivePrivateKey, deriveAddress, type BtcScriptType, type WalletNetwork } from './wallet';

// ─── Bitcoin ──────────────────────────────────────────────────────────────────

/**
 * A spendable output owned by this wallet. The derivation coords identify WHICH
 * address (hence which key) owns it; the server, being watch-only, supplies the
 * outpoint + value but never the key.
 */
export interface BtcSpendableUtxo {
  /** Transaction id in big-endian display order (as block explorers show it). */
  txid: string;
  /** Output index within that transaction. */
  vout: number;
  /** Value in satoshis. */
  value: bigint;
  account?: number; // BIP-44 account (default 0)
  change?: 0 | 1; // 0 = external/receive (default), 1 = internal/change
  index?: number; // address index (default 0)
  /** Legacy p2pkh only: raw previous-tx hex, required as the nonWitnessUtxo. */
  prevTxHex?: string;
}

export interface BuildBtcTxParams {
  utxos: BtcSpendableUtxo[];
  /** Recipient address. */
  to: string;
  /** Amount to send, in satoshis. */
  amountSats: bigint;
  /** Where the change output goes (usually a fresh internal address). */
  changeAddress: string;
  /** Fee rate in satoshis per virtual byte (>= 1). */
  feeRateSatPerVb: number;
  network?: WalletNetwork; // default mainnet
  scriptType?: BtcScriptType; // default p2wpkh (native segwit)
}

export interface SignedBtcTransaction {
  coin: 'btc';
  /** Fully-signed raw transaction, hex (ready to broadcast). */
  hex: string;
  /** Transaction id, big-endian display order. */
  txid: string;
  /** Fee actually paid, in satoshis. */
  fee: bigint;
  /** Virtual size, vbytes. */
  vsize: number;
}

function btcNet(network: WalletNetwork) {
  return network === 'testnet' ? btc.TEST_NETWORK : btc.NETWORK;
}

/**
 * Build and sign a Bitcoin transaction entirely on the client.
 *
 * Coin selection, change calculation, and fee estimation are delegated to
 * @scure/btc-signer's `selectUTXO` (strategy `default`, BIP-69 ordered). Every
 * candidate UTXO's key is derived up front so `selectUTXO`'s chosen subset can
 * be signed; all derived keys are zeroed in `finally`, selected or not.
 */
export function buildBtcTransaction(seed: Uint8Array, params: BuildBtcTxParams): SignedBtcTransaction {
  const { utxos, to, amountSats, changeAddress, feeRateSatPerVb, network = 'mainnet', scriptType = 'p2wpkh' } = params;

  if (utxos.length === 0) throw new Error('no UTXOs to spend');
  if (amountSats <= 0n) throw new Error('amount must be a positive number of satoshis');
  if (!Number.isFinite(feeRateSatPerVb) || feeRateSatPerVb < 1) {
    throw new Error('fee rate must be >= 1 sat/vByte');
  }

  const net = btcNet(network);
  const privKeys: Uint8Array[] = [];

  try {
    const inputs = utxos.map((u) => {
      const priv = derivePrivateKey(seed, 'btc', {
        account: u.account ?? 0,
        change: u.change ?? 0,
        index: u.index ?? 0,
        scriptType,
        network,
      });
      privKeys.push(priv);

      const pub = secp256k1.getPublicKey(priv, true);
      const pay = scriptType === 'p2wpkh' ? btc.p2wpkh(pub, net) : btc.p2pkh(pub, net);

      if (scriptType === 'p2wpkh') {
        return { txid: u.txid, index: u.vout, witnessUtxo: { script: pay.script, amount: u.value } };
      }
      // Legacy p2pkh cannot be signed from the outpoint alone: the signature
      // commits to the full previous transaction, so the caller must supply it.
      if (!u.prevTxHex) {
        throw new Error(`legacy p2pkh input ${u.txid}:${u.vout} requires prevTxHex (nonWitnessUtxo)`);
      }
      return { txid: u.txid, index: u.vout, nonWitnessUtxo: hexToBytes(u.prevTxHex.replace(/^0x/, '')) };
    });

    const selected = btc.selectUTXO(inputs, [{ address: to, amount: amountSats }], 'default', {
      feePerByte: BigInt(Math.ceil(feeRateSatPerVb)),
      changeAddress,
      network: net,
      createTx: true,
      bip69: true,
    });

    if (!selected || !selected.tx || selected.fee === undefined) {
      throw new Error('insufficient funds to cover amount + fee');
    }

    const tx = selected.tx;
    // Each key signs only the inputs it owns; unselected candidates are no-ops.
    for (const pk of privKeys) tx.sign(pk);
    tx.finalize();

    return { coin: 'btc', hex: tx.hex, txid: tx.id, fee: selected.fee, vsize: tx.vsize };
  } finally {
    for (const pk of privKeys) pk.fill(0);
  }
}

// ─── Ethereum ───────────────────────────────────────────────────────────────────

export interface BuildEthTxParams {
  /** Recipient address (EIP-55 or lowercase). */
  to: string;
  /** Value to send, in wei. */
  amountWei: bigint;
  /** Account nonce (number of prior txs from this address). */
  nonce: bigint;
  gasLimit: bigint; // 21000 for a plain transfer
  maxFeePerGas: bigint; // wei
  maxPriorityFeePerGas: bigint; // wei
  /** EIP-155 chain id (1 = mainnet, 11155111 = Sepolia, etc.). */
  chainId: bigint;
  /** Calldata, hex. Default '0x' (plain value transfer). */
  data?: string;
  account?: number; // default 0
  change?: 0 | 1; // default 0
  index?: number; // default 0
  network?: WalletNetwork; // default mainnet (selects BIP-44 coin_type only)
}

export interface SignedEthTransaction {
  coin: 'eth';
  /** Fully-signed EIP-1559 typed transaction, hex (0x02…). */
  hex: string;
  /** Transaction hash, 0x-prefixed. */
  hash: string;
  /** Sender recovered from the signature; equals the derived address. */
  sender: string;
}

/**
 * Build and sign an EIP-1559 (type-2) Ethereum transaction on the client.
 *
 * The private key is derived for signing, then the sender is recovered from the
 * signed payload and asserted equal to the independently-derived address — a
 * self-check that the signature really spends from the intended key. The key is
 * zeroed in `finally`.
 */
export function buildEthTransaction(seed: Uint8Array, params: BuildEthTxParams): SignedEthTransaction {
  const {
    to,
    amountWei,
    nonce,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId,
    data = '0x',
    account = 0,
    change = 0,
    index = 0,
    network = 'mainnet',
  } = params;

  if (amountWei < 0n) throw new Error('amount must be >= 0 wei');
  if (nonce < 0n) throw new Error('nonce must be >= 0');

  const expectedAddress = deriveAddress(seed, 'eth', { account, change, index, network }).address;
  const priv = derivePrivateKey(seed, 'eth', { account, change, index, network });

  try {
    const unsigned = EthTransaction.prepare({
      type: 'eip1559',
      to,
      value: amountWei,
      nonce,
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit,
      chainId,
      data,
    });
    const signed = unsigned.signBy(priv);

    if (signed.sender.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error('signed-sender mismatch: signature does not correspond to the derived address');
    }

    return {
      coin: 'eth',
      hex: signed.toHex(),
      hash: signed.hash.startsWith('0x') ? signed.hash : `0x${signed.hash}`,
      sender: signed.sender,
    };
  } finally {
    priv.fill(0);
  }
}
