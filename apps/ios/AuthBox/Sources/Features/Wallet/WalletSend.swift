import Foundation

/// A built + signed (but NOT yet broadcast) transaction, ready for the user to
/// review before the final confirm. Mirrors the web wallet's two-stage Review →
/// Confirm: the tx is fully assembled and signed CLIENT-SIDE here, and only the
/// explicit confirm step relays the bytes — so a mainnet money-movement passes a
/// double-confirm gate before anything leaves the device.
struct WalletSendPreview: Identifiable {
    let id = UUID()
    let coin: String            // "btc" | "eth"
    let network: String         // "mainnet" | "testnet"
    let toAddress: String
    let amountDisplay: String   // human units (BTC / ETH)
    let feeDisplay: String      // human units
    let totalDisplay: String    // amount + fee, human units
    let signedHex: String       // the raw signed tx to broadcast
    let txid: String            // BTC txid / ETH tx hash, known pre-broadcast
}

enum WalletSendError: LocalizedError {
    case locked
    case invalidAmount
    case invalidAddress
    case noFunds
    case insufficientFunds
    case signingFailed(String)

    var errorDescription: String? {
        switch self {
        case .locked: "Unlock the vault to send."
        case .invalidAmount: "Enter a valid amount (no more decimals than the coin supports)."
        case .invalidAddress: "That recipient address is not valid for this network."
        case .noFunds: "This account has no confirmed balance to spend."
        case .insufficientFunds: "Not enough confirmed balance to cover the amount plus network fee."
        case .signingFailed(let m): m
        }
    }
}

extension WalletAmount {
    /// Parse a human decimal amount ("0.001") into a smallest-unit decimal string
    /// ("100000"), with NO floating point. Rejects empty, zero, negative, multiple
    /// dots, non-digits, and sub-unit precision (more fraction digits than
    /// `decimals`). A funds-moving amount must be exact or refused — float rounding
    /// is exactly how wallets silently send the wrong value.
    static func parseSmallest(_ input: String, decimals: Int) -> String? {
        let s = input.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty, !s.hasPrefix("-") else { return nil }

        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return nil }
        var intPart = parts.count >= 1 ? String(parts[0]) : ""
        let fracPart = parts.count == 2 ? String(parts[1]) : ""
        if intPart.isEmpty { intPart = "0" }

        guard intPart.allSatisfy(\.isNumber), fracPart.allSatisfy(\.isNumber) else { return nil }
        guard fracPart.count <= decimals else { return nil }   // sub-unit precision → refuse

        let paddedFrac = fracPart + String(repeating: "0", count: decimals - fracPart.count)
        var combined = intPart + paddedFrac
        while combined.count > 1 && combined.first == "0" { combined.removeFirst() }
        guard combined != "0" else { return nil }              // zero amount → refuse
        return combined
    }
}
