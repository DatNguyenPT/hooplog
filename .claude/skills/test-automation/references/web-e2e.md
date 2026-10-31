# Web E2E (Playwright default)

## Setup
`npm init playwright@latest` (TypeScript, tests in `tests/e2e`). In CI: `npx playwright install --with-deps chromium`.

## Config essentials
```ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // surfaces flakiness in the report; it does not fix it
  workers: process.env.CI ? 4 : undefined,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit.xml' }]],
  use: {
    baseURL: process.env.BASE_URL,
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' }, dependencies: ['setup'] },
  ],
});
```

## Rules
- Locators: `getByRole` > `getByLabel`/`getByText` > `getByTestId` > CSS. No XPath; no `nth()` without a reason.
- Web-first assertions (`await expect(locator).toBeVisible()`) auto-retry. No `waitForTimeout`: wait on `page.waitForResponse`, the URL or an element state.
- Log in once in `auth.setup.ts` (through the API when possible) and reuse `storageState`. Create test data with the `request` fixture or the API, not the UI.
- Fixtures via `test.extend` for page objects and data. Page objects expose actions and locators; assertions stay in tests.
- Stub only third parties with `page.route()`. Assert user-visible outcomes.
- Accessibility: `@axe-core/playwright` (`new AxeBuilder({ page }).analyze()`) on key pages.
- Visual: `toHaveScreenshot()` only for stable components with a fixed viewport; update snapshots deliberately.

## Run and debug
- `npx playwright test tests/e2e/login.spec.ts`, `--ui`, `--debug`, `npx playwright show-trace <trace.zip>`.
- Flaky hunt: `--repeat-each=10 --retries=0`.
- CI shards: `--shard=1/4` with the `blob` reporter, then `npx playwright merge-reports`.

## Other runners
- Cypress: `cy.intercept` for network, `data-cy` selectors, component testing for UI units; plan around the single-origin model (`cy.origin` for cross-origin steps).
- Selenium/WebDriver: only when mandated. Explicit waits (`WebDriverWait`), never mixed with implicit waits; Grid or a cloud provider for browsers.
