import Foundation
import CloudKit
import OSLog
import AuthBoxCrypto

/// Drives iCloud sync of the vault using `CKSyncEngine` (iOS 17+).
///
/// `ICLOUD_SYNC_ARCHITECTURE.md` §2/§7.3: only AES-GCM ciphertext blobs ever leave
/// the device. This engine is the orchestration that the three already-proven,
/// CloudKit-free layers plug into:
/// - `VaultBlobCodec` (AuthBoxCrypto) — encrypts an item payload into a `CKRecord`
///   carrying only ciphertext, and decrypts on the way back (zero-knowledge on the wire);
/// - `VaultStore.encryptForSync` / the `VaultItemPayload` codec — the on-device crypto;
/// - `VaultSyncReconciler` — pure last-write-wins merge (used by `CKSyncEngine`'s own
///   conflict surface; the engine's record-level state mirrors its `SyncState` model).
///
/// The engine holds the `vaultKey` only in memory (handed in at unlock, cleared at lock).
/// It never persists plaintext and never uploads the seed or the vault key.
///
/// Verification posture: the codec/reconciler/blob layers are unit-tested ahead of the
/// container (see the architecture doc). This orchestration is exercised live against the
/// provisioned container `iCloud.com.authbox.vault` — the CloudKit round-trip is the
/// on-device acceptance step, not a unit test, exactly like the real-StoreKit path.
@available(iOS 17.0, *)
@MainActor
final class VaultSyncEngine {

    /// Where the apply step writes pulled items and reads local items for push.
    /// Kept as a protocol so the engine stays testable and decoupled from SwiftData.
    /// `@MainActor` so a `@MainActor` conformer (AppState) satisfies it cleanly under
    /// Swift 6 strict concurrency, and all calls happen on the main actor.
    @MainActor
    protocol VaultBackend: AnyObject {
        /// The current local item payloads keyed by id, as `VaultItemPayload` JSON.
        func localPayloadJSON(for id: UUID) -> String?
        /// Apply a pulled item (insert or update in place, preserving the id).
        func applyRemoteUpsert(id: UUID, payloadJSON: String, updatedAt: Date?)
        /// Apply a pulled deletion.
        func applyRemoteDelete(id: UUID)
        /// Called after a batch of pulls so the UI can refresh.
        func syncDidApplyRemoteChanges()
    }

    private let logger = Logger(subsystem: "com.authbox.app", category: "VaultSync")
    private let containerIdentifier = "iCloud.com.authbox.vault"
    private let zoneID = CKRecordZone.ID(zoneName: "Vault", ownerName: CKCurrentUserDefaultName)
    private let stateDefaultsKey = "authbox.cksync.stateSerialization"

    private weak var backend: VaultBackend?
    private let vaultKey: Data
    private let database: CKDatabase
    private var engine: CKSyncEngine?

    init(vaultKey: Data, backend: VaultBackend,
         container: CKContainer = CKContainer(identifier: "iCloud.com.authbox.vault")) {
        self.vaultKey = vaultKey
        self.backend = backend
        self.database = container.privateCloudDatabase
    }

    // MARK: - Lifecycle

    /// Build the engine, restoring any persisted sync state, and ensure the zone exists.
    func start() {
        guard engine == nil else { return }
        var config = CKSyncEngine.Configuration(
            database: database,
            stateSerialization: loadStateSerialization(),
            delegate: self
        )
        config.automaticallySync = true
        let engine = CKSyncEngine(config)
        self.engine = engine

        // First run (no persisted state): create the custom zone the blobs live in.
        if loadStateSerialization() == nil {
            engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: zoneID))])
        }
    }

    func stop() { engine = nil }

    // MARK: - Local change intake (called by AppState on CRUD)

    func recordLocalUpsert(id: UUID) {
        let recordID = CKRecord.ID(recordName: id.uuidString, zoneID: zoneID)
        engine?.state.add(pendingRecordZoneChanges: [.saveRecord(recordID)])
    }

    func recordLocalDelete(id: UUID) {
        let recordID = CKRecord.ID(recordName: id.uuidString, zoneID: zoneID)
        engine?.state.add(pendingRecordZoneChanges: [.deleteRecord(recordID)])
    }

    /// Enqueue every current local item for upload — used on the first sync after a
    /// device already holds a vault, so existing items propagate to a fresh device.
    func enqueueAllLocal(ids: [UUID]) {
        let changes = ids.map { CKSyncEngine.PendingRecordZoneChange.saveRecord(
            CKRecord.ID(recordName: $0.uuidString, zoneID: zoneID)) }
        engine?.state.add(pendingRecordZoneChanges: changes)
    }

    // MARK: - State persistence

    private func loadStateSerialization() -> CKSyncEngine.State.Serialization? {
        guard let data = UserDefaults.standard.data(forKey: stateDefaultsKey) else { return nil }
        return try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: data)
    }

    private func persist(_ serialization: CKSyncEngine.State.Serialization) {
        guard let data = try? JSONEncoder().encode(serialization) else { return }
        UserDefaults.standard.set(data, forKey: stateDefaultsKey)
    }
}

