# Stitch Design Pipeline Report -- Auth Box v2

> Date: 2026-03-20
> Stitch Project: `projects/10513833126747888133`
> Design System: Vault Onyx -- The Fortified Interface
> Model: Gemini 3.1 Pro (P0 screens) + Gemini 3 Flash (P1 screens)

## Pipeline Summary

| Phase | Status | Duration |
|-------|--------|----------|
| Phase 1: Requirements Extraction | DONE | Pre-existing PRD + UX Map |
| Phase 2: Screen Generation | DONE | 10/10 screens, 3 batches |
| Phase 3: AI Auto-Compare | SKIPPED (single variant per screen) | -- |
| Phase 4: Winner Selection | ALL SCREENS = WINNERS | -- |
| Phase 5: Frontend Code Gen | PENDING | Next phase |

## Generated Screens

### P0 Core (Web App)

1. **Landing Page** (`b16c3dba`)
   - Hero + 3 pillars + How It Works + Trust Signals + Encryption Diagram
   - Height: 7478px (long-scroll marketing page)

2. **Register** (`57ad01bc`)
   - Glassmorphic card + password strength meter + encryption ceremony
   - Height: 2688px

3. **Login** (`0e0c4b15`)
   - SRP-6a handshake visualization (7-step progress)
   - Height: 2504px

4. **Passwords Vault** (`2fe2b28e`)
   - Sidebar + split-pane (list + detail panel)
   - 8 realistic credentials (GitHub, AWS, Stripe, etc.)
   - Height: 2048px

5. **AI Agents** (`641064cc`)
   - Agent list + detail panel + policies table + audit events
   - 4 agents (Claude Code, GitHub Copilot, Data Analyst, Legacy Script)
   - Height: 2048px

6. **Audit Log** (`f40e19dd`)
   - Hash chain visualization + dense event table + expanded row detail
   - Decision badges: ALLOW/DENY/STEP-UP color coded
   - Height: 3122px

7. **Settings** (`fd5781d7`)
   - 5 sections: Account, 2FA, Sessions, Data, About
   - 6-digit TOTP input + recovery codes grid
   - Height: 3870px

### P1 Console (Public Portal)

8. **Console Dashboard** (`3e7f4c45`)
   - Top nav + stats + quick actions + activity + health
   - Height: 2048px

9. **Pricing** (`bdce7e3c`)
   - 3-tier pricing (Free/Pro/Team) + feature matrix + FAQ
   - Pro tier highlighted with indigo glow
   - Height: 6304px

10. **Security** (`f2f5e55f`)
    - Zero-knowledge diagram + encryption stack + compliance badges
    - Height: 6178px

## Design System Decisions

### Why "Vault Onyx"?
- **Onyx** = dense, dark, protective stone -- metaphor for zero-knowledge encryption
- Dark mode default aligns with developer/security audience expectations
- Indigo primary conveys trust (financial/security industry standard)

### Key Visual Innovations
1. **Security Ceremony**: Multi-step encryption progress with technical labels
   - Makes invisible security operations tangible
   - Builds trust through transparency

2. **Hash Chain Visualization**: Audit log as connected blockchain-style blocks
   - Differentiator: No competitor shows audit chain integrity this way

3. **SRP Handshake Progress**: 7-step mutual authentication visualization
   - Turns complex crypto protocol into understandable user experience

4. **Tonal Layering**: Surface hierarchy replaces traditional card borders
   - Creates depth without visual noise
   - Reduces cognitive load in data-dense views

## Next Steps (Phase 5)

1. Extract Stitch HTML as React component reference
2. Implement Vault Onyx as Tailwind CSS preset
3. Build shadcn/ui component library extensions
4. Convert 10 screens to Next.js pages
5. 3 rounds of UI polish (per user preference)

---

Auth Box v2 | Stitch Pipeline Report
Maurice | maurice_wen@proton.me
