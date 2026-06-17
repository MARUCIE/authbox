import XCTest

/// End-to-end UI test pipeline for Auth Box.
/// Walks through: Onboarding → Create Vault → Seed Backup → Password → Vault → Add → Generator → Settings → Lock
/// Takes a screenshot at each step.
@MainActor
final class FullFlowUITests: XCTestCase {

    let app = XCUIApplication()
    let screenshotDir = "/tmp/authbox-screenshots"

    override func setUpWithError() throws {
        continueAfterFailure = true
        try? FileManager.default.createDirectory(atPath: screenshotDir, withIntermediateDirectories: true)
    }

    func testFullOnboardingAndVaultFlow() throws {
        app.launchArguments = ["--reset-test-vault"]
        app.launch()

        // ─── Step 1: Onboarding ───
        sleep(2)
        takeScreenshot("01-onboarding")

        // Find button by predicate (handles custom accessibility labels)
        let createButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'create'")).firstMatch
        XCTAssertTrue(createButton.waitForExistence(timeout: 5), "Create button should exist")
        createButton.tap()

        // ─── Step 2: Generate Seed ───
        sleep(1)
        takeScreenshot("02-create-generate")

        let generateButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'generate'")).firstMatch
        if generateButton.waitForExistence(timeout: 3) {
            generateButton.tap()
        }

        // ─── Step 3: Seed Backup Grid ───
        sleep(1)
        takeScreenshot("03-seed-backup")

        let writtenButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'written'")).firstMatch
        if writtenButton.waitForExistence(timeout: 3) {
            writtenButton.tap()
        }

        // ─── Step 4: Master Password ───
        sleep(1)
        takeScreenshot("04-master-password")

        // Fill password fields
        let secureFields = app.secureTextFields
        if secureFields.count >= 1 {
            secureFields.element(boundBy: 0).tap()
            secureFields.element(boundBy: 0).typeText("TestPassword123!")
            sleep(1)
            takeScreenshot("04b-password-strength")
        }
        if secureFields.count >= 2 {
            secureFields.element(boundBy: 1).tap()
            secureFields.element(boundBy: 1).typeText("TestPassword123!")
        }
        sleep(1)
        takeScreenshot("04c-password-filled")

        // Create vault
        let createVault = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'create vault'")).firstMatch
        if createVault.waitForExistence(timeout: 3) {
            createVault.tap()
        }

        // ─── Step 5: Vault (empty) ───
        sleep(2)
        takeScreenshot("05-vault-empty")

        // ─── Step 6: Add Password ───
        let plusButton = app.buttons.matching(NSPredicate(format: "label == 'Add'")).firstMatch
        if !plusButton.exists {
            // Try navigation bar buttons
            let navPlus = app.navigationBars.buttons.element(boundBy: app.navigationBars.buttons.count - 1)
            if navPlus.exists { navPlus.tap() }
        } else {
            plusButton.tap()
        }

        sleep(1)
        takeScreenshot("06-add-password")

        // Fill form
        let titleField = app.textFields.matching(NSPredicate(format: "placeholderValue == 'Title'")).firstMatch
        if titleField.exists {
            titleField.tap()
            titleField.typeText("GitHub")
        }

        let usernameField = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'Username'")).firstMatch
        if usernameField.exists {
            usernameField.tap()
            usernameField.typeText("dev@example.com")
        }
        sleep(1)
        takeScreenshot("06b-add-filled")

        // Save
        let saveButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'save'")).firstMatch
        if saveButton.exists { saveButton.tap() }
        sleep(1)
        takeScreenshot("06c-vault-with-item")

        // ─── Step 7: Generator Tab ───
        let generatorTab = tabButton("Generator")
        if generatorTab.waitForExistence(timeout: 3) {
            generatorTab.tap()
            sleep(1)

            let siteField = app.textFields.matching(NSPredicate(format: "placeholderValue CONTAINS 'github'")).firstMatch
            if siteField.exists {
                siteField.tap()
                siteField.typeText("github.com")
                sleep(1)
            }
            takeScreenshot("07-generator")
        }

        // ─── Step 8: Settings Tab ───
        let settingsTab = tabButton("Settings")
        if settingsTab.waitForExistence(timeout: 3) {
            settingsTab.tap()
            sleep(1)
            takeScreenshot("08-settings")
        }

        // ─── Step 9: Lock → Unlock ───
        let vaultTab = tabButton("Vault")
        if vaultTab.waitForExistence(timeout: 3) {
            vaultTab.tap()
            sleep(1)

            // Find lock button
            let lockButton = app.navigationBars.buttons.firstMatch
            if lockButton.exists {
                lockButton.tap()
                sleep(1)
                takeScreenshot("09-unlock-screen")
            }
        }

        // ─── Print results ───
        let screenshots = (try? FileManager.default.contentsOfDirectory(atPath: screenshotDir)) ?? []
        print("\n=== FULL FLOW TEST COMPLETE ===")
        print("Screenshots: \(screenshots.count) saved to \(screenshotDir)")
        for s in screenshots.sorted() { print("  - \(s)") }
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

    /// Form-factor-agnostic tab button. iPhone renders the TabView as a bottom
    /// XCUIElementTypeTabBar; iPad (iOS 18+) renders it as a floating top tab bar
    /// (_UIFloatingTabBarItemCell/View) whose label matches multiple elements.
    /// Prefer the bar, fall back to the top-pill button (firstMatch) so the same
    /// flow test exercises the tabs on both form factors instead of silently skipping.
    private func tabButton(_ name: String) -> XCUIElement {
        let inBar = app.tabBars.buttons[name]
        if inBar.waitForExistence(timeout: 4) { return inBar }
        return app.buttons[name].firstMatch
    }
}
