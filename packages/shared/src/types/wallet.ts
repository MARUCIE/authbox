/**
 * Crypto wallet types (watch-only wire contract).
 *
 * These describe what the SERVER sees: account descriptors (xpub + derivation
 * metadata) and derived addresses. No field here can hold a private key or a
 * seed — the schema is watch-only by construction. Private keys live only on
 * the client, derived on demand from the BIP-39 seed (see @authbox/crypto
 * `wallet.ts`).
 *
 * Balances are decimal STRINGS in the coin's smallest unit (satoshi / wei).
 * wei exceeds Number.MAX_SAFE_INTEGER, so numbers are never safe on the wire.
 *
 * Enum vocabularies (Coin / BtcScriptType / WalletNetwork) MUST stay identical
 * across this file, the Zod schemas in `validation/index.ts`, and the Go API
 * (services/api). A cross-layer parity test guards the drift that shipped two
 * release-blockers in the 2026-06-02 acceptance pass.
 */

export enum Coin {
  BTC = 'btc',
  ETH = 'eth',
}

export enum BtcScriptType {
  P2WPKH = 'p2wpkh', // native segwit (default)
  P2PKH = 'p2pkh', // legacy
}

export enum WalletNetwork {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

export interface WalletAccount {
  id: string;
  userId: string;
  coin: Coin;
  network: WalletNetwork;
  /** BTC only. */
  scriptType?: BtcScriptType;
  accountIndex: number;
  /** Account-level BIP-44/84 path, e.g. m/84'/0'/0' */
  derivationPath: string;
  /** Extended public key. Watch-only: enumerates addresses, cannot spend. */
  xpub: string;
  label: string;
  /** Smallest unit (satoshi / wei) as a decimal string. */
  cachedBalance: string;
  cachedBalanceAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletAddress {
  id: string;
  accountId: string;
  address: string;
  /** Full derivation path, e.g. m/84'/0'/0'/0/0 */
  derivationPath: string;
  change: 0 | 1;
  addressIndex: number;
  /** Compressed public key, hex. Never a private key. */
  publicKey: string;
  cachedBalance: string;
  createdAt: string;
}

export interface CreateWalletAccountRequest {
  coin: Coin;
  network?: WalletNetwork;
  scriptType?: BtcScriptType;
  accountIndex?: number;
  derivationPath: string;
  xpub: string;
  label?: string;
}

export interface WalletBalance {
  /** Confirmed balance, smallest unit, decimal string. */
  confirmed: string;
  /** Unconfirmed / mempool balance, smallest unit, decimal string. */
  unconfirmed: string;
  /** Block height the balance was observed at, if known. */
  asOfHeight?: number;
}
