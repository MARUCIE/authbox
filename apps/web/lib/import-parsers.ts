/**
 * Parsers for importing passwords from various password managers.
 *
 * Each parser takes raw file content (CSV or JSON) and returns a normalized
 * array of LoginImportItem objects. All parsing is done client-side --
 * imported data never leaves the browser unencrypted.
 *
 * Supported formats:
 *   - 1Password: CSV export (name, url, username, password, notes)
 *   - Bitwarden: JSON or CSV export
 *   - Chrome: CSV export (name, url, username, password, note)
 */

export interface LoginImportItem {
  name: string;
  username: string;
  password: string;
  uri: string;
  notes: string;
}

export type ImportFormat = '1password' | 'bitwarden' | 'chrome';

export interface ImportResult {
  items: LoginImportItem[];
  skipped: number;
  errors: string[];
}

/**
 * Parse a CSV string into rows of string arrays.
 * Handles quoted fields with commas and newlines.
 */
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
          i++; // skip escaped quote
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
        if (current.some((f) => f.trim() !== '')) {
          rows.push(current);
        }
        current = [];
        if (ch === '\r') i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }

  // Last field/row
  current.push(field);
  if (current.some((f) => f.trim() !== '')) {
    rows.push(current);
  }

  return rows;
}

/**
 * Extract the domain from a URL to use as a fallback name.
 */
function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Parse 1Password CSV export.
 *
 * Expected columns: Title, Url, Username, Password, Notes, Type
 * The actual header names may vary, so we match by common patterns.
 */
export function parse1Password(text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return { items: [], skipped: 0, errors: ['File appears empty or has no data rows'] };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const titleIdx = header.findIndex((h) => h === 'title' || h === 'name');
  const urlIdx = header.findIndex((h) => h === 'url' || h === 'urls' || h === 'website');
  const userIdx = header.findIndex((h) => h === 'username' || h === 'email' || h === 'login');
  const passIdx = header.findIndex((h) => h === 'password');
  const notesIdx = header.findIndex((h) => h === 'notes' || h === 'notesplain');

  if (passIdx === -1) {
    return { items: [], skipped: 0, errors: ['Could not find "password" column in CSV header'] };
  }

  const items: LoginImportItem[] = [];
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const password = row[passIdx]?.trim() ?? '';
    if (!password) {
      skipped++;
      continue;
    }

    const uri = row[urlIdx]?.trim() ?? '';
    items.push({
      name: row[titleIdx]?.trim() || domainFromUrl(uri) || `Import ${i}`,
      username: row[userIdx]?.trim() ?? '',
      password,
      uri,
      notes: row[notesIdx]?.trim() ?? '',
    });
  }

  return { items, skipped, errors };
}

/**
 * Parse Bitwarden export (JSON or CSV).
 */
export function parseBitwarden(text: string): ImportResult {
  // Try JSON first
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBitwardenJSON(trimmed);
  }
  return parseBitwardenCSV(text);
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
      // Bitwarden types: 1=Login, 2=SecureNote, 3=Card, 4=Identity
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
      });
    }
  } catch (err) {
    errors.push(`JSON parse error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { items, skipped, errors };
}

function parseBitwardenCSV(text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return { items: [], skipped: 0, errors: ['File appears empty'] };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const nameIdx = header.findIndex((h) => h === 'name');
  const urlIdx = header.findIndex((h) => h === 'login_uri' || h === 'uri' || h === 'url');
  const userIdx = header.findIndex((h) => h === 'login_username' || h === 'username');
  const passIdx = header.findIndex((h) => h === 'login_password' || h === 'password');
  const notesIdx = header.findIndex((h) => h === 'notes');
  const typeIdx = header.findIndex((h) => h === 'type');

  if (passIdx === -1 && userIdx === -1) {
    return { items: [], skipped: 0, errors: ['Could not find username or password column'] };
  }

  const items: LoginImportItem[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip non-login types
    if (typeIdx !== -1 && row[typeIdx]?.trim().toLowerCase() !== 'login') {
      skipped++;
      continue;
    }

    const password = passIdx !== -1 ? row[passIdx]?.trim() ?? '' : '';
    const username = userIdx !== -1 ? row[userIdx]?.trim() ?? '' : '';
    if (!password && !username) {
      skipped++;
      continue;
    }

    const uri = urlIdx !== -1 ? row[urlIdx]?.trim() ?? '' : '';
    items.push({
      name: (nameIdx !== -1 ? row[nameIdx]?.trim() : '') || domainFromUrl(uri) || `Import ${i}`,
      username,
      password,
      uri,
      notes: notesIdx !== -1 ? row[notesIdx]?.trim() ?? '' : '',
    });
  }

  return { items, skipped, errors: [] };
}

/**
 * Parse Chrome CSV export.
 *
 * Chrome export columns: name, url, username, password, note
 */
export function parseChrome(text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return { items: [], skipped: 0, errors: ['File appears empty'] };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const nameIdx = header.findIndex((h) => h === 'name');
  const urlIdx = header.findIndex((h) => h === 'url');
  const userIdx = header.findIndex((h) => h === 'username');
  const passIdx = header.findIndex((h) => h === 'password');
  const notesIdx = header.findIndex((h) => h === 'note' || h === 'notes');

  if (passIdx === -1) {
    return { items: [], skipped: 0, errors: ['Could not find "password" column'] };
  }

  const items: LoginImportItem[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const password = row[passIdx]?.trim() ?? '';
    if (!password) {
      skipped++;
      continue;
    }

    const uri = urlIdx !== -1 ? row[urlIdx]?.trim() ?? '' : '';
    items.push({
      name: (nameIdx !== -1 ? row[nameIdx]?.trim() : '') || domainFromUrl(uri) || `Import ${i}`,
      username: userIdx !== -1 ? row[userIdx]?.trim() ?? '' : '',
      password,
      uri,
      notes: notesIdx !== -1 ? row[notesIdx]?.trim() ?? '' : '',
    });
  }

  return { items, skipped, errors: [] };
}

/**
 * Auto-detect format and parse.
 */
export function autoDetectAndParse(text: string, hintFormat?: ImportFormat): ImportResult {
  if (hintFormat) {
    switch (hintFormat) {
      case '1password':
        return parse1Password(text);
      case 'bitwarden':
        return parseBitwarden(text);
      case 'chrome':
        return parseChrome(text);
    }
  }

  // Try JSON (Bitwarden)
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBitwardenJSON(trimmed);
  }

  // Try CSV auto-detect via header
  const firstLine = trimmed.split('\n')[0]?.toLowerCase() ?? '';
  if (firstLine.includes('login_uri') || firstLine.includes('login_username')) {
    return parseBitwardenCSV(text);
  }
  if (firstLine.includes('title') && firstLine.includes('notesplain')) {
    return parse1Password(text);
  }

  // Default to Chrome format (most common)
  return parseChrome(text);
}