// MARK: - CKSyncEngineDelegate

@available(iOS 17.0, *)
extension VaultSyncEngine: CKSyncEngineDelegate {

    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        switch event {
        case let .stateUpdate(update):
            persist(update.stateSerialization)

        case let .fetchedRecordZoneChanges(changes):
            applyFetched(changes)

        case let .sentRecordZoneChanges(sent):
            // Surface failures to the log; CKSyncEngine re-queues retryable ones itself.
            for failed in sent.failedRecordSaves {
                logger.error("sync save failed: \(failed.record.recordID.recordName, privacy: .public) — \(failed.error.localizedDescription, privacy: .public)")
            }

        case .accountChange, .willFetchChanges, .didFetchChanges,
             .willSendChanges, .didSendChanges, .fetchedDatabaseChanges,
             .sentDatabaseChanges, .willFetchRecordZoneChanges, .didFetchRecordZoneChanges:
            break

        @unknown default:
            break
        }
    }

    /// Build the next batch of records to upload. CKSyncEngine asks for this whenever it
    /// has pending record-zone changes; we materialize each pending id into a ciphertext
    /// `CKRecord` via the proven `VaultBlobCodec`, reading the plaintext only here, on-device.
    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let scope = context.options.scope
        let pending = syncEngine.state.pendingRecordZoneChanges.filter { scope.contains($0) }
        guard !pending.isEmpty else { return nil }

        // Materialize every pending save into a ciphertext record *here*, on the main actor,
        // reading plaintext + vault key while we're isolated. `recordProvider` is a
        // `@Sendable async` closure that crosses the actor boundary, so it must touch no
        // isolated state — it only does a pure dictionary lookup. CKRecord is
        // `@unchecked Sendable`, so the snapshot is safe to capture.
        var records: [CKRecord.ID: CKRecord] = [:]
        for change in pending {
            guard case let .saveRecord(recordID) = change else { continue }
            if let id = UUID(uuidString: recordID.recordName),
               let payloadJSON = backend?.localPayloadJSON(for: id),
               let record = try? VaultBlobCodec.makeRecord(
                   id: id, plaintextJSON: payloadJSON, vaultKey: vaultKey,
                   updatedAt: Date(), zoneID: zoneID) {
                records[recordID] = record
            } else {
                // The item is gone locally — drop it from the push queue.
                syncEngine.state.remove(pendingRecordZoneChanges: [.saveRecord(recordID)])
            }
        }

        return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: pending) { [records] recordID in
            records[recordID]
        }
    }

    // MARK: - Apply pulls

    private func applyFetched(_ changes: CKSyncEngine.Event.FetchedRecordZoneChanges) {
        var changed = false
        for modification in changes.modifications {
            let record = modification.record
            guard let decoded = try? VaultBlobCodec.decode(record, vaultKey: vaultKey) else {
                logger.error("could not decode pulled record \(record.recordID.recordName, privacy: .public)")
                continue
            }
            backend?.applyRemoteUpsert(id: decoded.id, payloadJSON: decoded.plaintextJSON, updatedAt: decoded.updatedAt)
            changed = true
        }
        for deletion in changes.deletions {
            if let id = UUID(uuidString: deletion.recordID.recordName) {
                backend?.applyRemoteDelete(id: id)
                changed = true
            }
        }
        if changed { backend?.syncDidApplyRemoteChanges() }
    }
}
