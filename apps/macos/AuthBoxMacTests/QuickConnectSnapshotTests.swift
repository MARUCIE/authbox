//
//  QuickConnectSnapshotTests.swift
//  Headless visual-verification harness: renders QuickConnectSheet states to PNG
//  via SwiftUI ImageRenderer (no window, no vault unlock needed), so the UI can be
//  iterated and eyeballed deterministically. Not an assertion test — a render tap.
//

import XCTest
import SwiftUI
import AppKit
@testable import AuthBoxMac

@MainActor
final class QuickConnectSnapshotTests: XCTestCase {

    // The app is sandboxed, so the test can only write inside its container. Emit
    // to the sandbox temp dir and print the path; a non-sandboxed shell copies the
    // PNGs out to the workspace afterwards.
    private let outDir = FileManager.default.temporaryDirectory
        .appendingPathComponent("authbox-qc-snapshots", isDirectory: true)

    private func render(_ view: some View, _ name: String, width: CGFloat, height: CGFloat) throws {
        // Render at intrinsic height (width fixed, height hugs content) so the
        // snapshot matches the sheet's real self-sizing. `height` is ignored now.
        _ = height
        let framed = view
            .frame(width: width)
            .fixedSize(horizontal: false, vertical: true)
            .background(Color(nsColor: .windowBackgroundColor))
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 2
        guard let img = renderer.nsImage,
              let tiff = img.tiffRepresentation,
              let bmp = NSBitmapImageRep(data: tiff),
              let png = bmp.representation(using: .png, properties: [:]) else {
            throw XCTSkip("ImageRenderer produced no image on this host")
        }
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        try png.write(to: outDir.appendingPathComponent("\(name).png"))
    }

    func test_render_quickconnect_states() throws {
        let existing = [
            VaultCategorySummary(id: "llm", name: "LLM", count: 4),
            VaultCategorySummary(id: "payment", name: "Payment", count: 1),
            VaultCategorySummary(id: "cloud_infra", name: "Cloud Infrastructure", count: 2),
            VaultCategorySummary(id: "search_web", name: "Search & Web", count: 1),
        ]
        try render(QuickConnectSheet(existing: existing, hasVaultKey: true,
                                     onConnectExisting: { _ in }, onImport: { _, _ in }),
                   "01-existing", width: 500, height: 410)

        try render(QuickConnectSheet(existing: [], hasVaultKey: true,
                                     onConnectExisting: { _ in }, onImport: { _, _ in }),
                   "02-empty", width: 500, height: 560)

        try render(QuickConnectSheet(existing: [], hasVaultKey: false,
                                     onConnectExisting: { _ in }, onImport: { _, _ in }),
                   "03-empty-locked", width: 500, height: 560)

        print("SNAPSHOT_DIR=\(outDir.path)")
    }
}
