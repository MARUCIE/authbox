import Foundation

/// The pure, transport-free core of iCloud vault sync.
///
/// `ICLOUD_SYNC_ARCHITECTURE.md` §2 decided the v1 strategy: **last-write-wins
/// on `updatedAt`**, deletes carried as tombstones. That merge decision is the
/// bug-prone heart of any sync engine; the CloudKit round-trip that feeds it
/// real records is mechanical glue (and entitlement-gated — see §5). So the
/// reconcile is split out here as a value type with zero CloudKit dependency,
/// provable on its own — the same posture that proved the encrypt/decrypt codec
/// ahead of the paid container (`VaultSyncCodecTests`).
///
/// The reconciler never sees plaintext or ciphertext: it decides *which side
/// wins per item id* from timestamps alone. The caller then ships the winning
/// side's encrypted blob (push) or applies the remote blob locally (pull).

/// One side's knowledge of a single item, keyed by the item's stable `id`.
public enum SyncState: Equatable, Sendable {
    /// The item exists and was last modified at this time.
    case live(updatedAt: Date)
    /// The item was deleted at this time (a tombstone).
    case tombstone(deletedAt: Date)

    var timestamp: Date {
        switch self {
        case let .live(t): return t
        case let .tombstone(t): return t
        }
    }

    var isTombstone: Bool {
        if case .tombstone = self { return true }
        return false
    }
}

/// What the caller must do to bring the two sides into agreement for one item.
public enum SyncAction: Equatable, Sendable {
    /// Local wins — upload the local state (upsert or delete) to remote.
    case push
    /// Remote wins — apply the remote state (upsert or delete) locally.
    case pull
}

public struct SyncDecision: Equatable, Sendable {
    public let id: UUID
    public let action: SyncAction

    public init(id: UUID, action: SyncAction) {
        self.id = id
        self.action = action
    }
}

public enum VaultSyncReconciler {
    /// Reconcile two per-id state maps into the minimal set of push/pull actions.
    ///
    /// Items already in agreement (identical state, or both tombstoned, or a
    /// tombstone the other side never knew about) produce no action. Results are
    /// sorted by id for deterministic output.
    ///
    /// Conflict rule (last-write-wins):
    /// - the side with the later `timestamp` wins;
    /// - on an exact-timestamp tie between a live edit and a tombstone, the
    ///   **live** state wins. A vault credential is more costly to silently lose
    ///   than to keep one extra beat (the user can re-delete); exact-millisecond
    ///   collisions across devices are pathological anyway.
    public static func reconcile(
        local: [UUID: SyncState],
        remote: [UUID: SyncState]
    ) -> [SyncDecision] {
        var decisions: [SyncDecision] = []
        let ids = Set(local.keys).union(remote.keys)

        for id in ids {
            guard let action = decide(local: local[id], remote: remote[id]) else { continue }
            decisions.append(SyncDecision(id: id, action: action))
        }

        return decisions.sorted { $0.id.uuidString < $1.id.uuidString }
    }

    /// Returns the action for one item, or `nil` when the two sides already agree.
    private static func decide(local: SyncState?, remote: SyncState?) -> SyncAction? {
        switch (local, remote) {
        case let (.some(l), .none):
            // Remote never saw this id. A local tombstone has nothing to delete
            // remotely; a live item must be pushed.
            return l.isTombstone ? nil : .push

        case let (.none, .some(r)):
            return r.isTombstone ? nil : .pull

        case let (.some(l), .some(r)):
            if l == r { return nil }
            // Both deleted converge to the same end state (item absent on both
            // sides) regardless of when — LWW only matters when end states differ.
            if l.isTombstone, r.isTombstone { return nil }
            if l.timestamp > r.timestamp { return .push }
            if r.timestamp > l.timestamp { return .pull }
            // Equal timestamps, differing state: keep the live side (see doc above).
            return l.isTombstone ? .pull : .push

        case (.none, .none):
            return nil
        }
    }
}
