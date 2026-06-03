import XCTest

/// Visual-verification pipeline for the iOS wallet (cross-platform parity with
/// the web Phase 4/5a wallet). Boots straight into an unlocked vault derived
/// from the public all-zeros test mnemonic (via `--wallet-demo-seed`), so the
/// wallet screens render the canonical addresses with REAL on-chain balances.
///
/// Three rounds, matching the goal's "视觉验证3轮":
///   R1 — Wallet tab reachable + true empty state
///   R2 — add a Bitcoin account → derived bech32 address + live balance
///   R3 — add an Ethereum account → multi-coin list + EIP-55 address + balance
///
/// Screenshots land in the AI-Fleet workspace (durable), not /tmp.
@MainActor
final class WalletFlowUITests: XCTestCase {

    let app = XCUIApplication()
    let screenshotDir = "/Users/mauricewen/00-AI-Fleet/state/screenshots/authbox-ios-uxmap"

    override func setUpWithError() throws {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
    }

    func testWalletThreeRoundVisualVerification() throws {
        // Reset wipes Keychain seed + SwiftData + saved wallet accounts; the
        // demo-seed hook then creates an unlocked vault from the test mnemonic.
        app.launchArguments = ["--reset-test-vault", "--wallet-demo-seed"]
        app.launch()
        sleep(2)

        // ─── Round 1: reach the Wallet tab, capture the empty state ───
        let walletTab = app.tabBars.buttons["Wallet"]
        XCTAssertTrue(walletTab.waitForExistence(timeout: 8), "Wallet tab should be present in the unlocked vault")
        walletTab.tap()
        sleep(1)
        takeScreenshot("wallet-r1-empty")

        // ─── Round 2: add a Bitcoin account ───
        tapAdd()
        sleep(1)
        takeScreenshot("wallet-r2-add-sheet-btc")
        // Default coin is Bitcoin / mainnet / native segwit — just confirm.
        tapConfirmAdd()
        sleep(1)
        takeScreenshot("wallet-r2-btc-in-list")

        // Open the BTC account detail → derived address + live balance.
        let btcRow = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'bitcoin'")).firstMatch
        if !btcRow.waitForExistence(timeout: 3) {
            app.cells.firstMatch.tap()
        } else {
            btcRow.tap()
        }
        // Balance lookup hits mempool.space; give the network a moment.
        sleep(4)
        takeScreenshot("wallet-r2-btc-detail")

        // Back to the wallet list.
        app.navigationBars.buttons.firstMatch.tap()
        sleep(1)

        // ─── Round 3: add an Ethereum account, capture multi-coin parity ───
        tapAdd()
        sleep(1)
        // Switch the segmented coin picker to Ethereum.
        let ethSegment = app.buttons["Ethereum"].firstMatch
        if ethSegment.waitForExistence(timeout: 3) {
            ethSegment.tap()
        }
        sleep(1)
        takeScreenshot("wallet-r3-add-sheet-eth")
        tapConfirmAdd()
        sleep(1)
        takeScreenshot("wallet-r3-multicoin-list")

        // Open the ETH detail → EIP-55 address + live balance.
        let ethRow = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'ethereum'")).firstMatch
        if ethRow.waitForExistence(timeout: 3) {
            ethRow.tap()
            sleep(4)
            takeScreenshot("wallet-r3-eth-detail")
        }

        // ─── Summary ───
        let shots = (try? FileManager.default.contentsOfDirectory(atPath: screenshotDir)) ?? []
        print("\n=== WALLET 3-ROUND VISUAL VERIFICATION COMPLETE ===")
        print("Screenshots: \(shots.count) in \(screenshotDir)")
        for s in shots.sorted() { print("  - \(s)") }
    }

    // MARK: - Helpers

    /// Tap the navigation "+" (primaryAction) to open the add-account sheet.
    private func tapAdd() {
        let plus = app.navigationBars.buttons.matching(NSPredicate(format: "label == 'Add' OR label == 'plus'")).firstMatch
        if plus.waitForExistence(timeout: 3) {
            plus.tap()
        } else {
            // Fallback: last nav-bar button is the primaryAction "+".
            let buttons = app.navigationBars.buttons
            if buttons.count > 0 { buttons.element(boundBy: buttons.count - 1).tap() }
        }
    }

    /// Tap the sheet's confirmationAction "Add" button.
    private func tapConfirmAdd() {
        let add = app.buttons.matching(NSPredicate(format: "label == 'Add'")).firstMatch
        if add.waitForExistence(timeout: 3) { add.tap() }
    }

    private func takeScreenshot(_ name: String) {
        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        let path = "\(screenshotDir)/\(name).png"
        try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: path))
        print("Screenshot: \(name).png")
    }
}
