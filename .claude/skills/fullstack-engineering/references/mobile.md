# Mobile apps

## Choose
- React Native (Expo) when the team knows React/TypeScript and the UI is mostly standard; Flutter for a custom design system with one codebase; native (Swift/Kotlin) for heavy platform APIs, graphics or the tightest performance.
- Decide the minimum OS versions from analytics, not habit; write it down.

## Architecture
- Layers: UI -> state/view-model -> repository -> API/local store. Keep business rules out of screens.
- Offline-first where users need it: local database as source of truth, a sync queue with retries, conflict rules defined up front. Show sync state.
- Navigation and deep links designed together (universal links / app links); every screen reachable by a URL makes testing and support easier.

## Platform behavior
- Permissions: ask in context, explain why, handle denial and "don't ask again" gracefully; never block the app on optional permissions.
- Secure storage for tokens (Keychain / Keystore, e.g. `expo-secure-store`); never plain AsyncStorage for secrets. Pin certificates only with a rotation plan.
- Lifecycle: handle background/foreground, process death and state restoration; cancel work when views go away.
- Push: register tokens per device, handle opt-out, test with the real provider in staging.

## Performance
Virtualized lists, image sizing and caching, avoid blocking the JS/main thread, measure cold start, keep the bundle small, profile on a low-end device.

## Release pipeline
Versioning with monotonically increasing build numbers; signing credentials in the CI secret store; Expo EAS Build/Submit or fastlane; internal track (TestFlight / Play internal) first, then staged rollout with a halt plan; remote config or feature flags to disable a bad feature without a store review; crash reporting (Sentry, Crashlytics) from day one.

## Testability
`testID` (React Native), `contentDescription` (Android) and `accessibilityIdentifier` (iOS) on interactive elements; a debug menu or deep link to reset state and seed data; list the ids for `sdet`.

## Store compliance
Privacy labels and data-safety forms match actual SDK behavior; permission usage strings are specific; account deletion path exists if accounts exist.
