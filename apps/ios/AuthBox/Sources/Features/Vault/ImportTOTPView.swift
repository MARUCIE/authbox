import SwiftUI
import AuthBoxCrypto

/// Add 2FA accounts by scanning a QR code or pasting a link.
///
/// One surface covers all three asks — scan, import, migrate — because they all
/// reduce to parsing a string into `[TOTP]`:
///  - a single `otpauth://` link (one account),
///  - a pasted list of links (bulk import),
///  - a Google Authenticator `otpauth-migration://` export (many accounts in one QR).
///
/// The accounts found are previewed live, then imported in one tap.
struct ImportTOTPView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var input = ""
    @State private var showScanner = false

    private var parsed: [TOTP] { OTPImport.parse(input) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        showScanner = true
                    } label: {
                        Label("Scan QR Code", systemImage: "qrcode.viewfinder")
                    }
                } footer: {
                    Text("Point the camera at a service's 2FA QR code, or at Google Authenticator's \"Transfer accounts\" / \"Export\" code to migrate many accounts at once.")
                }

                Section("Or paste a link / list") {
                    TextField("otpauth://… or otpauth-migration://…", text: $input, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(.footnote, design: .monospaced))
                        .lineLimit(3...8)
                }

                if !input.isEmpty {
                    Section(previewTitle) {
                        ForEach(Array(parsed.enumerated()), id: \.offset) { _, totp in
                            ImportPreviewRow(totp: totp)
                        }
                    }
                }
            }
            .navigationTitle("Scan & Import 2FA")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import \(parsed.count)") { importAll() }
                        .fontWeight(.semibold)
                        .disabled(parsed.isEmpty)
                }
            }
            .sheet(isPresented: $showScanner) {
                QRScannerContainer { scanned in
                    input = scanned
                    showScanner = false
                }
            }
        }
    }

    private var previewTitle: String {
        parsed.isEmpty
            ? "No accounts found"
            : "\(parsed.count) account\(parsed.count == 1 ? "" : "s") found"
    }

    private func importAll() {
        for totp in parsed {
            let title = totp.issuer ?? totp.account ?? "Authenticator"
            let item = VaultItem(
                title: title,
                username: totp.account ?? "",
                category: .login,
                otpauth: totp.otpauthURI()
            )
            appState.addItem(item)
        }
        dismiss()
    }
}

// MARK: - Preview row

private struct ImportPreviewRow: View {
    let totp: TOTP

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(totp.issuer ?? totp.account ?? "Authenticator")
                    .font(.body)
                if let account = totp.account, !account.isEmpty, totp.issuer != nil {
                    Text(account)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(totp.formattedCode())
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.blue)
        }
    }
}

// MARK: - Scanner sheet wrapper

/// Wraps the camera scanner with a cancel control and a full-bleed preview.
private struct QRScannerContainer: View {
    @Environment(\.dismiss) private var dismiss
    var onScan: (String) -> Void

    var body: some View {
        NavigationStack {
            QRScannerView(onScan: onScan)
                .ignoresSafeArea()
                .navigationTitle("Scan QR")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}
