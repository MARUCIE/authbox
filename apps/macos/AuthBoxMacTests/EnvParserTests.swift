//
//  EnvParserTests.swift
//  P3 — headless tests for .env parsing, catalog classification, and multi-field
//  provider grouping. No network, no hardware.
//

import XCTest
@testable import AuthBoxMac

final class EnvParserTests: XCTestCase {

    func test_parseEnvFile_handles_quotes_export_and_comments() {
        let env = """
        # a comment
        export OPENAI_API_KEY=sk-plain
        ANTHROPIC_API_KEY="sk-ant-quoted"
        GITHUB_TOKEN='ghp_single'
        EMPTY=
        INLINE=value # trailing comment
        // js-style comment line
        """
        let pairs = EnvParser.parseEnvFile(env)
        let dict = Dictionary(uniqueKeysWithValues: pairs.map { ($0.key, $0.value) })

        XCTAssertEqual(dict["OPENAI_API_KEY"], "sk-plain")
        XCTAssertEqual(dict["ANTHROPIC_API_KEY"], "sk-ant-quoted")
        XCTAssertEqual(dict["GITHUB_TOKEN"], "ghp_single")
        XCTAssertEqual(dict["INLINE"], "value", "inline # comment stripped for unquoted value")
        XCTAssertNil(dict["EMPTY"], "empty value dropped")
        XCTAssertEqual(pairs.count, 4)
    }

    func test_classify_maps_known_var_to_provider_and_category() {
        let v = EnvParser.classify(key: "OPENAI_API_KEY", value: "sk-x")
        XCTAssertEqual(v.providerId, "openai")
        XCTAssertEqual(v.fieldKey, "api_key")
        XCTAssertEqual(v.providerName, "OpenAI")
        XCTAssertEqual(v.categoryId, "llm")
        XCTAssertEqual(v.categoryName, "LLM")
    }

    func test_classify_case_insensitive_and_alias() {
        // GEMINI_API_KEY is an alias of google_ai; lowercase must still match.
        let v = EnvParser.classify(key: "gemini_api_key", value: "AIza")
        XCTAssertEqual(v.providerId, "google_ai")
    }

    func test_group_merges_multifield_aws_into_one_credential() {
        let env = """
        AWS_ACCESS_KEY_ID=AKIAEXAMPLE
        AWS_SECRET_ACCESS_KEY=secretpart
        AWS_REGION=us-east-1
        UNKNOWN_THING=whatever
        """
        let result = EnvParser.parseAndClassify(env)
        XCTAssertEqual(result.classified.count, 1, "three AWS vars → one grouped credential")
        let aws = result.classified[0]
        XCTAssertEqual(aws.providerId, "aws")
        XCTAssertEqual(aws.fields["access_key_id"], "AKIAEXAMPLE")
        XCTAssertEqual(aws.fields["secret_access_key"], "secretpart")
        XCTAssertEqual(aws.fields["region"], "us-east-1")
        XCTAssertEqual(result.unclassified.count, 1)
        XCTAssertEqual(result.unclassified.first?.key, "UNKNOWN_THING")
        XCTAssertEqual(result.stats.providers, 1)
    }

    func test_parseAndClassify_autodetects_json() {
        let json = #"{ "OPENAI_API_KEY": "sk-json", "STRIPE_SECRET_KEY": "sk_live_x" }"#
        let result = EnvParser.parseAndClassify(json)
        let ids = Set(result.classified.map(\.providerId))
        XCTAssertEqual(ids, ["openai", "stripe"])
        XCTAssertEqual(result.stats.categories, 2, "llm + payment")
    }
}
