import { describe, it, expect } from 'vitest';
import { mnemonicToSeed } from '../seed';
import {
  deriveAddress,
  deriveAccount,
  derivePrivateKey,
  deriveAddressFromMnemonic,
  ethAddressFromPublicKey,
} from '../wallet';
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * The canonical BIP-39 test mnemonic (entropy = all zeros, valid checksum).
 * Its derived addresses are published at iancoleman.io/bip39 and reproduced by
 * every standard wallet — so matching them proves Auth Box's wallet derivation
 * is INTEROPERABLE, not just internally consistent.
 */
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeed(TEST_MNEMONIC);

describe('wallet — external interoperability anchors', () => {
  // These three are the most-cited public vectors for this mnemonic. If any
  // breaks, the wallet is no longer importable into MetaMask/Electrum/Ledger.
  it('BTC native segwit (BIP-84) m/84\'/0\'/0\'/0/0', () => {
    expect(deriveAddress(seed, 'btc').address).toBe(
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    );
  });

  it('BTC legacy (BIP-44) m/44\'/0\'/0\'/0/0', () => {
    expect(deriveAddress(seed, 'btc', { scriptType: 'p2pkh' }).address).toBe(
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
    );
  });

  it('ETH (BIP-44) m/44\'/60\'/0\'/0/0 with EIP-55 checksum', () => {
    expect(deriveAddress(seed, 'eth').address).toBe(
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    );
  });

  it('BIP-84 account xpub is the standard watch-only descriptor', () => {
    expect(deriveAccount(seed, 'btc').xpub).toBe(
      'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V',
    );
  });
});

describe('wallet — regression vectors (receive/change/account/testnet)', () => {
  it('BTC receive index 1', () => {
    expect(deriveAddress(seed, 'btc', { index: 1 }).address).toBe(
      'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
    );
  });

  it('BTC change chain (change=1)', () => {
    expect(deriveAddress(seed, 'btc', { change: 1 }).address).toBe(
      'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
    );
  });

  it('BTC testnet uses coin_type 1\' and tb1 prefix', () => {
    const a = deriveAddress(seed, 'btc', { network: 'testnet' });
    expect(a.address).toBe('tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl');
    expect(a.path).toBe("m/84'/1'/0'/0/0");
  });

  it('ETH receive index 1', () => {
    expect(deriveAddress(seed, 'eth', { index: 1 }).address).toBe(
      '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
    );
  });

  it('ETH account 1', () => {
    expect(deriveAddress(seed, 'eth', { account: 1 }).address).toBe(
      '0x78839F6054d7ed13918bAe0473BA31b1Ca9D7265',
    );
  });
});

describe('wallet — structural guarantees', () => {
  it('derivation is deterministic (same seed → same address)', () => {
    expect(deriveAddress(seed, 'btc').address).toBe(deriveAddress(seed, 'btc').address);
    expect(deriveAddress(seed, 'eth').address).toBe(deriveAddress(seed, 'eth').address);
  });

  it('reports the correct full derivation path and script type', () => {
    const btc = deriveAddress(seed, 'btc', { account: 2, change: 1, index: 5 });
    expect(btc.path).toBe("m/84'/0'/2'/1/5");
    expect(btc.scriptType).toBe('p2wpkh');
    const legacy = deriveAddress(seed, 'btc', { scriptType: 'p2pkh' });
    expect(legacy.path).toBe("m/44'/0'/0'/0/0");
    const eth = deriveAddress(seed, 'eth');
    expect(eth.path).toBe("m/44'/60'/0'/0/0");
    expect(eth.scriptType).toBeUndefined();
  });

  it('private key is 32 bytes and matches the derived public key', () => {
    const priv = derivePrivateKey(seed, 'eth');
    expect(priv).toBeInstanceOf(Uint8Array);
    expect(priv.length).toBe(32);
    // The public key recomputed from the private key must reproduce the address.
    const pub = secp256k1.getPublicKey(priv, true);
    expect(ethAddressFromPublicKey(pub)).toBe(deriveAddress(seed, 'eth').address);
  });

  it('EIP-55 checksum mixes case (not all-lowercase)', () => {
    const addr = deriveAddress(seed, 'eth').address;
    expect(addr).not.toBe(addr.toLowerCase());
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('mnemonic convenience path equals seed path', () => {
    expect(deriveAddressFromMnemonic(TEST_MNEMONIC, 'btc').address).toBe(
      deriveAddress(seed, 'btc').address,
    );
  });
});
