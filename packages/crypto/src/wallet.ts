/**
 * Multi-coin HD wallet derivation for Auth Box.
 *
 * Auth Box already protects a BIP-39 24-word seed phrase (see `seed.ts`). That
 * same phrase IS a wallet seed: this module derives standard BIP-32 / BIP-44 /
 * BIP-84 wallet keys from it, so Auth Box becomes a self-custodial crypto
 * wallet without introducing a second secret.
 *
 * Design contract:
 *
 *   - INTEROPERABLE. The seed is BIP-39-compliant (PBKDF2-HMAC-SHA512, salt
 *     "mnemonic", 2048 iterations — see `mnemonicToSeed`) and derivation uses
 *     the registered standards. The user's 24 words recover the SAME addresses
 *     in Electrum, MetaMask, Ledger, etc. No lock-in: that is the whole point
 *     of self-custody.
 *
 *   - SELF-CUSTODIAL + WATCH-ONLY SERVER. Private keys are derived on the
 *     client from the seed and NEVER serialized to the server. Only the
 *     account-level extended PUBLIC key (xpub) and derived addresses leave the
 *     device — enough for the server to watch balances and history, never
 *     enough to move funds. This preserves Auth Box's zero-knowledge property
 *     end-to-end.
 *
 *   - INDEPENDENT TREES. Auth Box's internal keys (vault/sync/agent) hang off a
 *     CUSTOM HD branch keyed by HMAC "authbox seed" (see `deriveKey`). Wallet
 *     keys hang off the STANDARD BIP-32 tree keyed by HMAC "Bitcoin seed" (via
 *     @scure/bip32). Same seed, two cryptographically independent trees, zero
 *     collision.
 *
 * Coverage: Bitcoin (native segwit + legacy) and Ethereum / EVM. These two span
 * the two derivation regimes — UTXO/secp256k1+hash160 and account/secp256k1+
 * keccak — so adding BTC-like coins (LTC, DOGE: different version bytes) or
 * EVM chains (same ETH address) is a parameter change, not new cryptography.
 *
 * Crypto is delegated to audited libraries (@scure/bip32, @scure/btc-signer,
 * @noble/curves) — hand-rolling secp256k1 derivation is exactly where wallets
 * acquire CVEs.
 */

import * as btc from '@scure/btc-signer';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { mnemonicToSeed } from './seed';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Coin = 'btc' | 'eth';

/** Bitcoin script type. p2wpkh = native segwit (bech32, modern default); p2pkh = legacy base58. */
export type BtcScriptType = 'p2wpkh' | 'p2pkh';

export type WalletNetwork = 'mainnet' | 'testnet';

export interface DeriveAddressOptions {
  account?: number;            // BIP-44 account index (default 0)
  change?: 0 | 1;              // 0 = external/receive (default), 1 = internal/change
  index?: number;              // address index within the chain (default 0)
  scriptType?: BtcScriptType;  // BTC only (default p2wpkh)
  network?: WalletNetwork;     // default mainnet
}

export interface WalletAddress {
  coin: Coin;
  network: WalletNetwork;
  address: string;
  /** Full BIP-44/84 derivation path, e.g. m/84'/0'/0'/0/0 */
  path: string;
  /** Compressed public key, hex. Safe to share. */
  publicKey: string;
  account: number;
  change: 0 | 1;
  index: number;
  /** Present for BTC only. */
  scriptType?: BtcScriptType;
}

export interface WalletAccount {
  coin: Coin;
  network: WalletNetwork;
  account: number;
  /** Account-level path, e.g. m/84'/0'/0' */
  path: string;
  /** Extended PUBLIC key (xpub). Watch-only: lets a server scan addresses, never spend. */
  xpub: string;
  scriptType?: BtcScriptType;
}

// ─── Path construction ────────────────────────────────────────────────────────

/** BIP-44 coin_type. Testnet collapses to 1' for every coin per SLIP-44. */
function coinType(coin: Coin, network: WalletNetwork): number {
  if (network === 'testnet') return 1;
  return coin === 'btc' ? 0 : 60;
}

/** BIP-43 purpose: 84' for native segwit, 44' for legacy/account-model. */
function purpose(coin: Coin, scriptType: BtcScriptType): number {
  if (coin === 'eth') return 44;
  return scriptType === 'p2wpkh' ? 84 : 44;
}

function accountPath(coin: Coin, account: number, scriptType: BtcScriptType, network: WalletNetwork): string {
  return `m/${purpose(coin, scriptType)}'/${coinType(coin, network)}'/${account}'`;
}

