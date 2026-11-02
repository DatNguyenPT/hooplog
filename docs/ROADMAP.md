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
6. Data export/import, delete-all, polish, accessibility - 1-2 weeks. The owner added swipe-to-go-back and Supabase sign-up/sign-in (accounts only, no sync) to this slice on 2026-11-01 ([ADR 0008](decisions/0008-optional-accounts-supabase-auth.md)); the page the confirmation email lands on is [ADR 0011](decisions/0011-email-confirmation-page.md); the follow-up of 2026-11-02 (unconfirmed accounts cannot sign in, a page per Supabase link, password-checked account deletion) is [ADR 0012](decisions/0012-site-pages-and-account-deletion.md)
- **Exit:** MVP quality bar in PRODUCT_CONTEXT met; use it yourself for real training for at least 2 weeks.

**Left over from slice 6.** Written down on 2026-11-02, after PRs 6 and 7 were merged, so none of it is lost. Each line says where it is meant to land.
- Not built, proposed for slice 7 (waiting for the owner to approve the plan): password reset and change password (the app has neither, so a forgotten password blocks both sign-in and account deletion); a dedicated accessibility pass on the phone (screens were built with labels and all four states, but small screens, large system fonts and TalkBack have not been tried).
- Not built, M1.5 (before real players): a custom email sender, because Supabase's built-in one mails only the project team, about 2 an hour; a contact address for deletion requests made without the app (Google Play asks for one; the owner chooses it, none is invented); encrypting the stored login (it sits in unencrypted `expo-sqlite/localStorage`; `expo-secure-store` can replace it behind one adapter, with an ADR).
- Not built, M4 (sync): applying the five cloud-table migrations in `supabase/migrations/` (optionally with a `revoke` of the default `truncate, references, trigger` grants on `authenticated`); a password check inside the `delete-account` function itself, because the app's password re-entry only guards against stray taps ([ADR 0012](decisions/0012-site-pages-and-account-deletion.md)); deleting through a link in an email (`site/account-deleted/` is reserved for it; it needs a custom sender, an edited template, page code that handles the token and CORS on the function); cloud backup and sync, and moving guest data into an account.
- Not built, deferred: changing the account's email (with no cloud data yet, a player can delete the account and make a new one).
- Out of scope for now: social login, encrypted or scheduled backups, merge-style restore.
- To check on the phone or the live project (owner): the swipe-back flash fix (a hypothesis so far); the share sheet after Export backup; the edge swipe next to Android gesture navigation; the file picker with Drive and Files; Delete all data landing on Welcome; the whole account round trip (sign up, confirm on the new page, sign in, delete) once `delete-account` is deployed and the dashboard settings in [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md) are done.
- Paperwork: ADRs 0008 to 0012 are still "proposed" and `CLAUDE.md` still says Supabase is not a dependency yet; the owner accepts them and updates that line after the checks above.

### M1.5 Android closed beta: 3-4 weeks
Google Play developer account ($25 one-time), privacy policy, store listing, data-safety form, internal then closed testing with a few real players, crash-free fixes. Google requires a minimum closed-test period with a minimum number of testers for new personal accounts; check current rules when we get here.
- **Exit:** beta feedback collected; decide what matters most next.

### M2 AI Camera POC: 4-6 weeks (parallel to M1 from about week 4 using offline video)
Runs outside the app first (offline analysis of recorded video), then on a real phone. Hard go/no-go gate on the provisional targets: at least 85% precision on automatically labeled Made/Missed and at least 90% recall on shot attempts, measured on held-out real footage. Full plan in [AI_CAMERA_POC.md](AI_CAMERA_POC.md).
- **Exit:** written report with the metrics, the speed/battery/heat numbers on the real phone, license decision, and a go / no-go / pivot recommendation.

### M3 AI Shot Tracking in the app: 6-10 weeks, only if M2 is "go"
Camera screen, on-device detector, Uncertain handling, correction UI, session review, analytics split by manual vs AI. Ships behind a feature flag in the beta.

### M4 Accounts and sync: 4-6 weeks
Sync, guest-to-account migration and the cloud tables with RLS (designed in [ADR 0009](decisions/0009-cloud-schema.md)). Sign-up, sign-in and account deletion moved into M1 slice 6; before sync starts, the `delete-account` function must check the password (or a very recent sign-in) itself, not only the app ([ADR 0012](decisions/0012-site-pages-and-account-deletion.md)). Can move earlier or later depending on beta feedback (for example if users lose data).

### M5 Expansion and iOS: open-ended
Apple Developer account ($99/year), iOS build and testing, Vietnamese, recommendations, advanced analytics, premium split. Public launch decision.

## Dependencies and sequencing
- M0 gates everything. Footage collection and M2 offline analysis do not depend on app code.
- M3 depends on M1 (shot table, shooting screens) and a passing M2.
- M4 and M5 depend on beta feedback.

## Roadmap changes from the original proposal
- Supabase moved from foundation to M4 (guest-first, zero cost). Its sign-up and sign-in part was pulled into M1 slice 6 on 2026-11-01; sync stays in M4.
- Footage collection starts immediately; AI POC can start before MVP is finished.
- Android closed beta added as an explicit milestone.
- Data export added to the MVP because local-only data can be lost.
