import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_CATEGORIES,
  ENV_PATTERNS,
  PROVIDER_TEMPLATES,
  getCategory,
  getProvider,
  getProvidersByCategory,
  matchEnvVar,
} from './credential-catalog.js';

// The catalog is the single source for provider templates on web and, via
// scripts/gen-swift-catalog.ts, on iOS/macOS. These checks keep its internal
// references consistent so a typo cannot ship a dangling provider or field.

describe('credential catalog integrity', () => {
  it('has unique category and provider ids', () => {
    const categoryIds = CREDENTIAL_CATEGORIES.map((c) => c.id);
    const providerIds = PROVIDER_TEMPLATES.map((p) => p.id);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(new Set(providerIds).size).toBe(providerIds.length);
  });

  it('puts every provider in an existing category', () => {
    for (const p of PROVIDER_TEMPLATES) {
      expect(getCategory(p.categoryId), `${p.id} -> ${p.categoryId}`).toBeDefined();
    }
  });

  it('has unique field keys inside each provider', () => {
    for (const p of PROVIDER_TEMPLATES) {
      const keys = p.fields.map((f) => f.key);
      expect(new Set(keys).size, p.id).toBe(keys.length);
    }
  });

  it('maps every env pattern to an existing provider field', () => {
    for (const e of ENV_PATTERNS) {
      const provider = getProvider(e.providerId);
      expect(provider, `${e.pattern} -> ${e.providerId}`).toBeDefined();
      expect(
        provider!.fields.some((f) => f.key === e.fieldKey),
        `${e.pattern} -> ${e.providerId}.${e.fieldKey}`,
      ).toBe(true);
    }
  });
});

describe('credential catalog lookups', () => {
  it('finds providers by id and category', () => {
    const first = PROVIDER_TEMPLATES[0];
    expect(getProvider(first.id)).toBe(first);
    expect(getProvidersByCategory(first.categoryId)).toContain(first);
    expect(getProvider('no-such-provider')).toBeUndefined();
  });

  it('matches env var names case-insensitively and rejects unknown names', () => {
    const hit = matchEnvVar('n8n_api_key');
    expect(hit).toEqual({ providerId: 'n8n', fieldKey: 'api_key' });
    expect(matchEnvVar('TOTALLY_UNKNOWN_VARIABLE')).toBeNull();
  });
});
