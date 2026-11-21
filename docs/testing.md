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
Build once per app/configuration in a local run, with SHA/digest provenance; do not reuse stale local builds.
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
from `scripts/ci/browser-harness.cjs`. Tests that assert MIDI connection controls
must install `packages/music-practice/test-fixtures/midi.js` before navigation;
do not rely on the host browser exposing native Web MIDI. Service workers are blocked by default;
offline tests explicitly enable them. Keep credentials out of traces/logs.

| Operation | Required boundary |
| --- | --- |
| Open lazy app/route | `waitForApp(page, selector)` and the route's visible control |
| Open hymn controls after navigation/reload or viewport change | `openHymnControls(page)` waits for startup, toolbar and responsive layout, then opens idempotently |
| Begin the local database broadcast protocol test | After channel subscription, `waitForRealtimeReplication` requires the tenant health replication connection before any tested writes; a healthy HTTP/DB response is insufficient |
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

## Standard local CI runner

Use **Node 24**, Docker Desktop, Supabase CLI **3.2.0**, and installed Chromium
and WebKit. Start Docker through its desktop app if it is stopped. Commit the
intended changes first: the runner rejects a dirty checkout and validates the
exact committed revision. Do not create an ad hoc serial shell/Python wrapper
or run concurrent `check-app` processes in a shared checkout.

```sh
# Before a push: all applicable shared, app/edition and account checks.
npm run ci:local -- --base origin/main
# All push lanes, independent of changed-file selection.
npm run ci:local -- --all
# Complete nightly/manual matrix, including both account browser engines.
npm run ci:local -- --full
# Inspect selection, coverage, prerequisites and resource locks without running.
npm run ci:local -- --all --plan
# One-app diagnostic; this does NOT satisfy pre-push validation by itself.
npm run ci:local -- --apps songalong
```

The runner installs dependencies once, creates private detached snapshots of the
same commit, and builds each selected app once per configuration. Focused and
edition tasks share a completed SongAlong build; Chromium and WebKit share a
completed app build in a full run. SongAlong's cross-app regression fixture has
its own prerequisite build. Account builds have different backend configuration
and never replace ordinary artifacts. Copies use filesystem copy-on-write when
available (native `cp -c` on macOS, rather than Node's fallback clone flag).
A disk-space preflight requires at least 3 GiB for cloned snapshots and a larger
budget when full copies are necessary. Private `node_modules` retains relative workspace links; do not replace
it with a symlink into the source checkout.

`CI_WORKERS` or `--workers` controls outer scheduling (default up to six locally,
two on GitHub; range 1–32). `CI_UNIT_WORKERS` bounds the shared music unit-file
pool (default four locally, two on GitHub; range 1–8). Worker slots are weighted
scheduling budgets, not a promise to pin every subprocess to a CPU. Use one outer
worker for a serial baseline; test commands, case inventory and assertions stay
the same. Do not raise concurrency just because a machine has many logical CPUs:
compare throughput, per-command latency and failures first.

```sh
npm run ci:local -- --all --workers 1
npm run ci:local -- --all --workers 6
npm run ci:compare -- /absolute/path/to/serial-run /absolute/path/to/parallel-run
```

The comparison refuses different commits, task/coverage inventories, dependency
graphs, failed checks or failed local lifecycle cleanup. It includes installation,
snapshot and cleanup time for local runs. Report warm/cold backend and browser
state separately; a single successful probe does not establish p95 or flake rate.

## Scheduler and coverage contract

`scripts/ci/test-strategy.cjs` remains the owner of selected lanes and budgets.
`task-graph.cjs` creates their build prerequisites and task graph; `scheduler.cjs`
runs ready tasks within worker and exclusive-resource limits. Backend startup,
builds and account integration have explicit critical-path priorities; eligible
prerequisites reserve capacity rather than starving behind smaller UI commands. Both GitHub's
`check-app.cjs` and the local coordinator use these modules. Shared checks use
`run-shared.cjs`. GitHub computes all matrices in the existing changes job and
starts app setup alongside shared validation; every release still requires shared
checks, its complete app matrix, and applicable Accounts checks.

`scripts/ci/resources.json` is the reviewed command inventory. Each entry records:

- The original command's expanded npm aliases, including pre/post hooks and
  ordered setup commands. Executing the original command preserves those hooks.
- Fixed TCP ports and any exclusive resources. The source scan conservatively
  checks literal ports in test/server helpers; it cannot infer computed ports.
  Declare computed ports explicitly (for example, the layout server).
- A UI or real-time-audio classification. Precision audio tasks acquire the
  `realtime-audio` lock; independent UI/edition tasks can overlap with them.
  Soundglow fixture generation is a prerequisite; its ordinary visual UI files
  run with two workers on separate ports/reports, while timing files remain
  exclusive and one-worker. New visual files default to the timing group.

The SongAlong catalog uses three required partitions per browser, with distinct
ports and a checked union of the original cases. No partition is optional.

New commands, alias changes and newly observed literal ports fail shared policy
validation until their inventory entry is reviewed. Inspect the complete alias,
server helpers, file writes, browser state, audio measurements and backend use
before updating it. Do not regenerate the catalog blindly or remove locks to get
a green result. DoReGo's nine browser cases use one registry shared with the
developer alias; edition discovery remains automatic and a new edition requires
its resource declaration. Scheduler tests exercise graph/coverage invariants,
contention, capacity, deadlines, cancellation and immutable failure evidence.

A worktree does **not** isolate TCP ports. A host coordinator lock in the common
Git directory prevents two local runners from racing; individual task locks
protect declared ports within the run. If the coordinator lock exists, inspect
its `owner.json` and verify whether its PID is alive before removing a stale lock.
Do not kill another run or reuse its backend. Each account engine gets its own
snapshot, stack and allocated backend ports. Its integration files retain their
ordered shared-owner/inbox fixtures; database setup and disjoint app builds can
overlap. Parallelizing account files requires isolated owners/data and recipient-
specific mail lookup first. Soundglow's timing/throttled visual projects remain
one-worker inside their exclusive group; do not apply a blanket worker increase.

Every invocation writes a unique `work/ci-results/<run>/` with the SHA, machine,
Node version, worker count, task inventory, start/end events, time queued after prerequisites become ready, dependency/resource
locks, exit/signal/timeout evidence, stdout logs, CPU time and OS-reported maximum
RSS. Maximum RSS is the OS time tool's process/child maximum, not the sum of all
simultaneous browser processes. Nested account reports are retained too. Backend
provisioning logs may contain local credentials and stay in private snapshot
`work/ci-private/`, outside uploaded timing artifacts. Environment values are
never serialized into the inventory.

Independent tasks finish after a failure; dependants are blocked. There are no
assertion retries. Cancellation and deadlines terminate task process groups,
including preview children. The local coordinator stops only its owned backend
stacks in `finally`. Successful snapshots are removed; failed snapshots and first
failure logs remain for inspection. After investigation, remove only the printed
run's generated worktrees with `git worktree remove --force <snapshot>`; preserve
any deliberate source edits and copy needed browser artifacts first.

For targeted iteration, `TEST_BROWSER=chromium node scripts/ci/check-app.cjs
songalong focused` still builds and runs that explicit lane through the same
scheduler. Convenience aliases are not a substitute for the complete local
runner. Nightly/manual full runs never publish.

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
