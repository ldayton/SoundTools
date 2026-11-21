# Testing strategy

This is the repository's testing contract for people and agents. Start here,
then inspect `scripts/ci/test-strategy.cjs`, which owns CI lane selection,
browser coverage and job budgets. `tests/ci/test-strategy.test.cjs` checks the
workflow wiring, nested npm aliases, fixture use and failure recording.

## Tiers and ownership

| Tier | Purpose | When and where |
| --- | --- | --- |
| Unit/contract | Music, state, migrations, fixture capabilities, CI policy | Shared checks on every selected run; app units before core validation |
| Focused core | Representative navigation, controls, MIDI, audio, persistence and playback | Affected apps on pushes/PRs; Chromium plus WebKit release smoke |
| Edition | Exact notation, tab, fingers, lyrics, display and mobile behavior of each edition | Independent required SongAlong lane on pushes/PRs; Chromium, both browsers in full runs |
| Regression | Full catalogs, layouts, offline/update recovery, visual/performance and specialized audio coverage | Nightly or manual `full`; Chromium and WebKit |
| Accounts | Real local Auth/Postgres/Realtime/storage integration | Account, persistence or relevant infrastructure changes, plus full runs |
| Release smoke | Exact staged artifact provenance, public routes, assets, privacy and responsive startup | Before promotion and again on the production domain |

An app's aggregate reusable workflow must pass **all** its selected lanes before
that app releases. An unrelated app's failure does not block it. Editions are
not optional and are not deferred to nightly runs. Separating them gives the
core lane a stable scope and an independent failure result.

The focused/edition/regression budgets are 10/15/30 minutes in the executable
policy. These are limits, not performance targets. If a suite approaches its
limit, use command timings to split coverage rather than hiding timeouts.
Build once per lane, with SHA/digest provenance; do not reuse stale local builds.
No test assertion has an automatic retry. Infrastructure's bounded provisioning
retry is separate from application assertions.

## Fixture rules

There are two distinct owners:

- **Generic workflow tests** use capability fixtures from
  `packages/music-practice/test-fixtures/hymns.ts`. The selector requires staged
  arrangements and multiple stanzas. Playback additionally requires a metered
  D4–D5 octave so the existing transposition, range and count-in contracts
  stay explicit; its opening MIDI pitches come from the fixture's two voices and key labels
  from the independently unit-tested range model. The source key need not stay
  the same when a compatible fixture changes.
  Passage fixtures also require four attacks in bar 1 and two in bar 2;
  recovery fixtures require three different opening melody notes above a
  sustained bass with a written tied continuation. Attack pitches and counts come from the selected fixture,
  so named-edition changes cannot silently invalidate grading tests.
  When a song gains a dedicated edition, selection moves to another compatible
  song automatically. Unit tests check this migration and fail early if the
  capability disappears from the product entirely.
- **Edition tests** name real songs and independently verify their musical
  content and behavior. Every `apps/songalong/tests/*-editions.browser.ts` is
  enrolled automatically by the policy. `test:editions` uses the same registry;
  no second hand-maintained list exists. Shared contracts check the production
  `instrumentEditionIds` registry and reject an edition missing its unit or
  browser file before any app browser jobs start.

Do not substitute an arbitrary song name into a failing generic test. Preserve
its required meter, ranges, stanzas, controls and hand distinction. If no fixture
remains, determine whether the generic feature was intentionally retired and
migrate its contract. Never alter a product arrangement to keep a fixture alive.
Catalog-wide assertions must account explicitly for instrumental songs and
rights/source categories; do not infer those properties from catalog length or
the first entry.

## Browser synchronization

Use `launchBrowser`, tracked contexts/pages, `captureFailure` and `closeBrowser`
from `scripts/ci/browser-harness.cjs`. Service workers are blocked by default;
offline tests explicitly enable them. Keep credentials out of traces/logs.

| Operation | Required boundary |
| --- | --- |
| Open lazy app/route | `waitForApp(page, selector)` and the route's visible control |
| Open hymn controls after navigation/reload or viewport change | `openHymnControls(page)` waits for startup, toolbar and responsive layout, then opens idempotently |
| Edit a signed-in follower or measure propagation | `waitForAccountIdle(page)` and the expected restored input value before resetting counters |
| Open a menu after closing a dialog | `waitForDialogClosed(page, selector)` before opening the new menu |
| Verify an async change | Locator assertions or `expect.poll` on the actual outcome |

