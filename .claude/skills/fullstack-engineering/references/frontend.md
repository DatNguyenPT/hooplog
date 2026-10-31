# Frontend

## Structure and state
- Components are small and typed; presentational pieces separate from data-fetching containers. Colocate styles, tests and stories.
- Server state (fetching, caching, invalidation) in a data library such as TanStack Query; local UI state with component state; a global store only for truly app-wide client state.
- Forms: one schema (zod, yup, valibot) shared with the backend where possible; show inline errors; preserve input on failure; disable double submit.
- Every async view has loading, empty, error and success states, plus an error boundary per route.

## Accessibility (non-negotiable)
Semantic HTML first; every control has an accessible name; full keyboard path and visible focus; manage focus on route changes and dialogs; color contrast AA; ARIA only when no native element fits; check with axe in CI and a manual keyboard pass.

## Performance
- Core Web Vitals targets (good): LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1.
- Split by route, lazy-load heavy widgets, size and lazy-load images (`srcset`, `loading="lazy"`), self-host and subset fonts, avoid layout shift (reserve space).
- Profile before `memo`/`useMemo`; fix the render cause first. Virtualize long lists. Watch bundle size in CI.

## Security in the browser
Never inject unsanitized HTML (`dangerouslySetInnerHTML`, `innerHTML`); strict CSP; prefer `HttpOnly` `Secure` `SameSite` cookies over tokens in `localStorage`; validate and encode URLs; no secrets in the bundle (everything shipped is public).

## Testability hooks
Stable `data-testid` on interactive elements and key regions (do not rely on copy or layout); deterministic seeds/fixtures; a way to reset state; feature flags overridable in test builds. List the ids you add for `sdet`.

## Product details that get missed
Responsive breakpoints, i18n and pluralization, date/number formatting by locale, dark mode tokens, offline/slow-network behavior, analytics events behind consent.
