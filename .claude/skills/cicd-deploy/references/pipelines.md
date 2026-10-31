# Pipeline skeletons

Versions are examples: pin current majors (or SHAs for third-party actions) in real pipelines.

## GitHub Actions: test, sharded E2E, deploy
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  e2e:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --shard=${{ matrix.shard }}/4
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-${{ matrix.shard }}
          path: |
            playwright-report
            test-results

  deploy:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production          # required reviewers are configured on the environment
    permissions:
      contents: read
      id-token: write                # OIDC to the cloud, no long-lived keys
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh "$GITHUB_SHA"        # promotes the artifact built earlier
      - run: ./scripts/smoke.sh "$PROD_URL" || { ./scripts/rollback.sh; exit 1; }
        env:
          PROD_URL: ${{ vars.PROD_URL }}
```

## GitLab CI equivalent
```yaml
stages: [test, deploy]
default:
  interruptible: true

test:
  stage: test
  image: node:22
  cache:
    key:
      files: [package-lock.json]
    paths: [node_modules/]
  script: [npm ci, npm run lint, npm test]
  artifacts:
    when: always
    reports:
      junit: reports/junit.xml

e2e:
  stage: test
  image: mcr.microsoft.com/playwright:v<same-version-as-package>-jammy
  parallel: 4
  script: [npm ci, 'npx playwright test --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL']

deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
  environment: production
  script: ['./scripts/deploy.sh "$CI_COMMIT_SHA"']
```

## Tips
- Matrix only what differs (OS, runtime version); keep PR pipelines under 10 minutes by running `@smoke` and affected tests, the rest nightly.
- Reusable workflows or templates for shared stages; one place to fix a flaky step.
- Reproduce a CI failure locally with the same container image and the exact command from the log.
