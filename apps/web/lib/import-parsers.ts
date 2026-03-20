/**
 * Parsers for importing passwords from 13+ password managers.
 *
 * All parsing is done client-side -- imported data never leaves the browser
 * unencrypted. Each parser normalizes to LoginImportItem[].
 *
 * Supported sources:
 *   - Apple iCloud Keychain / Passwords (CSV)
 *   - Google Password Manager (CSV)
 *   - Chrome (CSV)
 *   - Microsoft Edge (CSV)
 *   - Firefox (CSV)
 *   - 1Password (CSV)
 *   - Bitwarden (JSON / CSV)
 *   - LastPass (CSV)
 *   - Dashlane (CSV / JSON)
 *   - KeePass (CSV)
 *   - Samsung Pass (CSV)
 *   - NordPass (CSV)
 *   - Enpass (CSV / JSON)
 *   - Generic CSV (auto-detect columns)
 */

export interface LoginImportItem {
  name: string;
  username: string;
  password: string;
  uri: string;
  notes: string;
  otpAuth?: string; // TOTP URI (from iCloud, Bitwarden, Enpass)
  folder?: string;  // Folder/group (from LastPass, NordPass, Dashlane)
}

export type ImportFormat =
  | 'apple'      // iCloud Keychain / Apple Passwords
  | 'google'     // Google Password Manager
  | 'chrome'     // Chrome browser
  | 'edge'       // Microsoft Edge
  | 'firefox'    // Mozilla Firefox
  | '1password'  // 1Password
  | 'bitwarden'  // Bitwarden
  | 'lastpass'   // LastPass
  | 'dashlane'   // Dashlane
  | 'keepass'    // KeePass
  | 'samsung'    // Samsung Pass
  | 'nordpass'   // NordPass
  | 'enpass'     // Enpass
  | 'generic';   // Auto-detect CSV

export interface ImportResult {
  items: LoginImportItem[];
  skipped: number;
  errors: string[];
  detectedFormat?: ImportFormat;
}

export const IMPORT_SOURCES: { value: ImportFormat; label: string; icon: string; hint: string }[] = [
  { value: 'apple', label: 'Apple iCloud Keychain', icon: 'AP', hint: 'System Settings > Passwords > Export' },
  { value: 'google', label: 'Google Password Manager', icon: 'Go', hint: 'passwords.google.com > Export' },
  { value: 'chrome', label: 'Chrome', icon: 'Ch', hint: 'Settings > Passwords > Export' },
  { value: 'edge', label: 'Microsoft Edge', icon: 'Ed', hint: 'Settings > Passwords > Export' },
  { value: 'firefox', label: 'Firefox', icon: 'Fx', hint: 'Settings > Logins and Passwords > Export' },
  { value: '1password', label: '1Password', icon: '1P', hint: 'File > Export > CSV' },
  { value: 'bitwarden', label: 'Bitwarden', icon: 'BW', hint: 'Tools > Export Vault > JSON or CSV' },
  { value: 'lastpass', label: 'LastPass', icon: 'LP', hint: 'Account Options > Advanced > Export' },
  { value: 'dashlane', label: 'Dashlane', icon: 'DL', hint: 'Settings > Export Data > CSV' },
  { value: 'keepass', label: 'KeePass', icon: 'KP', hint: 'File > Export > CSV' },
  { value: 'samsung', label: 'Samsung Pass', icon: 'SP', hint: 'Settings > Samsung Pass > Export' },
  { value: 'nordpass', label: 'NordPass', icon: 'NP', hint: 'Settings > Export Items > CSV' },
  { value: 'enpass', label: 'Enpass', icon: 'EP', hint: 'File > Export > CSV or JSON' },
  { value: 'generic', label: 'Other (CSV)', icon: 'CS', hint: 'Any CSV with url, username, password columns' },
];

// ─── CSV Parser ───────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field);
        field = '';
        if (current.some((f) => f.trim() !== '')) rows.push(current);
        current = [];
        if (ch === '\r') i++;
      } else {
        field += ch;
      }
    }
  }
  current.push(field);
  if (current.some((f) => f.trim() !== '')) rows.push(current);
  return rows;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ─── Column Matcher ───────────────────────────────────────────────────────

