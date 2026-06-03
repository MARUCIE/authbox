import XCTest

/// Visual + functional verification for the built-in authenticator (TOTP / 2FA).
/// The engine itself is proven against the RFC 6238 vectors in
/// AuthBoxCryptoTests/TOTPTests; here we prove the iOS surface: a stored secret
/// renders a live rotating code, and the add flow validates an entered key.
///
/// Screenshots land in the AI-Fleet workspace (durable), not /tmp.
@MainActor
final class TOTPFlowUITests: XCTestCase {

    let app = XCUIApplication()
    let screenshotDir = "/Users/mauricewen/00-AI-Fleet/state/screenshots/authbox-ios-uxmap"

    override func setUpWithError() throws {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
    }

    /// A vault item carrying a TOTP secret shows a live 6-digit code + countdown.
    func testTOTPCodeDisplaysOnItemDetail() throws {
        app.launchArguments = ["--reset-test-vault", "--totp-demo-seed"]
        app.launch()
        sleep(2)
        takeScreenshot("totp-r1-vault-list")

        // Open the demo login that carries a TOTP secret.
        let row = app.staticTexts["GitHub"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 8), "Demo GitHub item should be in the vault")
        row.tap()
        sleep(1)

        // The One-Time Password section must render a live 6-digit code ("123 456").
        XCTAssertTrue(app.staticTexts["One-Time Password"].waitForExistence(timeout: 3),
                      "Detail must show the One-Time Password section")
        let code = app.staticTexts.matching(
            NSPredicate(format: "label MATCHES %@", "[0-9]{3} [0-9]{3}")
        ).firstMatch
        XCTAssertTrue(code.waitForExistence(timeout: 3),
                      "A live 6-digit TOTP code must be displayed")
        takeScreenshot("totp-r2-live-code")

        // The code is a function of time — re-read after a second; it stays a
        // valid 6-digit code (it only changes at the 30s boundary).
        sleep(2)
        let codeStill = app.staticTexts.matching(
            NSPredicate(format: "label MATCHES %@", "[0-9]{3} [0-9]{3}")
        ).firstMatch
        XCTAssertTrue(codeStill.exists, "Code must keep rendering as it ticks")
        takeScreenshot("totp-r3-code-ticking")
    }

    /// The add flow validates an entered authenticator key and previews the code.
    func testAddFlowValidatesAuthenticatorKey() throws {
        app.launchArguments = ["--reset-test-vault", "--totp-demo-seed"]
        app.launch()
        sleep(2)

        // Open the add menu (trailing nav-bar button) and choose New Password.
        let navBar = app.navigationBars["Vault"]
        XCTAssertTrue(navBar.waitForExistence(timeout: 8), "Vault screen should be visible")
        navBar.buttons.element(boundBy: navBar.buttons.count - 1).tap()
        let newPassword = app.buttons["New Password"].firstMatch
        XCTAssertTrue(newPassword.waitForExistence(timeout: 3), "Add menu must offer New Password")
        newPassword.tap()
        sleep(1)

        app.textFields["Title"].tap()
        app.typeText("Demo 2FA")

        // Enter a bare base32 secret (no URI special characters to type).
        let otpField = app.textFields["otpauth:// link or secret key"]
        XCTAssertTrue(otpField.waitForExistence(timeout: 3), "Authenticator key field must exist")
        otpField.tap()
        app.typeText("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
        sleep(1)

        // The live validator must confirm the key is valid.
        let valid = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Valid'")
        ).firstMatch
        XCTAssertTrue(valid.waitForExistence(timeout: 3),
                      "Entering a valid base32 key must show the 'Valid · code' confirmation")
        takeScreenshot("totp-r4-add-validates")
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
