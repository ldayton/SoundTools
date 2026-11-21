# Development and testing

Read [docs/testing.md](docs/testing.md) before changing behavior or tests.
The executable suite policy is `scripts/ci/test-strategy.cjs`; its invariants
run in `tests/ci/test-strategy.test.cjs` on every shared CI validation.

## Required workflow

1. Identify the behavior contract and its owning tests before editing. If a
   control, persistence model, migration, or window policy changes, update all
   consumers of that contract in the same change. Search both `apps/*/tests`
   and root `tests`, including account and offline integration tests.
2. Generic hymn/control tests must use
   `packages/music-practice/test-fixtures/hymns.ts`. Do not use a named product
   song merely because it currently exposes the controls you need. Edition
   tests may and should name the edition they verify.
3. Use `scripts/ci/browser-harness.cjs` and shared browser helpers. Wait for
   application readiness, responsive layout, restored account state, or dialog
   closure before interacting. `goto()`/`reload()`, an existing input, and a
   fixed delay are not evidence of those conditions. Use observable outcomes
   for assertions; keep deliberate time/latency measurements explicit.
4. Register coverage in the executable policy. Never append exhaustive checks
   to a convenience npm alias used by the core CI lane. SongAlong
   `*-editions.browser.ts` files are automatically required in the independent
   edition lane; do not add them to the core lane too. Never silently omit new
   behavior from push validation to improve speed.
   Shared contract checks require unit and browser coverage for every ID in
   the production `instrumentEditionIds` registry.
5. Before pushing code changes, read the current CI configuration and run the
   repository's full applicable CI suite locally using `npm run ci:local --
   --base origin/main` (Node 24, clean committed HEAD). Do not invent a serial
   wrapper or bypass runner resource locks. Targeted tests are useful
   during development but do not substitute for that suite. Validate the exact
   commit being pushed; fix failures and rerun the necessary checks before
   pushing. Never push while required checks are failing or incomplete. Check
   `git diff --check`. Do not absorb unrelated working-tree changes.
6. Keep tests meaningful when requirements change. Do not change product music,
   weaken assertions, ignore browser errors, add sleeps, raise timeouts, or
   automatically retry assertions just to obtain green CI. A product contract
   change needs updated assertions and regression coverage, not a disabled test.

## Failure handling

Inspect the first failing command and its artifacts before editing. Classify
product regression, stale test contract, readiness race, suite budget, or
infrastructure failure. A manual diagnostic rerun is not a fix or proof of a
flake: retain/link the first failure and explain any remaining uncertainty.
Do not repeatedly rerun a failing assertion without investigating it.
Keep unexplained passing reruns in `docs/testing-instability.md`; an entry is
evidence to investigate, never permission to skip a required check.

When a change grows a lane, inspect the retained command timings. Split by
owned behavior with every lane still required; do not keep increasing a serial
job's timeout. Workflow matrix, concurrency key, artifact names, and aggregate
app gate must retain each lane's identity.
Use the standard local coordinator for concurrency; it owns private snapshots,
immutable builds, TCP port/audio locks and disposable backend stacks. Worktrees
alone do not isolate ports. Add or change commands through the reviewed coverage
and resource inventory in `scripts/ci/resources.json`; never omit required cases
or relax assertions to improve performance. See `docs/testing.md` for benchmarking,
cleanup and failure evidence.