Rendering an input is not proof that hydration finished. A helper must not call
`isVisible()` too early and silently do nothing. Do not use `networkidle` as a
general readiness signal for apps with realtime traffic; use it only when a
test deliberately needs in-flight finite asset loads to finish before navigation.
Audio prewarming must stop at `beforeunload` as well as `pagehide`: WebKit can
reject a newly started fetch in the interval before `pagehide`. Abort pending
requests and invalidate stale workers; keep real live asset failures visible.
The required SongAlong audio-lifecycle regression holds requests across both
boundaries, verifies recovery, and checks a genuine HTTP failure.
Fixed waits are appropriate only for intentional timing/transport observations,
not as a cure for startup races. `tests/ci/readiness.browser.mts` exercises delayed
startup and restoration in a real browser, in the core SongAlong lane.

## Changing behavior without breaking unrelated coverage

Before editing a control or state contract, search its selectors, labels,
arrangement IDs and storage assumptions in app tests **and** root integration
tests. In the same change:

1. Update unit and migration expectations for the new behavior.
2. Keep generic coverage on capability fixtures; put exact song behavior in its
   edition test. Test both the intended behavior and affected compatibility paths.
3. Update account, confirmation-window, persistence and offline assertions when
   those contracts change. Removing exclusive window ownership, for example,
   requires changing tests that explicitly wait for its lock or blocked window.
4. Check which lane owns each test. Core npm aliases may not absorb catalog or
   edition loops through a nested alias. The policy tests expand those aliases
   so this fails quickly in shared validation.
5. Run affected tests, then the exact lane. A passing unit test does not replace
   a browser check for responsive focus, reload or storage lifecycle changes.

## Commands

Use Node 24 and `npm ci` at the root. Install browsers with the repository's
browser installation action/script as needed. `check-app.cjs` builds its own
verified artifacts and records every command in `work/ci-results/*.jsonl`.

```sh
npm run test:ci-unit
npm test --workspace=@ldayton/music-practice
npm test --workspace=songalong
TEST_BROWSER=chromium node scripts/ci/check-app.cjs songalong focused
TEST_BROWSER=chromium node scripts/ci/check-app.cjs songalong editions
TEST_BROWSER=webkit node scripts/ci/check-app.cjs songalong regression
TEST_BROWSER=webkit node scripts/ci/check-app.cjs songalong editions
```

Before pushing code changes, read the current CI workflows and run every
applicable shared, app-lane and account check locally. Targeted checks are for
iteration, not a replacement for the required suite. Validate the exact commit
being pushed; any subsequent code change invalidates that validation. Do not
push with required checks failing or incomplete. Core includes the secondary
browser smoke and needs both Chromium and WebKit.
Run concurrent local lanes in separate worktrees; each lane rebuilds its app,
so sharing a live preview's build directory can create false asset failures.
`npm run test:workspace --workspace=songalong` remains a developer convenience
umbrella; CI deliberately uses `test:workspace:core` and explicit owned tasks.
`node scripts/ci/test-strategy.cjs matrix songalong focused` prints the exact
matrix without starting a build. Nightly/manual full runs never publish.

## Investigating a red run

Preserve the first failure and classify it before making changes:

| Category | Response |
| --- | --- |
| Product regression | Reproduce the behavior; fix it with a focused regression assertion |
| Stale test contract/fixture | Verify intended source behavior; update all consumers together without weakening unrelated checks |
| Readiness race | Wait for the owning lifecycle boundary and test the delayed case |
| Budget/performance | Read command timings; find growth or a hang, then split or repair the owned suite |
| Infrastructure | Verify provisioning/network/tool failure; use a bounded diagnostic rerun |

Every lane uploads command timings on success and failure, and browser failure
artifacts separately. Files are unique per invocation and artifact names include
the run attempt, so a rerun cannot overwrite the first evidence. Inspect the
failed command, exit code/signal, screenshot,
DOM, trace and bounded logs. A passing retry is evidence of intermittency, not
proof of its cause and not a permanent fix. Record the failed run and the reason
for any diagnostic rerun; never loop retries or discard the first failure.

Once validation passes, follow the latest committed head and required releases.
Check for newer commits and queued runs before claiming the queue is clear.
Leave unrelated, uncommitted work alone.

Keep unresolved intermittent cases in [the evidence log](testing-instability.md).
They remain required tests; recording a case does not disable or retry it.