function addressPath(
  coin: Coin,
  account: number,
  change: 0 | 1,
  index: number,
  scriptType: BtcScriptType,
  network: WalletNetwork,
): string {
  return `${accountPath(coin, account, scriptType, network)}/${change}/${index}`;
}

// ─── Address encoding ─────────────────────────────────────────────────────────

function btcNetwork(network: WalletNetwork) {
  return network === 'testnet' ? btc.TEST_NETWORK : btc.NETWORK;
}

function btcAddress(publicKey: Uint8Array, scriptType: BtcScriptType, network: WalletNetwork): string {
  const net = btcNetwork(network);
  const pay = scriptType === 'p2wpkh' ? btc.p2wpkh(publicKey, net) : btc.p2pkh(publicKey, net);
  if (!pay.address) throw new Error('failed to derive BTC address');
  return pay.address;
}

/**
 * Ethereum address from a compressed secp256k1 public key, with EIP-55
 * mixed-case checksum.
 *
 * address = last 20 bytes of keccak256(uncompressed_pubkey[1:]); the EIP-55
 * checksum then upper/lower-cases each hex nibble based on keccak256 of the
 * lowercase address string. The checksum is what wallets use to catch typos.
 */
export function ethAddressFromPublicKey(compressedPublicKey: Uint8Array): string {
  const point = secp256k1.Point.fromHex(compressedPublicKey);
  const uncompressed = point.toBytes(false).slice(1); // drop 0x04 prefix → 64 bytes
  const hashed = keccak_256(uncompressed);
  const addrBytes = hashed.slice(-20);

  const hex = bytesToHex(addrBytes);
  const checksumHash = bytesToHex(keccak_256(new TextEncoder().encode(hex)));

  let out = '0x';
  for (let i = 0; i < hex.length; i++) {
    out += parseInt(checksumHash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derive a watch-only account descriptor (xpub + account path) from a seed.
 * The returned xpub is safe to persist server-side: it can enumerate addresses
 * but cannot sign.
 */
export function deriveAccount(
  seed: Uint8Array,
  coin: Coin,
  options: Pick<DeriveAddressOptions, 'account' | 'scriptType' | 'network'> = {},
): WalletAccount {
  const { account = 0, network = 'mainnet' } = options;
  const scriptType: BtcScriptType = coin === 'btc' ? options.scriptType ?? 'p2wpkh' : 'p2wpkh';
  const path = accountPath(coin, account, scriptType, network);
  const node = HDKey.fromMasterSeed(seed).derive(path);

  return {
    coin,
    network,
    account,
    path,
    xpub: node.publicExtendedKey,
    ...(coin === 'btc' ? { scriptType } : {}),
  };
}

/**
 * Derive a single receive/change address from a seed. Public key only — no
 * private material is returned or retained.
 */
export function deriveAddress(seed: Uint8Array, coin: Coin, options: DeriveAddressOptions = {}): WalletAddress {
  const { account = 0, change = 0, index = 0, network = 'mainnet' } = options;
  const scriptType: BtcScriptType = coin === 'btc' ? options.scriptType ?? 'p2wpkh' : 'p2wpkh';
  const path = addressPath(coin, account, change, index, scriptType, network);
  const node = HDKey.fromMasterSeed(seed).derive(path);

  if (!node.publicKey) throw new Error('derivation produced no public key');

  const address =
    coin === 'btc'
      ? btcAddress(node.publicKey, scriptType, network)
      : ethAddressFromPublicKey(node.publicKey);

  return {
    coin,
    network,
    address,
    path,
    publicKey: bytesToHex(node.publicKey),
    account,
    change,
    index,
    ...(coin === 'btc' ? { scriptType } : {}),
  };
}

/**
 * Derive the raw private key for a wallet address. CLIENT-SIDE SIGNING ONLY.
 *
 * Never serialize, log, transmit, or persist the return value. It exists so a
 * client can sign a transaction locally; the moment it leaves the device the
 * self-custody guarantee is void.
 */
export function derivePrivateKey(seed: Uint8Array, coin: Coin, options: DeriveAddressOptions = {}): Uint8Array {
  const { account = 0, change = 0, index = 0, network = 'mainnet' } = options;
  const scriptType: BtcScriptType = coin === 'btc' ? options.scriptType ?? 'p2wpkh' : 'p2wpkh';
  const path = addressPath(coin, account, change, index, scriptType, network);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.privateKey) throw new Error('derivation produced no private key');
  return node.privateKey;
}

/** Convenience: derive an address straight from a mnemonic phrase. */
export function deriveAddressFromMnemonic(
  mnemonic: string,
  coin: Coin,
  options: DeriveAddressOptions = {},
  passphrase = '',
): WalletAddress {
  return deriveAddress(mnemonicToSeed(mnemonic, passphrase), coin, options);
}
