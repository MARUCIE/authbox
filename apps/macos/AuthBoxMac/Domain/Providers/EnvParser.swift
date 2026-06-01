//
//  EnvParser.swift
//  P3 — Swift port of apps/web/lib/env-import-parser.ts. Parses .env / JSON
//  config, auto-classifies each var against the generated CredentialCatalog,
//  and groups multi-field providers (AWS access+secret → one AWS credential).
//
//  All parsing is local; raw secrets never leave the machine unencrypted.
//

import Foundation

struct ParsedEnvVar: Equatable {
    let key: String
    let value: String
    var providerId: String?
    var fieldKey: String?
    var providerName: String?
    var categoryId: String?
    var categoryName: String?
}

struct GroupedCredential: Identifiable, Equatable {
    let providerId: String
    let providerName: String
    let categoryId: String
    let categoryName: String
    var fields: [String: String]
    var id: String { providerId }
}

struct EnvImportStats: Equatable {
    let totalVars: Int
    let classifiedVars: Int
    let unclassifiedVars: Int
    let providers: Int
    let categories: Int
}

struct EnvImportResult: Equatable {
    let classified: [GroupedCredential]
    let unclassified: [(key: String, value: String)]
    let stats: EnvImportStats

    static func == (lhs: EnvImportResult, rhs: EnvImportResult) -> Bool {
        lhs.classified == rhs.classified && lhs.stats == rhs.stats &&
        lhs.unclassified.map(\.key) == rhs.unclassified.map(\.key) &&
        lhs.unclassified.map(\.value) == rhs.unclassified.map(\.value)
    }
}

enum EnvFormat { case env, json, auto }

enum EnvParser {

    // MARK: - Env-var classification (mirrors catalog.matchEnvVar)

    /// Precompiled, case-insensitive regexes for each catalog env pattern,
    /// in declared order (first match wins — same as the TS source).
    private static let compiled: [(re: NSRegularExpression, providerId: String, fieldKey: String)] = {
        CredentialCatalog.envPatterns.compactMap { p in
            guard let re = try? NSRegularExpression(pattern: p.pattern, options: [.caseInsensitive]) else { return nil }
            return (re, p.providerId, p.fieldKey)
        }
    }()

    static func matchEnvVar(_ name: String) -> (providerId: String, fieldKey: String)? {
        let range = NSRange(name.startIndex..<name.endIndex, in: name)
        for entry in compiled where entry.re.firstMatch(in: name, options: [], range: range) != nil {
            return (entry.providerId, entry.fieldKey)
        }
        return nil
    }

    static func classify(key: String, value: String) -> ParsedEnvVar {
        guard let match = matchEnvVar(key) else {
            return ParsedEnvVar(key: key, value: value)
        }
        let provider = CredentialCatalog.provider(match.providerId)
        let category = provider.flatMap { CredentialCatalog.category($0.categoryId) }
        return ParsedEnvVar(
            key: key, value: value,
            providerId: match.providerId, fieldKey: match.fieldKey,
            providerName: provider?.name,
            categoryId: provider?.categoryId,
            categoryName: category?.name
        )
    }

    // MARK: - Raw parsers

    /// Parse .env content into ordered key/value pairs. Handles KEY=VALUE,
    /// quotes, `export ` prefix, `#`/`//` comments, and inline `# comment`.
    static func parseEnvFile(_ content: String) -> [(key: String, value: String)] {
        var out: [(String, String)] = []
        for rawLine in content.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("#") || line.hasPrefix("//") { continue }
            if line.hasPrefix("export ") { line = String(line.dropFirst(7)).trimmingCharacters(in: .whitespaces) }

            guard let eq = line.firstIndex(of: "=") else { continue }
            let key = line[line.startIndex..<eq].trimmingCharacters(in: .whitespaces)
            let rhsRaw = line[line.index(after: eq)...].trimmingCharacters(in: .whitespaces)
            var value = rhsRaw

            let quoted = (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
                         (value.hasPrefix("'") && value.hasSuffix("'"))
            if quoted, value.count >= 2 {
                value = String(value.dropFirst().dropLast())
            } else if let r = value.range(of: " #") {
                // inline comment only for unquoted values
                value = String(value[value.startIndex..<r.lowerBound]).trimmingCharacters(in: .whitespaces)
            }

            if !key.isEmpty && !value.isEmpty { out.append((key, value)) }
        }
        return out
    }

    /// Parse a flat/nested JSON config into uppercased key/value pairs.
    static func parseJsonConfig(_ content: String) -> [(key: String, value: String)] {
        guard let data = content.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) else { return [] }
        var out: [(String, String)] = []
        flatten(obj, prefix: "", into: &out)
        return out
    }

    private static func flatten(_ obj: Any, prefix: String, into out: inout [(String, String)]) {
        guard let dict = obj as? [String: Any] else { return }
        for (key, value) in dict {
            let full = prefix.isEmpty ? key : "\(prefix)_\(key)"
            switch value {
            case let str as String:
                out.append((full.uppercased(), str))
            case let num as NSNumber:
                out.append((full.uppercased(), num.stringValue))
            case let nested as [String: Any]:
                if nested.count > 3 {
                    if let d = try? JSONSerialization.data(withJSONObject: nested),
                       let s = String(data: d, encoding: .utf8) {
                        out.append((full.uppercased(), s))
                    }
                } else {
                    flatten(nested, prefix: full, into: &out)
                }
            default:
                break
            }
        }
    }

    // MARK: - Grouping + entry point

    static func group(_ vars: [ParsedEnvVar]) -> EnvImportResult {
        var groups: [String: GroupedCredential] = [:]
        var order: [String] = []
        var unclassified: [(key: String, value: String)] = []

        for v in vars {
            guard let pid = v.providerId, let fk = v.fieldKey else {
                unclassified.append((v.key, v.value)); continue
            }
            if groups[pid] == nil {
                groups[pid] = GroupedCredential(
                    providerId: pid,
                    providerName: v.providerName ?? pid,
                    categoryId: v.categoryId ?? "unknown",
                    categoryName: v.categoryName ?? "Unknown",
                    fields: [:]
                )
                order.append(pid)
            }
            groups[pid]?.fields[fk] = v.value
        }

        let classified = order.compactMap { groups[$0] }
        let categories = Set(classified.map(\.categoryId))
        return EnvImportResult(
            classified: classified,
            unclassified: unclassified,
            stats: EnvImportStats(
                totalVars: vars.count,
                classifiedVars: vars.count - unclassified.count,
                unclassifiedVars: unclassified.count,
                providers: classified.count,
                categories: categories.count
            )
        )
    }

    /// Parse + classify an entire .env or JSON config blob.
    static func parseAndClassify(_ content: String, format: EnvFormat = .auto) -> EnvImportResult {
        var fmt = format
        if fmt == .auto {
            let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
            fmt = (trimmed.hasPrefix("{") || trimmed.hasPrefix("[")) ? .json : .env
        }
        let raw = fmt == .json ? parseJsonConfig(content) : parseEnvFile(content)
        let classified = raw.map { classify(key: $0.key, value: $0.value) }
        return group(classified)
    }
}
