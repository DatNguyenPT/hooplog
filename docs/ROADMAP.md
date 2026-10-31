# HoopLog: Roadmap

Priorities set by the product owner: (1) usable training and workout MVP, (2) manual shooting with FG%, (3) separate AI feasibility POC, (4) AI integration only after the POC passes.

## About the estimates
Rough calendar estimates for a solo product owner working part-time (about 10-15 hours/week) with AI coding assistants, including testing and fixes. Confidence is low until Milestone 0 shows our real pace. Re-estimate at the end of M0. Ranges, not promises.

## Milestones

### M0 Foundation: 2-3 weeks
- Install Android Studio, create the Expo project (strict TS, Expo Router), lint/format, GitHub Actions CI.
- Development build running on the physical Android phone.
- SQLite setup, migrations, repository pattern, i18n, units helper, design tokens and base components (loading/error/empty states).
- ADRs: local-first data, stack, folder structure. Fill in `CLAUDE.md` commands.
- Git: rename `master` to `main`, first commit.
- **Exit:** "hello" screen reads/writes SQLite on the real phone; CI green; one domain function with tests.

### Footage collection (starts in week 1, runs in parallel): 2-4 weeks elapsed
Film shooting sessions per the protocol in [AI_CAMERA_POC.md](AI_CAMERA_POC.md). Costs no engineering time and removes the biggest POC blocker. Do not wait for M0.

### M1 MVP: 8-12 weeks
Build in vertical slices, each usable on its own:
1. Profile/settings + onboarding-lite (no sign-in) - 1 week
2. Manual shooting session: Made/Missed, undo, FG%, history - 2 weeks (build first: it is the core loop)
3. Exercise library + workout logging + history - 3 weeks
4. Training plans + weekly schedule - 2 weeks
5. Dashboard and analytics (FG% trend, consistency, volume) - 2 weeks
6. Data export/import, delete-all, polish, accessibility - 1-2 weeks
- **Exit:** MVP quality bar in PRODUCT_CONTEXT met; use it yourself for real training for at least 2 weeks.

### M1.5 Android closed beta: 3-4 weeks
Google Play developer account ($25 one-time), privacy policy, store listing, data-safety form, internal then closed testing with a few real players, crash-free fixes. Google requires a minimum closed-test period with a minimum number of testers for new personal accounts; check current rules when we get here.
- **Exit:** beta feedback collected; decide what matters most next.

### M2 AI Camera POC: 4-6 weeks (parallel to M1 from about week 4 using offline video)
Runs outside the app first (offline analysis of recorded video), then on a real phone. Hard go/no-go gate on the provisional targets: at least 85% precision on automatically labeled Made/Missed and at least 90% recall on shot attempts, measured on held-out real footage. Full plan in [AI_CAMERA_POC.md](AI_CAMERA_POC.md).
- **Exit:** written report with the metrics, the speed/battery/heat numbers on the real phone, license decision, and a go / no-go / pivot recommendation.

### M3 AI Shot Tracking in the app: 6-10 weeks, only if M2 is "go"
Camera screen, on-device detector, Uncertain handling, correction UI, session review, analytics split by manual vs AI. Ships behind a feature flag in the beta.

### M4 Accounts and sync: 4-6 weeks
Supabase Auth, RLS, sync, guest-to-account migration, account deletion. Can move earlier or later depending on beta feedback (for example if users lose data).

### M5 Expansion and iOS: open-ended
Apple Developer account ($99/year), iOS build and testing, Vietnamese, recommendations, advanced analytics, premium split. Public launch decision.

## Dependencies and sequencing
- M0 gates everything. Footage collection and M2 offline analysis do not depend on app code.
- M3 depends on M1 (shot table, shooting screens) and a passing M2.
- M4 and M5 depend on beta feedback.

## Roadmap changes from the original proposal
- Supabase moved from foundation to M4 (guest-first, zero cost).
- Footage collection starts immediately; AI POC can start before MVP is finished.
- Android closed beta added as an explicit milestone.
- Data export added to the MVP because local-only data can be lost.
