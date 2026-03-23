/**
 * Arweave Permanent Vault Storage — the "Unstoppable" layer.
 *
 * Encrypts vault data with seed-derived key, uploads to Arweave for
 * permanent storage. Once uploaded, data can NEVER be deleted — it persists
 * as long as the Arweave network exists.
 *
 * Recovery flow (even if Auth Box disappears):
 *   1. User has seed phrase (24 words)
 *   2. Derive vault encryption key from seed
 *   3. Query Arweave for vault blobs tagged with user's public key hash
 *   4. Download encrypted blob
 *   5. Decrypt locally → all passwords restored
 *
 * Cost: ~$0.005/KB one-time payment for permanent storage.
 */

import Arweave from 'arweave';
import { sha256 } from '@noble/hashes/sha256';
import { encryptAES256GCM, decryptAES256GCM } from './aes-gcm';

// ─── Arweave Client ───────────────────────────────────────────────────────

const DEFAULT_ARWEAVE_CONFIG = {
  host: 'arweave.net',
  port: 443,
  protocol: 'https' as const,
};

let arweaveClient: Arweave | null = null;

function getArweave(): Arweave {
  if (!arweaveClient) {
    arweaveClient = Arweave.init(DEFAULT_ARWEAVE_CONFIG);
  }
  return arweaveClient;
}

/**
 * Override the default Arweave gateway (for testing or custom gateways).
 */
export function setArweaveGateway(config: { host: string; port: number; protocol: 'http' | 'https' }): void {
  arweaveClient = Arweave.init(config);
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface VaultArchiveResult {
  txId: string;           // Arweave transaction ID
  size: number;           // Encrypted blob size in bytes
  cost: string;           // Cost in AR tokens
  timestamp: number;      // Upload timestamp
}

export interface VaultArchiveMetadata {
  txId: string;
  version: number;        // Vault version (monotonically increasing)
  timestamp: number;
  size: number;
  checksum: string;       // SHA-256 of encrypted blob
}

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Derive a public identity hash from the vault key.
 * This is used as an Arweave tag to find the user's vault blobs
 * WITHOUT revealing the actual vault key.
 *
 * identityHash = SHA-256(SHA-256(vaultKey))
 * Double-hash prevents key recovery from the public tag.
 */
export function deriveIdentityHash(vaultKey: Uint8Array): string {
  const firstHash = sha256(vaultKey);
  const doubleHash = sha256(firstHash);
  const hex = bytesToHex(doubleHash);
  // Validate hex format before use in GraphQL queries
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('Identity hash derivation produced invalid hex');
  }
  return hex;
}

/**
 * Encrypt vault data and upload to Arweave for permanent storage.
 *
 * @param vaultKey - 32-byte vault encryption key (from seed derivation)
 * @param vaultData - Serialized vault data (JSON string or binary)
 * @param version - Vault version number (for ordering multiple uploads)
 * @param walletJWK - Arweave wallet JWK for signing the transaction
 * @returns Transaction ID and metadata
 */
