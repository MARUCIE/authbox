/**
 * Live BTC TESTNET send proof — exercises the EXACT @authbox/crypto path the
 * wallet Send dialog uses (gather UTXOs -> buildBtcTransaction signs client-side
 * -> broadcast rawTxHex), end-to-end, against the real network. The dialog's
 * React rendering was already visually verified; this proves the functional
 * build->sign->broadcast->on-chain chain that a long browser session kept
 * dropping. Self-send to the canonical address (funds stay recoverable; testnet
 * = no real value). Run: `npx tsx scripts/live-testnet-send.ts`.
 */
import {
  setWordlist,
  ENGLISH_WORDLIST,
  mnemonicToSeed,
  deriveAddress,
  buildBtcTransaction,
  type BtcSpendableUtxo,
} from '@authbox/crypto';

setWordlist(ENGLISH_WORDLIST);

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TESTNET = 'https://mempool.space/testnet/api';
const MAINNET = 'https://mempool.space/api';
const ADDR = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl'; // m/84'/1'/0'/0/0
const AMOUNT_SATS = 2000n;

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function main() {
  const seed = mnemonicToSeed(PHRASE);

  // 1. Sanity: the canonical seed must derive the funded address (else we'd
  //    sign with the wrong key — the funds-critical invariant).
  const recv = deriveAddress(seed, 'btc', {
    account: 0, change: 0, index: 0, network: 'testnet', scriptType: 'p2wpkh',
  });
  if (recv.address !== ADDR) throw new Error(`derivation mismatch: ${recv.address} != ${ADDR}`);
  console.log('OK derivation:', recv.address, '==', ADDR);

  // 2. Live UTXOs; pick one confirmed UTXO that comfortably covers amount+fee.
  const all = await getJSON<Array<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }>>(
    `${TESTNET}/address/${ADDR}/utxo`,
  );
  const confirmed = all.filter((u) => u.status.confirmed).sort((a, b) => a.value - b.value);
  const pick = confirmed.find((u) => u.value >= 3000);
  if (!pick) throw new Error(`no single confirmed UTXO >= 3000 sat (have ${confirmed.length})`);
  console.log('OK picked UTXO:', `${pick.txid.slice(0, 16)}…:${pick.vout}`, '=', pick.value, 'sat');
  const utxos: BtcSpendableUtxo[] = [
    { txid: pick.txid, vout: pick.vout, value: BigInt(pick.value), account: 0, change: 0, index: 0 },
  ];

  // 3. Fee rate: testnet endpoint -> mainnet fallback (mirrors the API fix).
  let feeRate = 2;
  try {
    const f = await getJSON<{ halfHourFee: number }>(`${TESTNET}/v1/fees/recommended`);
    feeRate = Math.max(f.halfHourFee, 2);
    console.log('OK fee from testnet:', feeRate, 'sat/vB');
  } catch {
    const f = await getJSON<{ halfHourFee: number }>(`${MAINNET}/v1/fees/recommended`);
    feeRate = Math.max(f.halfHourFee, 2);
    console.log('OK fee via mainnet fallback (testnet down):', feeRate, 'sat/vB');
  }

  // 4. Change address (internal chain) + build + sign — all client-side.
  const changeAddress = deriveAddress(seed, 'btc', {
    account: 0, change: 1, index: 0, network: 'testnet', scriptType: 'p2wpkh',
  }).address;
  const signed = buildBtcTransaction(seed, {
    utxos, to: ADDR, amountSats: AMOUNT_SATS, changeAddress,
    feeRateSatPerVb: feeRate, network: 'testnet', scriptType: 'p2wpkh',
  });
  console.log('OK signed:', { txid: signed.txid, fee: String(signed.fee), vsize: signed.vsize, hexLen: signed.hex.length });

  // 5. Broadcast the signed rawTxHex (same upstream the API relays to).
  const r = await fetch(`${TESTNET}/tx`, { method: 'POST', body: signed.hex });
  const body = (await r.text()).trim();
  console.log('BROADCAST HTTP', r.status, '| body:', body);
  if (r.ok) {
    console.log('\nBROADCAST_TXID=' + body);
    console.log('EXPLORER=https://mempool.space/testnet/tx/' + body);
  } else {
    console.log('\nBROADCAST_FAILED (upstream reason above — informative for the relay error path)');
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
