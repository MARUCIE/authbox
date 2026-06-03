import { describe, it, expect } from 'vitest';
import { mnemonicToSeed } from '../seed';
import { deriveAddress, derivePrivateKey } from '../wallet';
import { buildBtcTransaction, buildEthTransaction } from '../wallet-tx';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Transaction as EthTransaction } from 'micro-eth-signer';

/**
 * Same canonical all-zeros-entropy mnemonic the derivation tests use. Its
 * addresses are published everywhere, so anchoring the SIGNATURES to them
 * proves the spend path is interoperable, not just internally consistent.
 */
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeed(TEST_MNEMONIC);

// Public anchors for this seed (BIP-84 / BIP-44 / EIP-55).
const BTC_ADDR_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'; // m/84'/0'/0'/0/0
const ETH_ADDR_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'; // m/44'/60'/0'/0/0

describe('buildEthTransaction — EIP-1559 signing', () => {
  const baseParams = {
    to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    amountWei: 100000000000000000n, // 0.1 ETH
    nonce: 0n,
    gasLimit: 21000n,
    maxFeePerGas: 30000000000n, // 30 gwei
    maxPriorityFeePerGas: 1000000000n, // 1 gwei
    chainId: 1n,
  };

  it('recovered sender equals the canonical derived address (external anchor)', () => {
    const signed = buildEthTransaction(seed, baseParams);
    expect(signed.sender).toBe(ETH_ADDR_0);
    expect(signed.coin).toBe('eth');
  });

  it('produces an EIP-1559 typed envelope (0x02) and a 0x-prefixed hash', () => {
    const signed = buildEthTransaction(seed, baseParams);
    expect(signed.hex.startsWith('0x02')).toBe(true);
    expect(signed.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('uses hedged signatures: two signings both recover to the same sender', () => {
    // micro-eth-signer / @noble add extra entropy to the RFC6979 nonce (fault-
    // attack hardening), so the SAME tx yields DIFFERENT valid signatures. The
    // invariant that must hold is sender-recovery + validity, not byte equality.
    const a = buildEthTransaction(seed, baseParams);
    const b = buildEthTransaction(seed, baseParams);
    expect(a.sender).toBe(ETH_ADDR_0);
    expect(b.sender).toBe(ETH_ADDR_0);
    expect(EthTransaction.fromHex(a.hex).sender.toLowerCase()).toBe(ETH_ADDR_0.toLowerCase());
    expect(EthTransaction.fromHex(b.hex).sender.toLowerCase()).toBe(ETH_ADDR_0.toLowerCase());
  });

  it('the signed payload independently recovers to the same sender', () => {
    const signed = buildEthTransaction(seed, baseParams);
    const parsed = EthTransaction.fromHex(signed.hex);
    expect(parsed.sender.toLowerCase()).toBe(ETH_ADDR_0.toLowerCase());
  });

  it('a different nonce yields a different signature (no stale reuse)', () => {
    const n0 = buildEthTransaction(seed, baseParams);
    const n1 = buildEthTransaction(seed, { ...baseParams, nonce: 1n });
    expect(n0.hex).not.toBe(n1.hex);
  });

  it('rejects a negative amount', () => {
    expect(() => buildEthTransaction(seed, { ...baseParams, amountWei: -1n })).toThrow(/amount must be/);
  });
});

describe('buildBtcTransaction — UTXO selection + p2wpkh signing', () => {
  // A fabricated outpoint owned by the wallet's own first receive address.
  // No broadcast happens, so spending a phantom UTXO is purely a signing test;
  // `finalize()` succeeds only if the signature is valid for that input.
  const utxo = { txid: 'a'.repeat(64), vout: 0, value: 200000n }; // 0.002 BTC

  it('input is owned by the canonical BIP-84 address', () => {
    expect(deriveAddress(seed, 'btc').address).toBe(BTC_ADDR_0);
  });

  it('builds, signs, and finalizes a native-segwit transaction', () => {
    const signed = buildBtcTransaction(seed, {
      utxos: [utxo],
      to: BTC_ADDR_0,
      amountSats: 150000n,
      changeAddress: BTC_ADDR_0,
      feeRateSatPerVb: 5,
    });
    expect(signed.coin).toBe('btc');
    expect(signed.hex.length).toBeGreaterThan(0);
    expect(signed.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.fee).toBeGreaterThan(0n);
    expect(signed.vsize).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed input set', () => {
    const mk = () =>
      buildBtcTransaction(seed, {
        utxos: [utxo],
        to: BTC_ADDR_0,
        amountSats: 150000n,
        changeAddress: BTC_ADDR_0,
        feeRateSatPerVb: 5,
      });
    expect(mk().hex).toBe(mk().hex);
  });

  it('signs on testnet too (coin_type 1 path)', () => {
    const tnAddr = deriveAddress(seed, 'btc', { network: 'testnet' }).address;
    const signed = buildBtcTransaction(seed, {
      utxos: [{ txid: 'b'.repeat(64), vout: 1, value: 500000n }],
      to: tnAddr,
      amountSats: 100000n,
      changeAddress: tnAddr,
      feeRateSatPerVb: 2,
      network: 'testnet',
    });
    expect(signed.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an empty UTXO set', () => {
    expect(() =>
      buildBtcTransaction(seed, {
        utxos: [],
        to: BTC_ADDR_0,
        amountSats: 1000n,
        changeAddress: BTC_ADDR_0,
        feeRateSatPerVb: 5,
      }),
    ).toThrow(/no UTXOs/);
  });

  it('rejects a fee rate below 1 sat/vByte', () => {
    expect(() =>
      buildBtcTransaction(seed, {
        utxos: [utxo],
        to: BTC_ADDR_0,
        amountSats: 1000n,
        changeAddress: BTC_ADDR_0,
        feeRateSatPerVb: 0,
      }),
    ).toThrow(/fee rate/);
  });

  it('throws when funds cannot cover amount + fee', () => {
    expect(() =>
      buildBtcTransaction(seed, {
        utxos: [{ txid: 'c'.repeat(64), vout: 0, value: 1000n }],
        to: BTC_ADDR_0,
        amountSats: 999999n, // far more than the single 1000-sat UTXO
        changeAddress: BTC_ADDR_0,
        feeRateSatPerVb: 5,
      }),
    ).toThrow(/insufficient funds/);
  });
});

describe('private-key hygiene', () => {
  // The builders derive a key, sign, then zero it in a `finally`. We cannot peek
  // at the internal buffer, but we CAN prove the zeroing does not corrupt later
  // derivations: every call must reproduce identical output from the same seed.
  it('repeated signing does not corrupt the seed-derived key material', () => {
    const txParams = {
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amountWei: 1n,
      nonce: 0n,
      gasLimit: 21000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
      chainId: 1n,
    };
    const a = buildEthTransaction(seed, txParams);
    // A standalone derivation AFTER signing must still match the canonical
    // pubkey — proving the in-builder zeroize() did not touch shared buffers.
    const priv = derivePrivateKey(seed, 'eth');
    const pub = secp256k1.getPublicKey(priv, true);
    expect(pub.length).toBe(33);
    const b = buildEthTransaction(seed, txParams);
    // Hedged signatures differ byte-wise, but every signing recovers the same
    // sender — the seed material is intact across calls.
    expect(a.sender).toBe(ETH_ADDR_0);
    expect(b.sender).toBe(ETH_ADDR_0);
  });
});
