import AuthenticationServices
import SwiftData
import SwiftUI

/// Credential Provider Extension for iOS AutoFill.
///
/// Flow:
/// 1. iOS calls prepareCredentialList → show matching credentials
/// 2. User taps a credential → provideCredential → fill the login form
///
/// Data access: reads from App Groups shared SwiftData container.
/// The main app writes credential metadata; this extension reads it.
class CredentialProviderViewController: ASCredentialProviderViewController {

    private var credentials: [(id: String, title: String, username: String, password: String)] = []

    // MARK: - Credential List

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        // Load credentials from App Groups SwiftData
        let domains = serviceIdentifiers.map { $0.identifier.lowercased() }

        do {
            let store = try SharedCredentialStore()
            let all = try store.fetchAll()

            // Filter by matching domains (or show all if no match)
            if domains.isEmpty {
                credentials = all
            } else {
                credentials = all.filter { cred in
                    domains.contains(where: { domain in
                        cred.title.localizedCaseInsensitiveContains(domain) ||
                        cred.id.localizedCaseInsensitiveContains(domain)
                    })
                }
                // Fallback: show all if no domain match
                if credentials.isEmpty {
                    credentials = all
                }
            }

            // Present credential list UI
            let listView = CredentialListView(
                credentials: credentials,
                onSelect: { [weak self] selected in
                    let credential = ASPasswordCredential(
                        user: selected.username,
                        password: selected.password
                    )
                    self?.extensionContext.completeRequest(
                        withSelectedCredential: credential
                    )
                },
                onCancel: { [weak self] in
                    self?.extensionContext.cancelRequest(
                        withError: NSError(
                            domain: ASExtensionErrorDomain,
                            code: ASExtensionError.userCanceled.rawValue
                        )
                    )
                }
            )

            let hostingController = UIHostingController(rootView: listView)
            addChild(hostingController)
            view.addSubview(hostingController.view)
            hostingController.view.frame = view.bounds
            hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            hostingController.didMove(toParent: self)

        } catch {
            extensionContext.cancelRequest(withError: NSError(
                domain: ASExtensionErrorDomain,
                code: ASExtensionError.failed.rawValue
            ))
        }
    }

    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        // Require user interaction for security
        extensionContext.cancelRequest(withError: NSError(
            domain: ASExtensionErrorDomain,
            code: ASExtensionError.userInteractionRequired.rawValue
        ))
    }
}

// MARK: - Credential List SwiftUI View

private struct CredentialListView: View {
    let credentials: [(id: String, title: String, username: String, password: String)]
    let onSelect: ((id: String, title: String, username: String, password: String)) -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if credentials.isEmpty {
                    ContentUnavailableView(
                        "No Passwords",
                        systemImage: "key.slash",
                        description: Text("Open Auth Box to add passwords.")
                    )
                } else {
                    ForEach(credentials, id: \.id) { cred in
                        Button {
                            onSelect(cred)
                        } label: {
                            HStack {
                                Image(systemName: "key.fill")
                                    .foregroundStyle(.tint)
                                VStack(alignment: .leading) {
                                    Text(cred.title)
                                        .font(.body)
                                    Text(cred.username)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Auth Box")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
    }
}

// MARK: - Shared Credential Store (App Groups)

/// Reads credential metadata from the App Groups shared container.
/// The main app is responsible for writing this data.
private struct SharedCredentialStore {
    private let fileURL: URL

    init() throws {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.authbox.shared"
        ) else {
            throw NSError(domain: "AuthBox", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "App Group container not available"
            ])
        }
        fileURL = containerURL.appendingPathComponent("credentials.json")
    }

    func fetchAll() throws -> [(id: String, title: String, username: String, password: String)] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }
        let data = try Data(contentsOf: fileURL)
        let items = try JSONDecoder().decode([SharedCredential].self, from: data)
        return items.map { ($0.id, $0.title, $0.username, $0.password) }
    }

    /// Called by the main app to write credentials for AutoFill access.
    static func writeCredentials(
        _ items: [(id: String, title: String, username: String, password: String)]
    ) throws {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.authbox.shared"
        ) else { return }

        let fileURL = containerURL.appendingPathComponent("credentials.json")
        let shared = items.map { SharedCredential(id: $0.0, title: $0.1, username: $0.2, password: $0.3) }
        let data = try JSONEncoder().encode(shared)
        try data.write(to: fileURL, options: .completeFileProtection)
    }
}

private struct SharedCredential: Codable {
    let id: String
    let title: String
    let username: String
    let password: String
}
