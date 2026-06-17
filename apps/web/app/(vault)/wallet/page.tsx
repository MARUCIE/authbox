'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVaultStore } from '@/lib/vault-store';
import { walletApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/vault/dialog';
import {
  deriveAccount,
  deriveAddress,
  validateMnemonic,
  mnemonicToSeed,
  setWordlist,
  ENGLISH_WORDLIST,
  buildBtcTransaction,
  buildEthTransaction,
  parseAmount,
  selectBtcFeeRate,
  deriveEthFeeParams,
  ethChainId,
  type Coin,
  type BtcScriptType,
  type WalletNetwork,
  type BtcSpendableUtxo,
  type BtcFeeTier,
} from '@authbox/crypto';

// The wallet derives standard BIP-32/44/84 keys from the SAME 24-word seed that
// protects the vault. Private keys never leave the browser; only the account
// xpub and public addresses are sent to the (watch-only) server. The seed is
// requested on demand for each derivation and is never stored.
setWordlist(ENGLISH_WORDLIST);

interface WalletAccount {
  id: string;
  coin: string;
  network: string;
  scriptType?: string;
  accountIndex: number;
  derivationPath: string;
  xpub: string;
  label: string;
  cachedBalance: string;
  createdAt: string;
  updatedAt: string;
}

interface WalletAddress {
  id: string;
  address: string;
  derivationPath: string;
  change: number;
  addressIndex: number;
  publicKey: string;
  cachedBalance: string;
}

// ─── Coin presentation ────────────────────────────────────────────────────────
// decimals = smallest-unit exponent (sats=8, wei=18); accent = brand color.
const COIN_META: Record<Coin, { label: string; unit: string; decimals: number; accent: string; glyph: string }> = {
  btc: { label: 'Bitcoin', unit: 'BTC', decimals: 8, accent: '#F7931A', glyph: '₿' },
  eth: { label: 'Ethereum', unit: 'ETH', decimals: 18, accent: '#627EEA', glyph: 'Ξ' },
};

const SCRIPT_LABEL: Record<string, string> = {
  p2wpkh: 'Native SegWit',
  p2pkh: 'Legacy',
};

/**
 * Format a smallest-unit integer string (sats / wei) as a decimal amount.
 * BigInt-based so wei (up to ~1.2e29) never loses precision through a float.
 */
function formatUnits(value: string, decimals: number, maxFrac = 8): string {
  let v: bigint;
  try {
    v = BigInt(value || '0');
  } catch {
    return '0';
  }
  const negative = v < 0n;
  if (negative) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const fraction = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Block-explorer deep link for a broadcast tx, per coin + network. */
function explorerTxUrl(coin: string, network: string, txid: string): string {
  if (coin === 'btc') {
    return network === 'testnet'
      ? `https://mempool.space/testnet/tx/${txid}`
      : `https://mempool.space/tx/${txid}`;
  }
  return network === 'testnet'
    ? `https://sepolia.etherscan.io/tx/${txid}`
    : `https://etherscan.io/tx/${txid}`;
}

// A fully-signed transaction held in memory after the review step. Inert until
// the user confirms broadcast — a signed-but-unsent tx does nothing on-chain.
interface SendReview {
  rawTxHex: string;
  to: string;
  amount: string; // formatted display amount (coin units)
  fee: string; // formatted network fee (coin units)
  total: string; // formatted amount + fee
  feeDetail: string; // e.g. "3 sat/vB · 141 vbytes" or "21000 gas · 31.5 gwei max"
}

type DialogMode = 'closed' | 'add' | 'send';

export default function WalletPage() {
  const sessionToken = useVaultStore((s) => s.sessionToken);

  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<WalletAddress[]>([]);
  const [dialog, setDialog] = useState<DialogMode>('closed');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-account form
  const [coin, setCoin] = useState<Coin>('btc');
  const [network, setNetwork] = useState<WalletNetwork>('mainnet');
  const [scriptType, setScriptType] = useState<BtcScriptType>('p2wpkh');
  const [accountIndex, setAccountIndex] = useState(0);
  const [label, setLabel] = useState('');
  const [mnemonic, setMnemonic] = useState('');

  // Live balance (detail panel)
  const [liveBalance, setLiveBalance] = useState<{ confirmed: string; unconfirmed: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Derive-next-address inline prompt
  const [deriveMnemonic, setDeriveMnemonic] = useState('');
  const [showDerive, setShowDerive] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendFeeTier, setSendFeeTier] = useState<BtcFeeTier>('normal'); // BTC only
  const [sendMnemonic, setSendMnemonic] = useState('');
  const [sendReview, setSendReview] = useState<SendReview | null>(null);
  const [sendMainnetConfirm, setSendMainnetConfirm] = useState(false);
  const [sendResult, setSendResult] = useState<{ txid: string } | null>(null);
  const [sending, setSending] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await walletApi.listAccounts(sessionToken);
      setAccounts(res.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet accounts');
    } finally {
      setLoaded(true);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const fetchAddresses = useCallback(
    async (accountId: string) => {
      if (!sessionToken) return;
      try {
        const res = await walletApi.listAddresses(sessionToken, accountId);
        setAddresses(res.addresses ?? []);
      } catch {
        setAddresses([]);
      }
    },
    [sessionToken],
  );

  useEffect(() => {
    if (selectedId) {
      fetchAddresses(selectedId);
      setLiveBalance(null);
      setShowDerive(false);
      setDeriveMnemonic('');
    }
  }, [selectedId, fetchAddresses]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  function resetAddForm() {
    setCoin('btc');
    setNetwork('mainnet');
    setScriptType('p2wpkh');
    setAccountIndex(0);
    setLabel('');
    setMnemonic('');
  }

  async function handleAddAccount() {
    if (!sessionToken) return;
    const phrase = mnemonic.trim().replace(/\s+/g, ' ');
    if (!validateMnemonic(phrase)) {
      setError('Invalid recovery phrase. Enter your 12/24-word seed exactly as written.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Derive entirely client-side. `seed` and the derived private material are
      // local to this function and never sent anywhere.
      const seed = mnemonicToSeed(phrase);
      const isBtc = coin === 'btc';
      const account = deriveAccount(seed, coin, {
        account: accountIndex,
        network,
        ...(isBtc ? { scriptType } : {}),
      });
      const first = deriveAddress(seed, coin, {
        account: accountIndex,
        change: 0,
        index: 0,
        network,
        ...(isBtc ? { scriptType } : {}),
      });

      const created = await walletApi.createAccount(sessionToken, {
        coin,
        network,
        accountIndex,
        derivationPath: account.path,
        xpub: account.xpub,
        label: label.trim() || `${COIN_META[coin].label} Account ${accountIndex}`,
        ...(isBtc ? { scriptType } : {}),
      });

      await walletApi.addAddress(sessionToken, created.id, {
        address: first.address,
        derivationPath: first.path,
        change: 0,
        addressIndex: 0,
        publicKey: first.publicKey,
      });

      setMnemonic(''); // drop the secret from React state immediately
      resetAddForm();
      setDialog('closed');
      await fetchAccounts();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add wallet account');
    } finally {
      setMnemonic('');
      setBusy(false);
    }
  }

  async function handleRefreshBalance() {
    if (!sessionToken || !selected) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await walletApi.balance(sessionToken, selected.id);
      setLiveBalance({ confirmed: res.confirmed, unconfirmed: res.unconfirmed });
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh balance');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeriveNext() {
    if (!sessionToken || !selected) return;
    const phrase = deriveMnemonic.trim().replace(/\s+/g, ' ');
    if (!validateMnemonic(phrase)) {
      setError('Invalid recovery phrase.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextIndex =
        addresses.filter((a) => a.change === 0).reduce((max, a) => Math.max(max, a.addressIndex), -1) + 1;
      const seed = mnemonicToSeed(phrase);
      const isBtc = selected.coin === 'btc';
      const next = deriveAddress(seed, selected.coin as Coin, {
        account: selected.accountIndex,
        change: 0,
        index: nextIndex,
        network: selected.network as WalletNetwork,
        ...(isBtc && selected.scriptType ? { scriptType: selected.scriptType as BtcScriptType } : {}),
      });
      await walletApi.addAddress(sessionToken, selected.id, {
        address: next.address,
        derivationPath: next.path,
        change: 0,
        addressIndex: nextIndex,
        publicKey: next.publicKey,
      });
      setDeriveMnemonic('');
      setShowDerive(false);
      await fetchAddresses(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to derive address');
    } finally {
      setDeriveMnemonic('');
      setBusy(false);
    }
  }

  function resetSendForm() {
    setSendTo('');
    setSendAmount('');
    setSendFeeTier('normal');
    setSendMnemonic('');
    setSendReview(null);
    setSendMainnetConfirm(false);
    setSendResult(null);
  }

  // Stage 1: validate, gather chain data, build + SIGN the tx client-side, and
  // surface the exact fee/total for review. Does NOT broadcast. The signed tx is
  // held in `sendReview` until the user explicitly confirms.
  async function handleSendReview() {
    if (!sessionToken || !selected) return;
    const phrase = sendMnemonic.trim().replace(/\s+/g, ' ');
    if (!validateMnemonic(phrase)) {
      setError('Invalid recovery phrase. Enter your seed exactly as written.');
      return;
    }
    const isBtc = selected.coin === 'btc';
    const net = selected.network as WalletNetwork;
    const meta = COIN_META[selected.coin as Coin];
    setSending(true);
    setError(null);
    try {
      const to = sendTo.trim();
      if (!to) throw new Error('Enter a recipient address');
      const amount = parseAmount(sendAmount, meta.decimals); // throws on bad input
      const seed = mnemonicToSeed(phrase);

      let rawTxHex: string;
      let feeUnits: bigint;
      let feeDetail: string;

      if (isBtc) {
        const scriptType = (selected.scriptType as BtcScriptType) || 'p2wpkh';
        const fees = await walletApi.btcFees(sessionToken, net);
        const feeRate = selectBtcFeeRate(fees, sendFeeTier);
        // Gather UTXOs across EVERY receive address, tagging each with the
        // address's derivation (change/index) so the signer derives the correct
        // key per input. btcUtxos returns only {txid,vout,value} — the tag must
        // come from the address we queried, not the UTXO payload.
        const addrRes = await walletApi.listAddresses(sessionToken, selected.id);
        const utxos: BtcSpendableUtxo[] = [];
        for (const a of addrRes.addresses) {
          const u = await walletApi.btcUtxos(sessionToken, a.address, net);
          for (const x of u.utxos) {
            utxos.push({
              txid: x.txid,
              vout: x.vout,
              value: BigInt(x.value),
              account: selected.accountIndex,
              change: a.change === 1 ? 1 : 0,
              index: a.addressIndex,
            });
          }
        }
        if (utxos.length === 0) throw new Error('No spendable funds on this account');
        const changeAddress = deriveAddress(seed, 'btc', {
          account: selected.accountIndex,
          change: 1,
          index: 0,
          network: net,
          scriptType,
        }).address;
        const signed = buildBtcTransaction(seed, {
          utxos,
          to,
          amountSats: amount,
          changeAddress,
          feeRateSatPerVb: feeRate,
          network: net,
          scriptType,
        });
        rawTxHex = signed.hex;
        feeUnits = signed.fee;
        feeDetail = `${feeRate} sat/vB · ${signed.vsize} vbytes`;
      } else {
        const sender = deriveAddress(seed, 'eth', {
          account: selected.accountIndex,
          change: 0,
          index: 0,
          network: net,
        }).address;
        const [{ nonce }, gas] = await Promise.all([
          walletApi.ethNonce(sessionToken, sender, net),
          walletApi.ethGas(sessionToken, net),
        ]);
        const { maxFeePerGas, maxPriorityFeePerGas } = deriveEthFeeParams(
          BigInt(gas.gasPrice),
          BigInt(gas.suggestedPriorityFee),
        );
        const gasLimit = 21000n; // plain value transfer
        const signed = buildEthTransaction(seed, {
          to,
          amountWei: amount,
          nonce: BigInt(nonce),
          gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          chainId: ethChainId(net),
          network: net,
        });
        rawTxHex = signed.hex;
        feeUnits = gasLimit * maxFeePerGas; // ceiling; actual paid is <= this
        feeDetail = `${gasLimit} gas · ${formatUnits(maxFeePerGas.toString(), 9, 4)} gwei max`;
      }

      const total = amount + feeUnits;
      setSendReview({
        rawTxHex,
        to,
        amount: formatUnits(amount.toString(), meta.decimals),
        fee: formatUnits(feeUnits.toString(), meta.decimals),
        total: formatUnits(total.toString(), meta.decimals),
        feeDetail,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare transaction');
    } finally {
      setSendMnemonic(''); // drop the seed once the tx is signed; never needed past here
      setSending(false);
    }
  }

  // Stage 2: broadcast the already-signed tx. The only network mutation in the
  // whole flow. Mainnet must have passed the double-confirm checkbox first.
  async function handleSendConfirm() {
    if (!sessionToken || !selected || !sendReview) return;
    setSending(true);
    setError(null);
    try {
      const res = await walletApi.broadcast(sessionToken, {
        coin: selected.coin as 'btc' | 'eth',
        network: selected.network as 'mainnet' | 'testnet',
        rawTxHex: sendReview.rawTxHex,
      });
      setSendResult({ txid: res.txid });
      setSendReview(null);
      await fetchAddresses(selected.id);
      await handleRefreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!sessionToken) return;
    try {
      await walletApi.deleteAccount(sessionToken, id);
      setSelectedId(null);
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const receiveAddress = addresses.find((a) => a.change === 0 && a.addressIndex === 0) ?? addresses[0] ?? null;

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Left: account list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
              Wallet
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} -- self-custodial, watch-only on the server
            </p>
          </div>
          <button
            onClick={() => {
              resetAddForm();
              setError(null);
              setDialog('add');
            }}
            className="btn-gradient px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Account
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg p-3 text-sm flex items-center justify-between gap-3"
            style={{ background: 'rgba(255, 180, 171, 0.12)', color: 'var(--destructive)' }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="underline shrink-0">
              dismiss
            </button>
          </div>
        )}

        {!loaded ? (
          <div className="space-y-1 flex-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg p-3 animate-pulse"
                style={{ background: 'var(--surface-low)', opacity: 1 - i * 0.25 }}
              >
                <div className="h-10 w-10 rounded-lg shrink-0" style={{ background: 'var(--surface-highest)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded" style={{ background: 'var(--surface-highest)' }} />
                  <div className="h-2.5 w-1/4 rounded" style={{ background: 'var(--surface-highest)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center flex-1 flex flex-col items-center justify-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl mb-4"
              style={{ background: 'var(--primary-container)', color: 'var(--primary)' }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2">No wallet accounts yet</h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-4 max-w-sm">
              Your 24-word vault seed is also a crypto wallet. Add a Bitcoin or Ethereum account -- keys are derived in
              your browser, the server only ever watches public balances.
            </p>
            <Button onClick={() => setDialog('add')}>Add Account</Button>
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {accounts.map((account) => {
              const meta = COIN_META[account.coin as Coin] ?? COIN_META.btc;
              const active = account.id === selectedId;
              return (
                <button
                  key={account.id}
                  onClick={() => setSelectedId(account.id)}
                  className="w-full flex items-center gap-3 rounded-lg p-3 text-left transition-all"
                  style={{
                    background: active ? 'var(--surface-highest)' : 'transparent',
                    border: active ? '1px solid var(--ghost-border)' : '1px solid transparent',
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-semibold shrink-0"
                    style={{ background: `${meta.accent}1f`, color: meta.accent }}
                  >
                    {meta.glyph}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{account.label}</p>
                      {account.network === 'testnet' && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-md"
                          style={{ background: 'rgba(255, 183, 125, 0.15)', color: 'var(--secondary)' }}
                        >
                          testnet
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">
                      {meta.label}
                      {account.scriptType ? ` · ${SCRIPT_LABEL[account.scriptType] ?? account.scriptType}` : ''}
                      <span className="font-mono"> · {account.derivationPath}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-medium text-sm tabular-nums">
                      {formatUnits(account.cachedBalance, meta.decimals)} {meta.unit}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: account detail */}
      {selected &&
        (() => {
          const meta = COIN_META[selected.coin as Coin] ?? COIN_META.btc;
          const confirmed = liveBalance?.confirmed ?? selected.cachedBalance;
          return (
            <aside className="w-96 shrink-0 pl-6 flex flex-col" style={{ borderLeft: '1px solid var(--ghost-border)' }}>
              <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-base font-semibold shrink-0"
                    style={{ background: `${meta.accent}1f`, color: meta.accent }}
                  >
                    {meta.glyph}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{selected.label}</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {meta.label} -- {selected.network}
                      {selected.scriptType ? ` -- ${selected.scriptType}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg shrink-0"
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 py-4 space-y-5 overflow-y-auto">
                {/* Balance */}
                <div className="rounded-xl p-4" style={{ background: 'var(--surface-low)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                      Balance
                      <span
                        className="normal-case tracking-normal px-1.5 py-0.5 rounded text-[10px]"
                        style={
                          liveBalance
                            ? { background: 'var(--tertiary-container)', color: 'var(--tertiary)' }
                            : { background: 'var(--surface-highest)', color: 'var(--muted-foreground)' }
                        }
                      >
                        {liveBalance ? 'live' : 'cached'}
                      </span>
                    </span>
                    <button
                      onClick={handleRefreshBalance}
                      disabled={refreshing}
                      className="text-xs flex items-center gap-1 text-[var(--primary)] hover:opacity-80 disabled:opacity-50"
                    >
                      <svg
                        className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      {refreshing ? 'Refreshing' : 'Refresh'}
                    </button>
                  </div>
                  <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-heading)' }}>
                    {formatUnits(confirmed, meta.decimals)} <span className="text-base font-medium">{meta.unit}</span>
                  </p>
                  {liveBalance && BigInt(liveBalance.unconfirmed || '0') !== 0n && (
                    <p className="text-xs text-[var(--secondary)] mt-1">
                      {formatUnits(liveBalance.unconfirmed, meta.decimals)} {meta.unit} unconfirmed
                    </p>
                  )}
                </div>

                {/* Send */}
                <button
                  onClick={() => {
                    resetSendForm();
                    setError(null);
                    setDialog('send');
                  }}
                  className="btn-gradient w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                  Send {meta.unit}
                </button>

                {/* Receive address */}
                {receiveAddress && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        Receive Address
                      </label>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: `${meta.accent}1f`, color: meta.accent }}
                      >
                        {meta.unit} -- {selected.network}
                      </span>
                    </div>
                    <button
                      onClick={() => copy(receiveAddress.address)}
                      className="mt-1.5 w-full flex items-center gap-2 rounded-lg p-3 text-left transition-colors hash-block"
                    >
                      <code className="text-xs font-mono break-all flex-1">{receiveAddress.address}</code>
                      <span className="text-xs shrink-0" style={{ color: 'var(--primary)' }}>
                        {copied === receiveAddress.address ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                      Share to receive {meta.label}. Only send {meta.unit} on {selected.network} to this address.
                    </p>
                  </div>
                )}

                {/* Addresses list */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                      Addresses ({addresses.length})
                    </label>
                    <button
                      onClick={() => setShowDerive((v) => !v)}
                      className="text-xs text-[var(--primary)] hover:opacity-80"
                    >
                      {showDerive ? 'Cancel' : '+ Derive next'}
                    </button>
                  </div>

                  {showDerive && (
                    <div className="rounded-lg border border-[var(--border)] p-3 mb-2 space-y-2">
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Enter your recovery phrase to derive the next receive address. It is used locally and never sent.
                      </p>
                      <textarea
                        value={deriveMnemonic}
                        onChange={(e) => setDeriveMnemonic(e.target.value)}
                        rows={2}
                        placeholder="word1 word2 word3 ..."
                        className="flex w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                      />
                      <Button size="sm" onClick={handleDeriveNext} disabled={busy || !deriveMnemonic.trim()}>
                        {busy ? 'Deriving...' : 'Derive address'}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{ background: 'var(--surface-low)' }}
                      >
                        <code className="text-xs font-mono truncate flex-1">{addr.address}</code>
                        <span className="text-xs text-[var(--muted-foreground)] tabular-nums shrink-0">
                          {formatUnits(addr.cachedBalance, meta.decimals)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* xpub */}
                <div>
                  <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    Extended Public Key (xpub)
                  </label>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1 mb-1.5">
                    Watch-only. Lets the server scan balances, never spend.
                  </p>
                  <button
                    onClick={() => copy(selected.xpub)}
                    className="w-full flex items-center gap-2 rounded-lg p-3 text-left hash-block"
                  >
                    <code className="text-xs font-mono break-all flex-1">{selected.xpub}</code>
                    <span className="text-xs shrink-0" style={{ color: 'var(--primary)' }}>
                      {copied === selected.xpub ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)]">
                <Button
                  onClick={() => handleDelete(selected.id)}
                  variant="ghost"
                  className="w-full text-[var(--destructive)]"
                >
                  Remove account
                </Button>
              </div>
            </aside>
          );
        })()}

      {/* Add account dialog */}
      <Dialog open={dialog === 'add'} onClose={() => setDialog('closed')} title="Add Wallet Account">
        <div className="flex flex-col gap-4">
          {/* Coin */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Coin</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(COIN_META) as Coin[]).map((c) => {
                const meta = COIN_META[c];
                const active = coin === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCoin(c)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-all"
                    style={{
                      background: active ? `${meta.accent}1f` : 'transparent',
                      border: `1px solid ${active ? meta.accent : 'var(--border)'}`,
                      color: active ? meta.accent : 'var(--foreground)',
                    }}
                  >
                    <span className="text-base font-semibold">{meta.glyph}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network + script type (BTC) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wallet-network" className="text-sm font-medium">
                Network
              </label>
              <select
                id="wallet-network"
                value={network}
                onChange={(e) => setNetwork(e.target.value as WalletNetwork)}
                className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
              >
                <option value="mainnet">Mainnet</option>
                <option value="testnet">Testnet</option>
              </select>
            </div>
            {coin === 'btc' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="wallet-script" className="text-sm font-medium">
                  Address type
                </label>
                <select
                  id="wallet-script"
                  value={scriptType}
                  onChange={(e) => setScriptType(e.target.value as BtcScriptType)}
                  className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                >
                  <option value="p2wpkh">Native SegWit (bc1)</option>
                  <option value="p2pkh">Legacy (1...)</option>
                </select>
              </div>
            )}
          </div>

          {/* Label + account index */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label htmlFor="wallet-label" className="text-sm font-medium">
                Label
              </label>
              <Input
                id="wallet-label"
                placeholder={`${COIN_META[coin].label} Account`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wallet-account-index" className="text-sm font-medium">
                Account #
              </label>
              <Input
                id="wallet-account-index"
                type="number"
                min={0}
                value={accountIndex}
                onChange={(e) => setAccountIndex(Math.max(0, parseInt(e.target.value || '0', 10)))}
              />
            </div>
          </div>

          {/* Mnemonic */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wallet-mnemonic" className="text-sm font-medium">
              Recovery phrase
            </label>
            <textarea
              id="wallet-mnemonic"
              placeholder="Enter your 12 or 24-word seed phrase"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              className="flex w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm font-mono placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            />
            <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
              <svg
                className="h-3.5 w-3.5 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              Derived locally in your browser. Only the public xpub and address are sent to the server.
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialog('closed')}>
              Cancel
            </Button>
            <Button onClick={handleAddAccount} disabled={busy || !mnemonic.trim()}>
              {busy ? 'Deriving...' : 'Add account'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Send dialog */}
      <Dialog
        open={dialog === 'send'}
        onClose={() => {
          setDialog('closed');
          resetSendForm();
        }}
        title={selected ? `Send ${COIN_META[selected.coin as Coin].unit}` : 'Send'}
      >
        {selected &&
          (() => {
            const meta = COIN_META[selected.coin as Coin];
            const isMainnet = selected.network === 'mainnet';
            const isBtc = selected.coin === 'btc';

            // ── Success ──────────────────────────────────────────────────────
            if (sendResult) {
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center text-center gap-2 py-2">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ background: 'var(--tertiary-container)', color: 'var(--tertiary)' }}
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    <h4 className="font-semibold">Transaction broadcast</h4>
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      Your {meta.unit} send is propagating on {selected.network}.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                      Transaction ID
                    </label>
                    <button
                      onClick={() => copy(sendResult.txid)}
                      className="mt-1.5 w-full flex items-center gap-2 rounded-lg p-3 text-left hash-block"
                    >
                      <code className="text-xs font-mono break-all flex-1">{sendResult.txid}</code>
                      <span className="text-xs shrink-0" style={{ color: 'var(--primary)' }}>
                        {copied === sendResult.txid ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                    <a
                      href={explorerTxUrl(selected.coin, selected.network, sendResult.txid)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs mt-1.5 inline-flex items-center gap-1"
                      style={{ color: 'var(--primary)' }}
                    >
                      View on block explorer &rarr;
                    </a>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => {
                        setDialog('closed');
                        resetSendForm();
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            }

            // ── Review (tx already signed, inert until confirm) ──────────────
            if (sendReview) {
              return (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-low)' }}>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                        To
                      </span>
                      <code className="text-xs font-mono break-all">{sendReview.to}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        Amount
                      </span>
                      <span className="text-sm tabular-nums">
                        {sendReview.amount} {meta.unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        Network fee
                      </span>
                      <span className="text-sm tabular-nums">
                        {sendReview.fee} {meta.unit}
                      </span>
                    </div>
                    <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {sendReview.total} {meta.unit}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {sendReview.feeDetail}
                    </p>
                  </div>

                  {isMainnet && (
                    <label
                      className="flex items-start gap-2 rounded-lg p-3 text-sm cursor-pointer"
                      style={{ background: 'rgba(255, 180, 171, 0.12)', color: 'var(--destructive)' }}
                    >
                      <input
                        type="checkbox"
                        checked={sendMainnetConfirm}
                        onChange={(e) => setSendMainnetConfirm(e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        This is a <strong>mainnet</strong> transaction moving real funds. It is irreversible. I have
                        verified the recipient and amount.
                      </span>
                    </label>
                  )}

                  <div className="flex gap-3 justify-end pt-2">
                    <Button variant="outline" onClick={() => setSendReview(null)} disabled={sending}>
                      Back
                    </Button>
                    <Button onClick={handleSendConfirm} disabled={sending || (isMainnet && !sendMainnetConfirm)}>
                      {sending ? 'Broadcasting...' : 'Confirm & send'}
                    </Button>
                  </div>
                </div>
              );
            }

            // ── Form ─────────────────────────────────────────────────────────
            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded font-medium" style={{ background: `${meta.accent}1f`, color: meta.accent }}>
                    {meta.unit}
                  </span>
                  <span
                    className="px-2 py-1 rounded font-medium"
                    style={
                      isMainnet
                        ? { background: 'rgba(255, 180, 171, 0.12)', color: 'var(--destructive)' }
                        : { background: 'var(--tertiary-container)', color: 'var(--tertiary)' }
                    }
                  >
                    {selected.network}
                  </span>
                  {!isMainnet && <span style={{ color: 'var(--muted-foreground)' }}>Safe testnet -- no real value</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="send-to" className="text-sm font-medium">
                    Recipient address
                  </label>
                  <Input
                    id="send-to"
                    placeholder={isBtc ? 'bc1... / tb1...' : '0x...'}
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="send-amount" className="text-sm font-medium">
                    Amount ({meta.unit})
                  </label>
                  <Input
                    id="send-amount"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                  />
                </div>

                {isBtc && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="send-fee" className="text-sm font-medium">
                      Fee priority
                    </label>
                    <select
                      id="send-fee"
                      value={sendFeeTier}
                      onChange={(e) => setSendFeeTier(e.target.value as BtcFeeTier)}
                      className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                    >
                      <option value="fast">Fast (next block)</option>
                      <option value="normal">Normal (~30 min)</option>
                      <option value="slow">Economy (~1 hr)</option>
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="send-mnemonic" className="text-sm font-medium">
                    Recovery phrase
                  </label>
                  <textarea
                    id="send-mnemonic"
                    placeholder="Enter your 12 or 24-word seed phrase to sign"
                    value={sendMnemonic}
                    onChange={(e) => setSendMnemonic(e.target.value)}
                    rows={3}
                    autoComplete="off"
                    spellCheck={false}
                    className="flex w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm font-mono placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  />
                  <p className="text-xs flex items-start gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
                    <svg className="h-3.5 w-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                    Used locally to sign. Only the signed transaction is sent; your seed never leaves the browser.
                  </p>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialog('closed');
                      resetSendForm();
                    }}
                    disabled={sending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendReview}
                    disabled={sending || !sendTo.trim() || !sendAmount.trim() || !sendMnemonic.trim()}
                  >
                    {sending ? 'Preparing...' : 'Review'}
                  </Button>
                </div>
              </div>
            );
          })()}
      </Dialog>
    </div>
  );
}
