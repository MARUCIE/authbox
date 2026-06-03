import XCTest

/// Verifies the iOS surface of "scan / import / migrate 2FA accounts".
///
/// The camera path is device-only (the simulator has no camera), so this test
/// drives the equivalent paste path — which runs the SAME `OTPImport.parse` the
/// scanner feeds. The migration protobuf decode itself is proven at the engine
/// level in AuthBoxCryptoTests/OTPMigrationTests; here we prove the UI chain:
/// open the importer, parse an otpauth link, preview the account, import it, and
/// see it land in the vault.
@MainActor
final class TOTPImportFlowUITests: XCTestCase {

    let app = XCUIApplication()
    let screenshotDir = "/Users/mauricewen/00-AI-Fleet/state/screenshots/authbox-ios-uxmap"

    override func setUpWithError() throws {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
    }

    func testImportFromPastedOtpauthLink() throws {
        app.launchArguments = ["--reset-test-vault", "--totp-demo-seed"]
        app.launch()
        sleep(2)

        // Open the add menu (trailing nav-bar button) and choose Scan & Import.
        let navBar = app.navigationBars["Vault"]
        XCTAssertTrue(navBar.waitForExistence(timeout: 8), "Vault screen should be visible")
        let addMenu = navBar.buttons.element(boundBy: navBar.buttons.count - 1)
        addMenu.tap()

        let importEntry = app.buttons["Scan & Import 2FA"].firstMatch
        XCTAssertTrue(importEntry.waitForExistence(timeout: 3), "Menu must offer Scan & Import 2FA")
        importEntry.tap()
        sleep(1)
        takeScreenshot("totp-import-r1-sheet")

        // Paste a single otpauth:// link (the scanner would yield the same string).
        let field = app.textFields
            .matching(NSPredicate(format: "placeholderValue BEGINSWITH 'otpauth'"))
            .firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3), "Paste field must exist")
        field.tap()
        app.typeText("otpauth://totp/Acme:bob@acme.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Acme")
        sleep(1)

        // The live preview must report exactly one parsed account.
        let foundHeader = app.staticTexts
            .matching(NSPredicate(format: "label CONTAINS[c] 'account found'"))
            .firstMatch
        XCTAssertTrue(foundHeader.waitForExistence(timeout: 3),
                      "Preview must show the parsed-account count")
        takeScreenshot("totp-import-r2-preview")

        // Import it.
        let importButton = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Import'")
        ).firstMatch
        XCTAssertTrue(importButton.waitForExistence(timeout: 3), "Import button must exist")
        importButton.tap()
        sleep(1)

        // The imported account (title = issuer "Acme") must appear in the vault.
        let imported = app.staticTexts["Acme"].firstMatch
        XCTAssertTrue(imported.waitForExistence(timeout: 5),
                      "Imported 2FA account must appear in the vault list")
        takeScreenshot("totp-import-r3-in-vault")
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