interface ColumnMap {
  name: number;
  url: number;
  username: number;
  password: number;
  notes: number;
  otp: number;
  folder: number;
}

const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  name: ['name', 'title', 'entry', 'label', 'login name', 'account'],
  url: ['url', 'urls', 'uri', 'website', 'login_uri', 'login url', 'web site', 'hostname'],
  username: ['username', 'user name', 'login', 'email', 'login_username', 'user'],
  password: ['password', 'login_password', 'pass'],
  notes: ['notes', 'note', 'notesplain', 'extra', 'comments', 'comment', 'memo'],
  otp: ['otpauth', 'otp', 'totp', 'login_totp'],
  folder: ['folder', 'group', 'grouping', 'category', 'collection'],
};

function matchColumns(header: string[]): ColumnMap {
  const lower = header.map((h) => h.toLowerCase().trim());
  const find = (aliases: string[]): number =>
    lower.findIndex((h) => aliases.includes(h));

  return {
    name: find(COLUMN_ALIASES.name),
    url: find(COLUMN_ALIASES.url),
    username: find(COLUMN_ALIASES.username),
    password: find(COLUMN_ALIASES.password),
    notes: find(COLUMN_ALIASES.notes),
    otp: find(COLUMN_ALIASES.otp),
    folder: find(COLUMN_ALIASES.folder),
  };
}

function col(row: string[], idx: number): string {
  return idx >= 0 ? row[idx]?.trim() ?? '' : '';
}

// ─── Universal CSV Parser ─────────────────────────────────────────────────

function parseUniversalCSV(text: string, opts?: { skipNonLogin?: boolean; typeColumn?: string; loginTypeValue?: string }): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return { items: [], skipped: 0, errors: ['File appears empty or has no data rows'] };
  }

  const header = rows[0];
  const cols = matchColumns(header);

  if (cols.password === -1 && cols.username === -1) {
    return { items: [], skipped: 0, errors: ['Could not find username or password columns in CSV header'] };
  }

  // Optional type column filtering (Bitwarden, KeePass)
  const typeIdx = opts?.typeColumn
    ? header.findIndex((h) => h.toLowerCase().trim() === opts.typeColumn)
    : -1;

  const items: LoginImportItem[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip non-login types if filter is active
    if (typeIdx !== -1 && opts?.loginTypeValue) {
      const rowType = row[typeIdx]?.trim().toLowerCase() ?? '';
      if (rowType && rowType !== opts.loginTypeValue) {
        skipped++;
        continue;
      }
    }

    const password = col(row, cols.password);
    const username = col(row, cols.username);
    if (!password && !username) {
      skipped++;
      continue;
    }

    const uri = col(row, cols.url);
    items.push({
      name: col(row, cols.name) || domainFromUrl(uri) || `Import ${i}`,
      username,
      password,
      uri,
      notes: col(row, cols.notes),
      otpAuth: col(row, cols.otp) || undefined,
      folder: col(row, cols.folder) || undefined,
    });
  }

  return { items, skipped, errors: [] };
}

// ─── Source-Specific Parsers ──────────────────────────────────────────────

