/**
 * gen-swift-catalog.ts — codegen: credential-catalog.ts → CredentialCatalog.generated.swift
 *
 * Single source of truth = packages/shared/src/types/credential-catalog.ts.
 * The Swift file is DERIVED. Editing it by hand is a regression caught by the
 * checksum gate.
 *
 *   pnpm run gen:swift-catalog          # regenerate the Swift file
 *   pnpm run gen:swift-catalog --check  # CI gate: exit 1 if the file is stale
 *
 * The header embeds sha256(credential-catalog.ts). --check regenerates in
 * memory and byte-compares against the on-disk file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CREDENTIAL_CATEGORIES,
  PROVIDER_TEMPLATES,
  ENV_PATTERNS,
} from '../packages/shared/src/types/credential-catalog';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TS = resolve(__dirname, '../packages/shared/src/types/credential-catalog.ts');
const OUT_SWIFT = resolve(
  __dirname,
  '../apps/macos/AuthBoxMac/Domain/Providers/CredentialCatalog.generated.swift',
);

/** Escape a string for a Swift double-quoted literal. */
function s(str: string): string {
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

function fieldLiteral(f: {
  key: string; label: string; type: string; required: boolean; placeholder: string; helpText: string;
}): string {
  return `CredentialField(key: ${s(f.key)}, label: ${s(f.label)}, type: .${f.type}, required: ${f.required}, placeholder: ${s(f.placeholder)}, helpText: ${s(f.helpText)})`;
}

function emit(): string {
  const sourceHash = createHash('sha256').update(readFileSync(SOURCE_TS)).digest('hex');

  const categories = CREDENTIAL_CATEGORIES.map(
    (c) => `        CredentialCategory(id: ${s(c.id)}, name: ${s(c.name)}, description: ${s(c.description)}, icon: ${s(c.icon)}, sortOrder: ${c.sortOrder}),`,
  ).join('\n');

  const providers = PROVIDER_TEMPLATES.map((p) => {
    const fields = p.fields.map((f) => `            ${fieldLiteral(f)},`).join('\n');
    const tags = '[' + p.tags.map(s).join(', ') + ']';
    return `        ProviderTemplate(id: ${s(p.id)}, categoryId: ${s(p.categoryId)}, name: ${s(p.name)}, description: ${s(p.description)}, website: ${s(p.website)}, authPattern: .${p.authPattern}, tags: ${tags}, fields: [\n${fields}\n        ]),`;
  }).join('\n');

  // ENV_PATTERNS: emit the RegExp source; all patterns are case-insensitive (/i).
  const patterns = ENV_PATTERNS.map((e) => {
    if (!e.pattern.flags.includes('i')) {
      throw new Error(`ENV pattern ${e.pattern} is not case-insensitive; Swift codegen assumes /i`);
    }
    return `        EnvPattern(pattern: ${s(e.pattern.source)}, providerId: ${s(e.providerId)}, fieldKey: ${s(e.fieldKey)}),`;
  }).join('\n');

  return `//
//  CredentialCatalog.generated.swift
//  GENERATED FILE — DO NOT EDIT BY HAND.
//
//  Source:     packages/shared/src/types/credential-catalog.ts
//  sha256:     ${sourceHash}
//  Regenerate: pnpm run gen:swift-catalog
//  CI gate:    pnpm run gen:swift-catalog --check  (fails if this file is stale)
//
//  ${CREDENTIAL_CATEGORIES.length} categories · ${PROVIDER_TEMPLATES.length} providers · ${ENV_PATTERNS.length} env patterns.
//

import Foundation

enum AuthPattern: String, Codable, Hashable {
    case api_key, api_key_secret, bearer_token, oauth2
    case service_account_json, access_key_secret, bot_token
}

enum FieldType: String, Codable, Hashable {
    case secret, text, url, json, file
}

struct CredentialField: Identifiable, Hashable {
    let key: String
    let label: String
    let type: FieldType
    let required: Bool
    let placeholder: String
    let helpText: String
    var id: String { key }
}

struct CredentialCategory: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let icon: String
    let sortOrder: Int
}

struct ProviderTemplate: Identifiable, Hashable {
    let id: String
    let categoryId: String
    let name: String
    let description: String
    let website: String
    let authPattern: AuthPattern
    let tags: [String]
    let fields: [CredentialField]
}

/// One env-var-name → provider/field mapping. \`pattern\` is an
/// NSRegularExpression source applied case-insensitively.
struct EnvPattern {
    let pattern: String
    let providerId: String
    let fieldKey: String
}

enum CredentialCatalog {
    static let categories: [CredentialCategory] = [
${categories}
    ]

    static let providers: [ProviderTemplate] = [
${providers}
    ]

    static let envPatterns: [EnvPattern] = [
${patterns}
    ]

    static let providerByID: [String: ProviderTemplate] =
        Dictionary(uniqueKeysWithValues: providers.map { ($0.id, $0) })
    static let categoryByID: [String: CredentialCategory] =
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })

    static func provider(_ id: String) -> ProviderTemplate? { providerByID[id] }
    static func category(_ id: String) -> CredentialCategory? { categoryByID[id] }
    static func providers(inCategory id: String) -> [ProviderTemplate] {
        providers.filter { $0.categoryId == id }
    }
}
`;
}

const generated = emit();
const isCheck = process.argv.includes('--check');

if (isCheck) {
  let current = '';
  try { current = readFileSync(OUT_SWIFT, 'utf8'); } catch { /* missing → stale */ }
  if (current !== generated) {
    console.error('STALE: CredentialCatalog.generated.swift is out of sync with credential-catalog.ts');
    console.error('Run: pnpm run gen:swift-catalog');
    process.exit(1);
  }
  console.log('OK: CredentialCatalog.generated.swift is in sync.');
} else {
  writeFileSync(OUT_SWIFT, generated);
  console.log(`Wrote ${OUT_SWIFT}`);
  console.log(`${CREDENTIAL_CATEGORIES.length} categories · ${PROVIDER_TEMPLATES.length} providers · ${ENV_PATTERNS.length} env patterns.`);
}