export async function archiveVault(
  vaultKey: Uint8Array,
  vaultData: Uint8Array,
  version: number,
  walletJWK: JsonWebKey,
): Promise<VaultArchiveResult> {
  const arweave = getArweave();

  // 1. Encrypt vault data with AES-256-GCM
  const encrypted = await encryptAES256GCM(vaultKey, vaultData);

  // 2. Combine ciphertext + nonce + tag into single blob
  const blob = new Uint8Array(
    encrypted.nonce.length + encrypted.tag.length + encrypted.ciphertext.length,
  );
  blob.set(encrypted.nonce, 0);
  blob.set(encrypted.tag, encrypted.nonce.length);
  blob.set(encrypted.ciphertext, encrypted.nonce.length + encrypted.tag.length);

  // 3. Compute checksum of encrypted blob
  const checksum = bytesToHex(sha256(blob));

  // 4. Derive identity hash (public tag, does NOT reveal key)
  const identityHash = deriveIdentityHash(vaultKey);

  // 5. Create Arweave transaction
  const tx = await arweave.createTransaction({ data: blob }, walletJWK as any);

  // Tags for discovery (all public, no sensitive info)
  tx.addTag('App-Name', 'AuthBox');
  tx.addTag('App-Version', '5');
  tx.addTag('Content-Type', 'application/octet-stream');
  tx.addTag('Vault-Identity', identityHash);
  tx.addTag('Vault-Version', version.toString());
  tx.addTag('Vault-Checksum', checksum);
  tx.addTag('Encryption', 'AES-256-GCM');

  // 6. Sign and submit
  await arweave.transactions.sign(tx, walletJWK as any);
  const response = await arweave.transactions.post(tx);

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Arweave upload failed: ${response.status} ${response.statusText}`);
  }

  // 7. Get cost
  const cost = arweave.ar.winstonToAr(tx.reward);

  return {
    txId: tx.id,
    size: blob.length,
    cost,
    timestamp: Date.now(),
  };
}

/**
 * Retrieve and decrypt vault data from Arweave.
 *
 * @param vaultKey - 32-byte vault encryption key
 * @param txId - Arweave transaction ID of the vault blob
 * @returns Decrypted vault data
 */
export async function retrieveVault(
  vaultKey: Uint8Array,
  txId: string,
): Promise<Uint8Array> {
  const arweave = getArweave();

  // 1. Download encrypted blob
  const data = await arweave.transactions.getData(txId, { decode: true });
  const blob = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);

  // 2. Split blob into nonce (12) + tag (16) + ciphertext
  const nonceLen = 12;
  const tagLen = 16;
  const nonce = blob.slice(0, nonceLen);
  const tag = blob.slice(nonceLen, nonceLen + tagLen);
  const ciphertext = blob.slice(nonceLen + tagLen);

  // 3. Decrypt
  return decryptAES256GCM(vaultKey, { ciphertext, nonce, tag });
}

/**
 * Find the latest vault blob for a given identity on Arweave.
 * Uses GraphQL to query by tags.
 *
 * @param vaultKey - Used to derive identity hash for lookup
 * @returns List of vault archives sorted by version (newest first)
 */
export async function findVaultArchives(
  vaultKey: Uint8Array,
): Promise<VaultArchiveMetadata[]> {
  const identityHash = deriveIdentityHash(vaultKey);

  // GraphQL query to find all AuthBox vault transactions for this identity
  const query = `{
    transactions(
      tags: [
        { name: "App-Name", values: ["AuthBox"] },
        { name: "Vault-Identity", values: ["${identityHash}"] }
      ],
      sort: HEIGHT_DESC,
      first: 10
    ) {
      edges {
        node {
          id
          tags {
            name
            value
          }
          data {
            size
          }
          block {
            timestamp
          }
        }
      }
    }
  }`;

  const response = await fetch('https://arweave.net/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Arweave GraphQL query failed: ${response.status}`);
  }

  const result = await response.json();
  const edges = result.data?.transactions?.edges ?? [];

  return edges.map((edge: any) => {
    const node = edge.node;
    const tags = Object.fromEntries(
      node.tags.map((t: { name: string; value: string }) => [t.name, t.value]),
    );

    return {
      txId: node.id,
      version: parseInt(tags['Vault-Version'] ?? '0', 10),
      timestamp: node.block?.timestamp ? node.block.timestamp * 1000 : 0,
      size: parseInt(node.data?.size ?? '0', 10),
      checksum: tags['Vault-Checksum'] ?? '',
    };
  }).sort((a: VaultArchiveMetadata, b: VaultArchiveMetadata) => b.version - a.version);
}

/**
 * Get the estimated cost to archive a vault of a given size.
 *
 * @param sizeBytes - Size of the vault data in bytes
 * @returns Cost in AR tokens
 */
export async function estimateArchiveCost(sizeBytes: number): Promise<string> {
  const arweave = getArweave();
  const cost = await arweave.transactions.getPrice(sizeBytes);
  return arweave.ar.winstonToAr(cost);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
