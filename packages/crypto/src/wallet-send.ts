/**
 * Funds-critical glue between the wallet UI and the low-level transaction
 * builders in `wallet-tx.ts`. Everything here is PURE: no network, no clock, no
 * randomness — so it is fully unit-testable offline. The dialog fetches live
 * data (UTXOs, fee rates, nonce, gas) and feeds it into these helpers; the
 * helpers never reach out themselves.
 *
 * Why a separate module: the off-by-decimals class of bug (sending 10x or 0.1x
 * the intended amount) and the EIP-1559 fee-ceiling class of bug (a tx that can
 * never confirm, or that overpays) are the two most expensive mistakes a wallet
 * can make. Isolating them here lets them be pinned by tests independent of the
 * 750-line React dialog that orchestrates them.
 */

/**
 * Convert a human decimal string (e.g. "0.001") into an integer amount of the
 * smallest unit (satoshis for BTC at 8 decimals, wei for ETH at 18), as a
 * BigInt. The inverse of the UI's `formatUnits`.
 *
 * Never passes through a JS number: `parseFloat("0.1") * 1e18` is
 * `100000000000000000` only by luck and silently corrupts for most inputs.
 * String arithmetic into BigInt is exact at any precision.
 *
 * Rejects (throws) rather than silently coerces:
 *  - empty / "." / non-numeric / negative / scientific notation
 *  - more fractional digits than `decimals` (silent truncation of a BTC 8th
 *    decimal is an invisible loss of funds — force the user to be explicit)
 *  - a zero result (a send of 0 is always a mistake)
 */
export function parseAmount(input: string, decimals: number): bigint {
  const s = input.trim();
  if (s === "" || s === ".") throw new Error("Enter an amount");
  // Exactly one optional dot, digits on at least one side, nothing else.
  if (!/^\d*\.?\d*$/.test(s) || (s.match(/\./g)?.length ?? 0) > 1) {
    throw new Error("Amount must be a positive decimal number");
  }
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (fracRaw.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  const frac = fracRaw.padEnd(decimals, "0");
  const value =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac === "" ? "0" : frac);
  if (value <= 0n) throw new Error("Amount must be greater than zero");
  return value;
}

/** Recommended-fee tiers as returned by mempool.space `/v1/fees/recommended`. */
export interface BtcFeeTiers {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export type BtcFeeTier = "fast" | "normal" | "slow";

/**
 * Pick a sat/vB fee rate from the recommended tiers. Always floored at the
 * node's `minimumFee` (and at 1) so a quiet-mempool "0" tier can never produce
 * a transaction that relays nowhere.
 */
export function selectBtcFeeRate(fees: BtcFeeTiers, tier: BtcFeeTier): number {
  const picked =
    tier === "fast"
      ? fees.fastestFee
      : tier === "slow"
        ? fees.hourFee
        : fees.halfHourFee;
  return Math.max(picked, fees.minimumFee, 1);
}

/**
 * EIP-1559 fee parameters from a node's `eth_gasPrice` + priority-fee reading.
 *
 * `maxPriorityFeePerGas` is the tip paid to the validator. `maxFeePerGas` is the
 * absolute ceiling (base fee + tip the sender will tolerate). We set the ceiling
 * to `gasPrice + priority`, which gives headroom for the base fee to rise a
 * block or two before the tx stalls — while guaranteeing the network invariant
 * `maxFeePerGas >= maxPriorityFeePerGas` always holds (gasPrice is never
 * negative). The actual amount paid is still only `base + min(tip, ceiling-base)`,
 * so the headroom is a safety margin, not an overpayment.
 */
export function deriveEthFeeParams(
  gasPriceWei: bigint,
  priorityFeeWei: bigint,
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const maxPriorityFeePerGas = priorityFeeWei < 0n ? 0n : priorityFeeWei;
  const maxFeePerGas = (gasPriceWei < 0n ? 0n : gasPriceWei) + maxPriorityFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

/** Chain id for the EIP-155 / EIP-1559 envelope. Sepolia is our testnet. */
export function ethChainId(network: "mainnet" | "testnet"): bigint {
  return network === "mainnet" ? 1n : 11155111n;
}
