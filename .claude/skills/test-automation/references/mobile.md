# Mobile test automation

## Choose
| Need | Pick |
|---|---|
| Cross-platform native UI automation, W3C WebDriver | Appium 2 + WebdriverIO |
| Fast to author smoke flows (YAML), little code | Maestro: `maestro test flows/` |
| React Native, gray-box, syncs with app idle | Detox: `detox build`, `detox test` |
| Team owns native code, fastest and most stable | Espresso (Android), XCUITest (iOS) |
| Responsive web only | Playwright device emulation (`devices['Pixel 7']`); not a substitute for native |

## Appium 2 basics
- Install drivers explicitly: `appium driver install uiautomator2` and `appium driver install xcuitest`; start `appium`.
- Capabilities: `platformName`, `appium:automationName` (UiAutomator2 or XCUITest), `appium:deviceName`, `appium:platformVersion`, `appium:app`, `appium:newCommandTimeout`. Android permissions: `appium:autoGrantPermissions: true`.
- Selectors: accessibility id (`~login-button`) first, then resource-id or name; XPath last (slow, brittle). Ask `swe` for `testID` (React Native), `contentDescription` (Android) and `accessibilityIdentifier` (iOS).

## Stability
- Reset app state per test (fresh install, clear data, or terminate and relaunch) and seed data through an API, never through the UI.
- Explicit waits on element state. Disable animations on test devices: set `window_animation_scale`, `transition_animation_scale` and `animator_duration_scale` to 0 with `adb shell settings put global <name> 0`.
- Handle permission dialogs, push, biometrics and deep links through capabilities, simulator commands or deep-link entry points, not by tapping system UI where avoidable.

## Devices and CI
- PR runs: one current and one oldest-supported OS on emulators or simulators. Release or nightly: real-device cloud (BrowserStack, Sauce Labs, AWS Device Farm, Firebase Test Lab) across a small matrix chosen from analytics.
- GitHub Actions: Android emulator with `reactivecircus/android-emulator-runner`; iOS needs macOS runners.
- Keep artifacts: screen recording, page source on failure, device logs (`adb logcat`, `xcrun simctl spawn booted log stream`), crash reports.

## Pitfalls
Tests coupled to copy text (use ids); order-dependent flows; shared test accounts; hard-coded coordinates; ignoring app-start time budgets.
