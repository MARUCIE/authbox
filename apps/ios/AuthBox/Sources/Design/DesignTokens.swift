import SwiftUI

/// Vault Onyx design system — shared tokens for Auth Box iOS.
enum VaultOnyx {

    // MARK: - Colors

    /// Dark theme (Onboarding + Unlock)
    static let navyTop = Color(red: 0.04, green: 0.086, blue: 0.157)       // #0A1628
    static let navyBottom = Color(red: 0.102, green: 0.153, blue: 0.267)    // #1A2744
    static let accentBlue = Color(red: 0.231, green: 0.510, blue: 0.965)    // #3B82F6

    /// Dark surfaces (full-app dark theme)
    static let cardBackground = Color(red: 0.11, green: 0.11, blue: 0.118)      // #1C1C1E
    static let fieldBackground = Color(red: 0.17, green: 0.17, blue: 0.18)       // #2C2C2E
    static let surfaceBorder = Color.white.opacity(0.08)
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.6)
    static let textTertiary = Color.white.opacity(0.35)

    /// Category colors
    static let loginPurple = Color.purple
    static let apiOrange = Color.orange
    static let cardGreen = Color.green
    static let notesBlue = Color.blue
    static let identityIndigo = Color.indigo

    // MARK: - Gradients

    static var darkBackground: LinearGradient {
        LinearGradient(
            colors: [navyTop, navyBottom],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    static var iconGradient: LinearGradient {
        LinearGradient(
            colors: [.blue.opacity(0.7), .blue],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Dimensions

    static let cornerRadius: CGFloat = 14
    static let buttonPadding: CGFloat = 16
    static let horizontalPadding: CGFloat = 24
    static let bottomPadding: CGFloat = 20
}

// MARK: - Reusable Button Styles

struct PrimaryButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, VaultOnyx.buttonPadding)
            .background(VaultOnyx.accentBlue)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: VaultOnyx.cornerRadius))
    }
}

struct SecondaryDarkButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, VaultOnyx.buttonPadding)
            .background(.white.opacity(0.08))
            .foregroundStyle(.white.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: VaultOnyx.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: VaultOnyx.cornerRadius)
                    .stroke(.white.opacity(0.2), lineWidth: 1)
            )
    }
}

struct DarkFieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(VaultOnyx.fieldBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(.white)
    }
}

extension View {
    func primaryButton() -> some View { modifier(PrimaryButtonStyle()) }
    func secondaryDarkButton() -> some View { modifier(SecondaryDarkButtonStyle()) }
    func darkField() -> some View { modifier(DarkFieldStyle()) }
}
