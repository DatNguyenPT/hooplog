# HoopLog: Product Context

## Vision
A personal basketball training companion on your phone: plan training, log workouts and shooting, see progress, and eventually let the phone track shots automatically.

## Users
Amateur players who train alone and want to improve shooting, athleticism and overall performance. They train in gyms and outdoor courts, often with poor signal, one hand busy, in a hurry between sets.

## Principles
1. A usable manual app first; AI is an optional bonus, never a requirement.
2. Works instantly as a guest, offline, with no sign-up.
3. Private by default: video never leaves the phone.
4. Free, simple, affordable to run.

## Decisions (product owner, confirmed)
| Topic | Decision |
|---|---|
| Platform | Android first (Windows dev machine, one physical Android phone), iOS-compatible architecture |
| Cost | Free/open-source tooling; no paid AI APIs; no paid EAS tier or commercial model license until justified; Apple Developer account only when publishing to iOS |
| Language/units | English now, metric default, localization-ready for Vietnamese |
| Accounts | Guest-first, no forced login; account creation and cloud sync designed for later |
| Video | On-device processing, discard frames, store only shot events and session stats; optional local clip saving in a future version |
| Release | No fixed date. Stable MVP, then Android closed beta, then consider wider launch and iOS |
| Money | Free. No payments in MVP. Architecture allows a later freemium split (premium analytics, advanced AI coaching, extra plans) |

## Scope by module

### In the MVP
- **Training management:** create/edit training plans from a built-in exercise library (skill drills, strength, speed/agility, jump/explosiveness); weekly schedule.
- **Workout tracking:** record a session with exercises, sets, reps, weight, duration; history; edit/delete.
- **Shooting sessions (manual):** tap Made/Missed, undo, optional shot zone; FG% live; session summary and history.
- **Analytics (basic):** FG% trend, sessions per week (consistency), volume trend, personal bests.
- **Profile and settings:** name, units display, language setting, data export/backup (local file), delete all data.

### Not in the MVP
Accounts/cloud sync, payments, AI camera, personalized recommendations, social/sharing, video clip saving, push notifications (reminders may be local notifications later).

### Later
- **AI Camera:** only if the POC passes its gate. Statuses Made / Missed / Uncertain, with manual correction. See [AI_CAMERA_POC.md](AI_CAMERA_POC.md).
- Accounts and sync, advanced analytics, recommendations, premium tier, iOS release, Vietnamese.

## Quality bar for "MVP done"
Core flows work offline; no data loss on app kill or phone restart; usable at small screen sizes and with larger system fonts; basic accessibility labels; crash-free on the test devices; data export works.

## Store readiness (kept in mind from day one)
Privacy policy, accurate data-safety/privacy labels (no data collected while guest-only), specific camera permission text, account deletion path once accounts exist, 64-bit builds, target API level per Google Play requirements.

## Glossary
- **FG%:** made shots divided by attempts.
- **Uncertain:** shot the AI detected but could not label confidently; the user resolves it.
- **POC:** proof of concept, an experiment to learn if something is feasible.
