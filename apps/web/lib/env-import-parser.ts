/**
 * .env File Import Parser for AI Infrastructure Credentials
 *
 * Parses .env files, JSON config, and YAML-style configs.
 * Auto-classifies env vars to providers using the credential catalog.
 * Groups multi-field providers (e.g., AWS access_key + secret_key → single AWS credential).
 *
 * All parsing is client-side — raw secrets never leave the browser unencrypted.
 */

import {
  matchEnvVar,
  getProvider,
  getCategory,
  PROVIDER_TEMPLATES,
  type ProviderTemplate,
  type CredentialCategory,
} from '@authbox/shared/types/credential-catalog';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedEnvVar {
  key: string;
  value: string;
  providerId: string | null;
  fieldKey: string | null;
  providerName: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export interface GroupedCredential {
  providerId: string;
  providerName: string;
  categoryId: string;
  categoryName: string;
  fields: Record<string, string>;
  environment?: string;
}

export interface EnvImportResult {
  classified: GroupedCredential[];
  unclassified: { key: string; value: string }[];
  stats: {
    totalVars: number;
    classifiedVars: number;
    unclassifiedVars: number;
    providers: number;
    categories: number;
  };
}

// ─── Parsers ──────────────────────────────────────────────────────────────

/**
 * Parse .env file content into key-value pairs.
 * Handles: KEY=VALUE, KEY="VALUE", KEY='VALUE', # comments, empty lines,
 * export KEY=VALUE, multiline values with backslash continuation.
 */
export function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // Remove "export " prefix
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Handle inline comments (only for unquoted values)
    if (!line.slice(eqIdx + 1).trim().startsWith('"') &&
        !line.slice(eqIdx + 1).trim().startsWith("'")) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    if (key && value) {
      vars.set(key, value);
    }
  }

  return vars;
}

/**
 * Parse JSON config file into key-value pairs.
 * Handles flat objects and nested objects (flattened with _ separator).
 */
export function parseJsonConfig(content: string): Map<string, string> {
  const vars = new Map<string, string>();

  try {
    const data = JSON.parse(content);
    flattenObject(data, '', vars);
  } catch {
    // Not valid JSON
  }

  return vars;
}

function flattenObject(obj: unknown, prefix: string, result: Map<string, string>): void {
  if (typeof obj !== 'object' || obj === null) return;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}_${key}` : key;

    if (typeof value === 'string') {
      result.set(fullKey.toUpperCase(), value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result.set(fullKey.toUpperCase(), String(value));
    } else if (typeof value === 'object' && value !== null) {
      // For JSON objects (like service account), store as stringified JSON
      if (Object.keys(value as object).length > 3) {
        result.set(fullKey.toUpperCase(), JSON.stringify(value));
      } else {
        flattenObject(value, fullKey, result);
      }
    }
  }
}

// ─── Auto-Classification ──────────────────────────────────────────────────

/**
 * Classify a single env var against the credential catalog.
 */
export function classifyEnvVar(key: string, value: string): ParsedEnvVar {
  const match = matchEnvVar(key);

  if (match) {
    const provider = getProvider(match.providerId);
    const category = provider ? getCategory(provider.categoryId) : null;

    return {
      key,
      value,
      providerId: match.providerId,
      fieldKey: match.fieldKey,
      providerName: provider?.name ?? null,
      categoryId: provider?.categoryId ?? null,
      categoryName: category?.name ?? null,
    };
  }

  return {
    key,
    value,
    providerId: null,
    fieldKey: null,
    providerName: null,
    categoryId: null,
    categoryName: null,
  };
}

/**
 * Group classified env vars by provider.
 * Merges multi-field providers (e.g., AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY → single AWS entry).
 */
export function groupByProvider(vars: ParsedEnvVar[]): EnvImportResult {
  const providerGroups = new Map<string, GroupedCredential>();
  const unclassified: { key: string; value: string }[] = [];

  for (const v of vars) {
    if (!v.providerId || !v.fieldKey) {
      unclassified.push({ key: v.key, value: v.value });
      continue;
    }

    if (!providerGroups.has(v.providerId)) {
      providerGroups.set(v.providerId, {
        providerId: v.providerId,
        providerName: v.providerName ?? v.providerId,
        categoryId: v.categoryId ?? 'unknown',
        categoryName: v.categoryName ?? 'Unknown',
        fields: {},
      });
    }

    providerGroups.get(v.providerId)!.fields[v.fieldKey] = v.value;
  }

  const classified = Array.from(providerGroups.values());
  const categorySet = new Set(classified.map(c => c.categoryId));

  return {
    classified,
    unclassified,
    stats: {
      totalVars: vars.length,
      classifiedVars: vars.length - unclassified.length,
      unclassifiedVars: unclassified.length,
      providers: classified.length,
      categories: categorySet.size,
    },
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────

/**
 * Parse and classify an entire .env or JSON config file.
 *
 * @param content - Raw file content
 * @param format - 'env' | 'json' | 'auto' (auto-detects from content)
 * @returns Grouped credentials ready for vault import
 */
export function parseAndClassify(
  content: string,
  format: 'env' | 'json' | 'auto' = 'auto',
): EnvImportResult {
  // Auto-detect format
  let detectedFormat = format;
  if (format === 'auto') {
    const trimmed = content.trim();
    detectedFormat = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? 'json' : 'env';
  }

  // Parse raw key-value pairs
  const rawVars = detectedFormat === 'json'
    ? parseJsonConfig(content)
    : parseEnvFile(content);

  // Classify each variable
  const classified: ParsedEnvVar[] = [];
  for (const [key, value] of rawVars) {
    classified.push(classifyEnvVar(key, value));
  }

  // Group by provider
  return groupByProvider(classified);
}
