import XCTest
@testable import AuthBoxCrypto

final class VaultSyncReconcilerTests: XCTestCase {
    // Fixed ids keep the sorted output deterministic across runs.
    private let idA = UUID(uuidString: "00000000-0000-0000-0000-0000000000AA")!
    private let idB = UUID(uuidString: "00000000-0000-0000-0000-0000000000BB")!
    private let idC = UUID(uuidString: "00000000-0000-0000-0000-0000000000CC")!

    private let t1 = Date(timeIntervalSince1970: 1_000)
    private let t2 = Date(timeIntervalSince1970: 2_000)

    private func reconcile(_ local: [UUID: SyncState], _ remote: [UUID: SyncState]) -> [SyncDecision] {
        VaultSyncReconciler.reconcile(local: local, remote: remote)
    }

    // MARK: one side only

    func testLocalOnlyLivePushes() {
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t1)], [:]),
            [SyncDecision(id: idA, action: .push)]
        )
    }

    func testRemoteOnlyLivePulls() {
        XCTAssertEqual(
            reconcile([:], [idA: .live(updatedAt: t1)]),
            [SyncDecision(id: idA, action: .pull)]
        )
    }

    func testLocalOnlyTombstoneIsNoOp() {
        // Remote never saw the id; a local delete has nothing to propagate.
        XCTAssertEqual(reconcile([idA: .tombstone(deletedAt: t1)], [:]), [])
    }

    func testRemoteOnlyTombstoneIsNoOp() {
        XCTAssertEqual(reconcile([:], [idA: .tombstone(deletedAt: t1)]), [])
    }

    // MARK: both sides, live vs live

    func testBothLiveLocalNewerPushes() {
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t2)], [idA: .live(updatedAt: t1)]),
            [SyncDecision(id: idA, action: .push)]
        )
    }

    func testBothLiveRemoteNewerPulls() {
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t1)], [idA: .live(updatedAt: t2)]),
            [SyncDecision(id: idA, action: .pull)]
        )
    }

    func testIdenticalLiveIsNoOp() {
        XCTAssertEqual(reconcile([idA: .live(updatedAt: t1)], [idA: .live(updatedAt: t1)]), [])
    }

    // MARK: edit / delete conflicts

    func testLocalEditBeatsOlderRemoteDelete() {
        // Local edited after the remote deleted → resurrect by pushing the edit.
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t2)], [idA: .tombstone(deletedAt: t1)]),
            [SyncDecision(id: idA, action: .push)]
        )
    }

    func testRemoteDeleteBeatsOlderLocalEdit() {
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t1)], [idA: .tombstone(deletedAt: t2)]),
            [SyncDecision(id: idA, action: .pull)]
        )
    }

    func testLocalDeleteBeatsOlderRemoteEditPushes() {
        XCTAssertEqual(
            reconcile([idA: .tombstone(deletedAt: t2)], [idA: .live(updatedAt: t1)]),
            [SyncDecision(id: idA, action: .push)]
        )
    }

    func testBothTombstonedIsNoOp() {
        XCTAssertEqual(
            reconcile([idA: .tombstone(deletedAt: t1)], [idA: .tombstone(deletedAt: t2)]),
            []
        )
    }

    // MARK: exact-timestamp ties — live wins (data preservation)

    func testTieLocalLiveVsRemoteTombstoneKeepsLive() {
        XCTAssertEqual(
            reconcile([idA: .live(updatedAt: t1)], [idA: .tombstone(deletedAt: t1)]),
            [SyncDecision(id: idA, action: .push)]
        )
    }

    func testTieLocalTombstoneVsRemoteLiveKeepsLive() {
        XCTAssertEqual(
            reconcile([idA: .tombstone(deletedAt: t1)], [idA: .live(updatedAt: t1)]),
            [SyncDecision(id: idA, action: .pull)]
        )
    }

    // MARK: aggregate

    func testEmptyBothSidesIsNoOp() {
        XCTAssertEqual(reconcile([:], [:]), [])
    }

    func testMixedScenarioIsSortedAndComplete() {
        // A: local-only live → push; B: remote newer → pull; C: identical → no-op.
        let local: [UUID: SyncState] = [
            idA: .live(updatedAt: t1),
            idB: .live(updatedAt: t1),
            idC: .live(updatedAt: t2),
        ]
        let remote: [UUID: SyncState] = [
            idB: .live(updatedAt: t2),
            idC: .live(updatedAt: t2),
        ]
        XCTAssertEqual(
            reconcile(local, remote),
            [
                SyncDecision(id: idA, action: .push),
                SyncDecision(id: idB, action: .pull),
            ]
        )
    }
}
