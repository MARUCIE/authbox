import Foundation
#if canImport(AppKit)
import AppKit
#endif

/// Clipboard writes for secrets (passwords, agent tokens).
///
/// Plain `.string` writes leave the secret readable by every app, visible to
/// clipboard managers, and synced to the user's other devices via Universal
/// Clipboard — indefinitely. This helper:
///   - marks the entry concealed (password managers' convention, honored by
///     well-behaved clipboard history tools),
///   - marks it transient (excluded from Universal Clipboard / history),
///   - auto-clears after `expiry` seconds if the clipboard is unchanged.
enum SecretPasteboard {
    static let defaultExpiry: TimeInterval = 45

    #if canImport(AppKit)
    private static let concealedType = NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")
    private static let transientType = NSPasteboard.PasteboardType("org.nspasteboard.TransientType")

    static func copy(_ secret: String, expiry: TimeInterval = defaultExpiry) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString("", forType: concealedType)
        pasteboard.setString("", forType: transientType)
        pasteboard.setString(secret, forType: .string)

        let stamped = pasteboard.changeCount
        DispatchQueue.main.asyncAfter(deadline: .now() + expiry) {
            // Only clear if nothing else was copied in the meantime.
            if pasteboard.changeCount == stamped {
                pasteboard.clearContents()
            }
        }
    }
    #else
    static func copy(_ secret: String, expiry: TimeInterval = defaultExpiry) {}
    #endif
}
