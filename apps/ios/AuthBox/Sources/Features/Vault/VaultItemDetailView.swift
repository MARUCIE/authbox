import SwiftUI
import AuthBoxCrypto

struct VaultItemDetailView: View {
    let item: VaultItem
    @State private var showPassword = false
    @State private var copiedField: String?

    var body: some View {
        List {
            // Header
            Section {
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(iconColor.opacity(0.12))
                            .frame(width: 48, height: 48)
                        Image(systemName: item.category.iconName)
                            .font(.system(size: 22, weight: .medium))
                            .foregroundStyle(iconColor)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.title)
                            .font(.title3.bold())
                        Text(item.category.displayName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if item.isFavorite {
                        Image(systemName: "star.fill")
                            .foregroundStyle(.yellow)
                    }
                }
                .padding(.vertical, 4)
            }

            // Credentials
            Section("Credentials") {
                // Username
                if !item.username.isEmpty {
                    FieldRow(
                        label: "Username",
                        value: item.username,
                        icon: "person.fill",
                        isCopied: copiedField == "username"
                    ) {
                        copy(item.username, field: "username")
                    }
                }

                // Password
                if !item.password.isEmpty {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Password")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if showPassword {
                                Text(item.password)
                                    .font(.system(.body, design: .monospaced))
                            } else {
                                Text(String(repeating: "\u{2022}", count: min(item.password.count, 16)))
                                    .font(.body)
                            }
                        }

                        Spacer()

                        Button {
                            showPassword.toggle()
                        } label: {
                            Image(systemName: showPassword ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }

                        Button {
                            copy(item.password, field: "password")
                        } label: {
                            Image(systemName: copiedField == "password" ? "checkmark.circle.fill" : "doc.on.doc")
                                .foregroundStyle(copiedField == "password" ? .green : .blue)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }

            // One-time password (2FA)
            if let totp = TOTP.parse(item.otpauth) {
                Section("One-Time Password") {
                    TOTPCodeView(totp: totp)
                }
            }

            // Website
            if !item.uri.isEmpty {
                Section("Website") {
                    FieldRow(
                        label: "URL",
                        value: item.uri,
                        icon: "globe",
                        isCopied: copiedField == "uri"
                    ) {
                        copy(item.uri, field: "uri")
                    }
                }
            }

            // Notes
            if !item.notes.isEmpty {
                Section("Notes") {
                    Text(item.notes)
                        .font(.body)
                        .textSelection(.enabled)
                }
            }

            // Metadata
            Section("Info") {
                HStack {
                    Text("Created")
                    Spacer()
                    Text(item.createdAt, style: .date)
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Updated")
                    Spacer()
                    Text(item.updatedAt, style: .date)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var iconColor: Color {
        switch item.category {
        case .login: .purple
        case .apiKey: .orange
        case .card: .green
        case .secureNote: .blue
        case .identity: .indigo
        }
    }

    private func copy(_ value: String, field: String) {
        UIPasteboard.general.string = value
        withAnimation(.easeInOut(duration: 0.2)) { copiedField = field }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation { if copiedField == field { copiedField = nil } }
        }
    }
}

// MARK: - One-Time Password Row

/// Live TOTP code with a per-second countdown ring. `TimelineView` redraws every
/// second, so the code is always a pure function of the current time — never
/// stored, never stale. Tap to copy the raw (un-spaced) code.
private struct TOTPCodeView: View {
    let totp: TOTP
    @State private var copied = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = totp.secondsRemaining(at: context.date)
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    if let issuer = totp.issuer, !issuer.isEmpty {
                        Text(issuer)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(totp.formattedCode(at: context.date))
                        .font(.system(.title2, design: .monospaced))
                        .fontWeight(.semibold)
                        .foregroundStyle(.blue)
                        .contentTransition(.numericText())
                        .monospacedDigit()
                }

                Spacer()

                // Countdown ring: drains over the period, turns red in the last 5s.
                ZStack {
                    Circle()
                        .stroke(Color(.systemGray5), lineWidth: 3)
                    Circle()
                        .trim(from: 0, to: CGFloat(remaining) / CGFloat(totp.period))
                        .stroke(remaining <= 5 ? Color.red : Color.blue,
                                style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(remaining)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .frame(width: 30, height: 30)

                Button {
                    UIPasteboard.general.string = totp.code(at: context.date)
                    withAnimation(.easeInOut(duration: 0.2)) { copied = true }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { copied = false }
                    }
                } label: {
                    Image(systemName: copied ? "checkmark.circle.fill" : "doc.on.doc")
                        .foregroundStyle(copied ? .green : .blue)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 2)
        }
    }
}

// MARK: - Reusable Field Row

private struct FieldRow: View {
    let label: String
    let value: String
    let icon: String
    let isCopied: Bool
    let onCopy: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.body)
                    .textSelection(.enabled)
            }

            Spacer()

            Button(action: onCopy) {
                Image(systemName: isCopied ? "checkmark.circle.fill" : "doc.on.doc")
                    .foregroundStyle(isCopied ? .green : .blue)
            }
        }
        .padding(.vertical, 2)
    }
}