// Apple iCloud Keychain / Passwords
// Columns: Title, URL, Username, Password, Notes, OTPAuth
export function parseApple(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Google Password Manager (identical to Chrome format)
export function parseGoogle(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Chrome CSV: name, url, username, password, note
export function parseChrome(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Microsoft Edge CSV: name, url, username, password
export function parseEdge(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Firefox CSV: url, username, password, httpRealm, formActionOrigin, guid, timeCreated, timeLastUsed, timePasswordChanged
export function parseFirefox(text: string): ImportResult {
  const result = parseUniversalCSV(text);
  // Firefox has no "name" column -- derive from URL
  for (const item of result.items) {
    if (!item.name || item.name.startsWith('Import ')) {
      item.name = domainFromUrl(item.uri) || 'Imported';
    }
  }
  return result;
}

// 1Password CSV: Title, Url, Username, Password, Notes, Type
export function parse1Password(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Bitwarden JSON or CSV
export function parseBitwarden(text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBitwardenJSON(trimmed);
  }
  return parseUniversalCSV(text, { typeColumn: 'type', loginTypeValue: 'login' });
}

function parseBitwardenJSON(text: string): ImportResult {
  const items: LoginImportItem[] = [];
  let skipped = 0;
  const errors: string[] = [];

  try {
    const data = JSON.parse(text);
    const entries = data.items ?? data;
    if (!Array.isArray(entries)) {
      return { items: [], skipped: 0, errors: ['JSON does not contain an items array'] };
    }

    for (const entry of entries) {
      if (entry.type !== undefined && entry.type !== 1) {
        skipped++;
        continue;
      }

      const login = entry.login ?? entry;
      const password = login.password?.trim() ?? '';
      if (!password && !login.username) {
        skipped++;
        continue;
      }

      const uris = login.uris ?? [];
      const uri = uris[0]?.uri ?? '';
      items.push({
        name: entry.name?.trim() || domainFromUrl(uri) || 'Imported',
        username: login.username?.trim() ?? '',
        password,
        uri,
        notes: entry.notes?.trim() ?? '',
        otpAuth: login.totp?.trim() || undefined,
        folder: entry.folderId ?? undefined,
      });
    }
  } catch (err) {
    errors.push(`JSON parse error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { items, skipped, errors };
}

// LastPass CSV: url, username, password, totp, extra, name, grouping, fav
export function parseLastPass(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Dashlane CSV or JSON
export function parseDashlane(text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseDashlaneJSON(trimmed);
  }
  return parseUniversalCSV(text);
}

function parseDashlaneJSON(text: string): ImportResult {
  const items: LoginImportItem[] = [];
  let skipped = 0;
  const errors: string[] = [];

  try {
    const data = JSON.parse(text);
    const entries = data.AUTHENTIFIANT ?? data.credentials ?? data;
    if (!Array.isArray(entries)) {
      return { items: [], skipped: 0, errors: ['JSON does not contain credentials array'] };
    }

    for (const entry of entries) {
      const password = entry.password?.trim() ?? '';
      const username = entry.login?.trim() ?? entry.email?.trim() ?? entry.username?.trim() ?? '';
      if (!password && !username) {
        skipped++;
        continue;
      }

      const uri = entry.domain?.trim() ?? entry.url?.trim() ?? '';
      items.push({
        name: entry.title?.trim() || domainFromUrl(uri) || 'Imported',
        username,
        password,
        uri: uri.startsWith('http') ? uri : uri ? `https://${uri}` : '',
        notes: entry.note?.trim() ?? '',
        folder: entry.category?.trim() || undefined,
      });
    }
  } catch (err) {
    errors.push(`JSON parse error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { items, skipped, errors };
}

// KeePass CSV: Title, Username, Password, URL, Notes, Group
export function parseKeePass(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Samsung Pass CSV: url/domain, username/id, password
export function parseSamsung(text: string): ImportResult {
  const result = parseUniversalCSV(text);
  for (const item of result.items) {
    if (!item.name || item.name.startsWith('Import ')) {
      item.name = domainFromUrl(item.uri) || 'Imported';
    }
  }
  return result;
}

// NordPass CSV: name, url, username, password, note, cardholdername, ..., folder
export function parseNordPass(text: string): ImportResult {
  return parseUniversalCSV(text);
}

// Enpass CSV or JSON
export function parseEnpass(text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseEnpassJSON(trimmed);
  }
  return parseUniversalCSV(text);
}

function parseEnpassJSON(text: string): ImportResult {
  const items: LoginImportItem[] = [];
  let skipped = 0;
  const errors: string[] = [];

  try {
    const data = JSON.parse(text);
    const entries = data.items ?? data;
    if (!Array.isArray(entries)) {
      return { items: [], skipped: 0, errors: ['JSON does not contain items array'] };
    }

    for (const entry of entries) {
      const fields = entry.fields ?? [];
      const findField = (label: string): string =>
        fields.find((f: { label: string; value: string }) =>
          f.label?.toLowerCase().includes(label))?.value?.trim() ?? '';

      const password = findField('password');
      const username = findField('username') || findField('email');
      if (!password && !username) {
        skipped++;
        continue;
      }

      const uri = findField('url') || findField('website');
      items.push({
        name: entry.title?.trim() || domainFromUrl(uri) || 'Imported',
        username,
        password,
        uri,
        notes: entry.note?.trim() ?? '',
        otpAuth: findField('totp') || undefined,
        folder: entry.folders?.[0] ?? undefined,
      });
    }
  } catch (err) {
    errors.push(`JSON parse error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { items, skipped, errors };
}

// ─── Auto-Detect & Route ──────────────────────────────────────────────────

const FORMAT_PARSERS: Record<ImportFormat, (text: string) => ImportResult> = {
  apple: parseApple,
  google: parseGoogle,
  chrome: parseChrome,
  edge: parseEdge,
  firefox: parseFirefox,
  '1password': parse1Password,
  bitwarden: parseBitwarden,
  lastpass: parseLastPass,
  dashlane: parseDashlane,
  keepass: parseKeePass,
  samsung: parseSamsung,
  nordpass: parseNordPass,
  enpass: parseEnpass,
  generic: (text) => parseUniversalCSV(text),
};

/**
 * Auto-detect format and parse. If hintFormat is provided, use that parser directly.
 */
export function autoDetectAndParse(text: string, hintFormat?: ImportFormat): ImportResult {
  if (hintFormat && FORMAT_PARSERS[hintFormat]) {
    const result = FORMAT_PARSERS[hintFormat](text);
    result.detectedFormat = hintFormat;
    return result;
  }

  // JSON detection (Bitwarden, Dashlane, Enpass)
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    // Try Bitwarden JSON first (most common)
    const bw = parseBitwardenJSON(trimmed);
    if (bw.items.length > 0) return { ...bw, detectedFormat: 'bitwarden' };

    const dl = parseDashlaneJSON(trimmed);
    if (dl.items.length > 0) return { ...dl, detectedFormat: 'dashlane' };

    const ep = parseEnpassJSON(trimmed);
    if (ep.items.length > 0) return { ...ep, detectedFormat: 'enpass' };

    return { items: [], skipped: 0, errors: ['Could not parse JSON as any known format'], detectedFormat: undefined };
  }

  // CSV header detection
  const firstLine = trimmed.split('\n')[0]?.toLowerCase() ?? '';

  // Apple: has OTPAuth column
  if (firstLine.includes('otpauth')) {
    return { ...parseApple(text), detectedFormat: 'apple' };
  }
  // Bitwarden CSV: login_uri, login_username
  if (firstLine.includes('login_uri') || firstLine.includes('login_username')) {
    return { ...parseUniversalCSV(text, { typeColumn: 'type', loginTypeValue: 'login' }), detectedFormat: 'bitwarden' };
  }
  // 1Password: has "notesplain"
  if (firstLine.includes('notesplain')) {
    return { ...parse1Password(text), detectedFormat: '1password' };
  }
  // Firefox: has "httprealm" or "formactionorigin"
  if (firstLine.includes('httprealm') || firstLine.includes('formactionorigin')) {
    return { ...parseFirefox(text), detectedFormat: 'firefox' };
  }
  // LastPass: has "grouping" + "fav"
  if (firstLine.includes('grouping') && firstLine.includes('fav')) {
    return { ...parseLastPass(text), detectedFormat: 'lastpass' };
  }
  // NordPass: has "cardholdername"
  if (firstLine.includes('cardholdername')) {
    return { ...parseNordPass(text), detectedFormat: 'nordpass' };
  }
  // KeePass: has "group" + "title"
  if (firstLine.includes('group') && firstLine.includes('title')) {
    return { ...parseKeePass(text), detectedFormat: 'keepass' };
  }

  // Default: generic CSV (covers Chrome, Edge, Google, Samsung, and unknowns)
  return { ...parseUniversalCSV(text), detectedFormat: 'generic' };
}
