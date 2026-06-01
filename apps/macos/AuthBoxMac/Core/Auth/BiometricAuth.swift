//
//  BiometricAuth.swift
//  P1 — Touch ID gate. Wraps LocalAuthentication behind a protocol seam so the
//  vault session is unit-testable while the real implementation uses LAContext.
//
//  Deny-by-default (ADR-003): every failure path returns .failure; nothing
//  silently downgrades to "authenticated".
//

import Foundation
import LocalAuthentication

enum AuthError: Error, Equatable {
    case biometryUnavailable   // no Touch ID hardware / not configured
    case biometryNotEnrolled   // hardware present, no fingerprints enrolled
    case userCancelled
    case authenticationFailed
    case systemCancel
    case unknown(String)
}

/// Seam: the vault session depends on this, not on LAContext directly.
protocol BiometricAuthenticating: Sendable {
    /// Returns .success only on a positive biometric match. Any error → .failure.
    func authenticate(reason: String) async -> Result<Void, AuthError>
    /// Whether biometrics are currently available + enrolled (for UI affordances).
    func availability() -> Result<Void, AuthError>
}

/// Production implementation backed by LocalAuthentication.
struct LABiometricAuth: BiometricAuthenticating {

    func availability() -> Result<Void, AuthError> {
        let ctx = LAContext()
        var nsError: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &nsError)
        if ok { return .success(()) }
        return .failure(Self.map(nsError))
    }

    func authenticate(reason: String) async -> Result<Void, AuthError> {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = ""  // no password fallback for the biometric gate
        var nsError: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &nsError) else {
            return .failure(Self.map(nsError))
        }
        do {
            try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
            return .success(())
        } catch {
            return .failure(Self.map(error as NSError))
        }
    }

    private static func map(_ error: NSError?) -> AuthError {
        guard let code = error.map({ LAError.Code(rawValue: $0.code) }) ?? nil else {
            return .unknown(error?.localizedDescription ?? "nil")
        }
        switch code {
        case .biometryNotAvailable: return .biometryUnavailable
        case .biometryNotEnrolled:  return .biometryNotEnrolled
        case .userCancel, .appCancel: return .userCancelled
        case .systemCancel: return .systemCancel
        case .authenticationFailed, .biometryLockout: return .authenticationFailed
        default: return .unknown(error?.localizedDescription ?? "unknown")
        }
    }
}
