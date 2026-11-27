/**
 * Pure helpers for reading vault items and matching them to pages. Kept free
 * of chrome.* and module imports (type-only imports are erased) so they can be
 * tested directly with `node --test`.
 */
import type { ItemType, LoginItem, VaultItem } from '@authbox/shared';

/** Server-side metadata the decrypted payload does not carry. */
export interface ItemMeta {
  id: string;
  itemType: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The plaintext the web app encrypts (apps/web/lib/vault-service.ts):
 * `{ name, data: { username, password, uri, notes, ... }, favorite, folderId }`
 * with `uri` a single string.
 */
interface StoredPayload {
  name?: unknown;
  data?: Record<string, unknown>;
  favorite?: unknown;
  folderId?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Give a saved address a scheme. Importers keep bare hosts such as
 * "github.com"; treating them as https keeps them matchable by origin instead
 * of by substring.
 */
export function normalizeUri(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Turn a decrypted web-app payload into the extension's item shape. */
export function parseStoredItem(plaintext: string, meta: ItemMeta): VaultItem {
  const parsed = JSON.parse(plaintext) as StoredPayload;
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const base = {
    id: meta.id,
    vaultId: '',
    itemType: meta.itemType as ItemType,
    name: str(parsed.name),
    folderId: str(parsed.folderId) || undefined,
    favorite: parsed.favorite === true,
    revision: meta.revision,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
  if (meta.itemType !== 'login') {
    return { ...data, ...base } as unknown as VaultItem;
  }
  const uri = normalizeUri(str(data.uri));
  const login: LoginItem = {
    ...base,
    itemType: 'login' as ItemType.Login,
    uri: uri ? [uri] : [],
    username: str(data.username),
    password: str(data.password),
    notes: str(data.notes) || undefined,
  };
  return login;
}

/** Scheme, host (leading "www." dropped) and port, or null if unparsable. */
function originParts(uri: string): { scheme: string; hostPort: string } | null {
  try {
    const u = new URL(uri);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.replace(/^www\./, '');
    return { scheme: u.protocol, hostPort: `${host}${u.port ? `:${u.port}` : ''}` };
  } catch {
    return null;
  }
}

/**
 * True when a saved address belongs to the page: same host (ignoring a
 * leading www.) and port, and either the same scheme or an http:// login on
 * the https:// version of the site. Never a substring test, so "hub.com" does
 * not match a "github.com" item, and an http:// page never gets https:// logins.
 */
export function uriMatchesPage(savedUri: string, pageUrl: string): boolean {
  const saved = originParts(normalizeUri(savedUri));
  const page = originParts(pageUrl);
  if (!saved || !page || saved.hostPort !== page.hostPort) return false;
  return saved.scheme === page.scheme || (saved.scheme === 'http:' && page.scheme === 'https:');
}
