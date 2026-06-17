import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  selectBtcFeeRate,
  deriveEthFeeParams,
  ethChainId,
  type BtcFeeTiers,
} from '../wallet-send';

describe('parseAmount — decimal string to base-unit BigInt', () => {
  // BTC has 8 decimals (satoshis), ETH 18 (wei). These are the exact vectors a
  // wrong implementation gets wrong.
  it('converts whole BTC to satoshis', () => {
    expect(parseAmount('1', 8)).toBe(100_000_000n);
  });

  it('converts fractional BTC without floating-point drift', () => {
    // 0.1 BTC = 10_000_000 sat. parseFloat path would risk 9999999/10000001.
    expect(parseAmount('0.1', 8)).toBe(10_000_000n);
    expect(parseAmount('0.00000001', 8)).toBe(1n); // 1 satoshi (dust floor)
    expect(parseAmount('0.12345678', 8)).toBe(12_345_678n);
  });

  it('converts ETH to wei at full 18-decimal precision', () => {
    expect(parseAmount('1', 18)).toBe(1_000_000_000_000_000_000n);
    expect(parseAmount('0.1', 18)).toBe(100_000_000_000_000_000n);
    // A value that overflows IEEE-754 exactness — must stay exact via BigInt.
    expect(parseAmount('123.123456789012345678', 18)).toBe(
      123_123_456_789_012_345_678n,
    );
  });

  it('accepts leading-dot and trailing-dot forms', () => {
    expect(parseAmount('.5', 8)).toBe(50_000_000n);
    expect(parseAmount('5.', 8)).toBe(500_000_000n);
  });

  it('REJECTS more fractional digits than the unit allows (no silent truncation)', () => {
    // 9 decimals on an 8-decimal coin = sub-satoshi precision the user typed by
    // mistake. Truncating it silently is an invisible loss; we throw instead.
    expect(() => parseAmount('0.123456789', 8)).toThrow(/decimal places/);
  });

  it('rejects zero, empty, negative, and non-numeric input', () => {
    expect(() => parseAmount('0', 8)).toThrow(/greater than zero/);
    expect(() => parseAmount('0.0', 8)).toThrow(/greater than zero/);
    expect(() => parseAmount('', 8)).toThrow(/Enter an amount/);
    expect(() => parseAmount('   ', 8)).toThrow(/Enter an amount/);
    expect(() => parseAmount('.', 8)).toThrow(/Enter an amount/);
    expect(() => parseAmount('-1', 8)).toThrow(/positive decimal/);
    expect(() => parseAmount('1e5', 8)).toThrow(/positive decimal/);
    expect(() => parseAmount('1.2.3', 8)).toThrow(/positive decimal/);
    expect(() => parseAmount('abc', 8)).toThrow(/positive decimal/);
  });
});

describe('selectBtcFeeRate', () => {
  const fees: BtcFeeTiers = {
    fastestFee: 42,
    halfHourFee: 30,
    hourFee: 20,
    economyFee: 10,
    minimumFee: 5,
  };

  it('maps tiers to the right field', () => {
    expect(selectBtcFeeRate(fees, 'fast')).toBe(42);
    expect(selectBtcFeeRate(fees, 'normal')).toBe(30);
    expect(selectBtcFeeRate(fees, 'slow')).toBe(20);
  });

  it('floors at minimumFee so a 0-tier never produces an unrelayable tx', () => {
    const quiet: BtcFeeTiers = { ...fees, hourFee: 0, minimumFee: 3 };
    expect(selectBtcFeeRate(quiet, 'slow')).toBe(3);
  });

  it('floors at 1 even if the node reports minimumFee 0', () => {
    const zero: BtcFeeTiers = {
      fastestFee: 0,
      halfHourFee: 0,
      hourFee: 0,
      economyFee: 0,
      minimumFee: 0,
    };
    expect(selectBtcFeeRate(zero, 'normal')).toBe(1);
  });
});

describe('deriveEthFeeParams — EIP-1559 ceilings', () => {
  it('sets ceiling = gasPrice + priority (headroom) with the network invariant', () => {
    const { maxFeePerGas, maxPriorityFeePerGas } = deriveEthFeeParams(
      30_000_000_000n, // 30 gwei base-ish
      1_500_000_000n, // 1.5 gwei tip
    );
    expect(maxPriorityFeePerGas).toBe(1_500_000_000n);
    expect(maxFeePerGas).toBe(31_500_000_000n);
    // The invariant a node enforces: maxFee must be >= maxPriority.
    expect(maxFeePerGas >= maxPriorityFeePerGas).toBe(true);
  });

  it('keeps the invariant even when the tip exceeds the base price', () => {
    const { maxFeePerGas, maxPriorityFeePerGas } = deriveEthFeeParams(
      1_000_000_000n,
      5_000_000_000n,
    );
    expect(maxFeePerGas).toBe(6_000_000_000n);
    expect(maxFeePerGas >= maxPriorityFeePerGas).toBe(true);
  });

  it('clamps negative readings to zero defensively', () => {
    const r = deriveEthFeeParams(-1n, -1n);
    expect(r.maxFeePerGas).toBe(0n);
    expect(r.maxPriorityFeePerGas).toBe(0n);
  });
});

describe('ethChainId', () => {
  it('mainnet = 1, testnet = Sepolia 11155111', () => {
    expect(ethChainId('mainnet')).toBe(1n);
    expect(ethChainId('testnet')).toBe(11155111n);
  });
});
