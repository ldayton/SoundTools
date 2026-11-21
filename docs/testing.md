# Testing strategy

This is the repository's testing contract for people and agents. Start here,
then inspect `scripts/ci/test-strategy.cjs`, which owns CI lane selection,
browser coverage and job budgets. `tests/ci/test-strategy.test.cjs` checks the
workflow wiring, nested npm aliases, fixture use and failure recording.

## Tiers and ownership

| Tier | When | Coverage |
| --- | --- | --- |
| **CI** | GitHub pushes/PRs and local pre-push validation (`npm run ci`) | Shared/music units and contracts, app unit checks and all builds; selected playback, MIDI, lifecycle, guitar and DSP checks; desktop/phone WebKit startup and auth-confirm isolation. Maximum 60 seconds locally on the Mac Studio. |
| **Nightly** | Scheduled GitHub runs or explicit manual runs (`npm run nightly`) | Exhaustive coverage across Chromium and WebKit, including exhaustive editions, catalogs, layouts, offline recovery, visual/performance, audio and real Accounts integration; never publishes |

These are the only test tiers. Apps, shared contracts, editions, Accounts and
release smoke are coverage groups within a tier. `scripts/ci/tiers.cjs` defines
the tier names and browser engines; `test-strategy.cjs` selects each group's
commands. Current execution ownership is checked by `scripts/ci/coverage.cjs`:
Nightly includes CI's test files, and a file cannot be scheduled twice in an
app/engine plan through different aliases. This is an execution check, not proof
that different files test distinct behaviors. Pushes and PRs always select CI;
schedules always select Nightly.
Manual GitHub runs choose `ci` or `nightly` explicitly.

An app's aggregate reusable workflow must pass **all** its selected groups before
that app releases. An unrelated app's failure does not block it. Every edition
remains required in Nightly; its unit and registry contracts remain in CI. The complete local CI invocation has a hard 60-second budget, including selection,
installation and cleanup. GitHub CI runs the same coverage on slower hosted
runners, with a 10-minute per-group safety timeout; Nightly core
groups have 30 minutes. Nightly edition groups have 15 minutes. GitHub splits their discovered registry
into two required shards per engine; every shard is part of the aggregate app
gate. The local Nightly graph runs that same complete registry using the same discovered files. These
are limits, not performance targets: split coverage when command timings show
growth rather than hiding timeouts.
Build once per app/configuration in a local run, with SHA/digest provenance; do not reuse stale local builds.
No test assertion has an automatic retry. Infrastructure's bounded provisioning
retry is separate from application assertions.

## Choose the cheapest convincing test

Start with the regression a test would catch, then choose its owner. Test counts
and historical commands are not guarantees. A useful test fails when the behavior
breaks and remains valid when an unrelated implementation detail changes.

| Behavior | Preferred owner | Escalate when |
| --- | --- | --- |
| Music rules, grading, DSP, state transitions, migrations | Deterministic Node test with explicit inputs and independent expected values | The browser or persistence boundary changes the result |
| HTTP responses, file packaging, manifests, local server lifecycle | Small integration test with temporary files and ephemeral ports | Browser caching, workers or reload semantics are the contract |
| Rendering, responsive layout, focus, keyboard navigation | Focused browser test using real layout | The workflow must cross another real boundary |
| Playback, audio continuity, offline recovery, account replication | A small set of real browser/backend witnesses | Another configuration exercises a genuinely different mechanism |

Keep broad input combinations at the inexpensive level. Use browser tests to
prove wiring and browser-specific mechanisms, rather than repeat all the same
math or state assertions in every engine/device combination. Real PCM, native
reference comparisons and backend integration remain valuable where mocks
cannot prove the guarantee. A test named “performance” may use a deterministic
clock; inspect its assertions before assigning an exclusive realtime lock.

When adding or changing a test, identify the failure it catches, check for an
existing owner, and update affected consumers with the production contract.
Use a shared capability fixture for generic workflows and independent goldens
for exact music/DSP results. Expected values derived from a production helper
need independent tests of that helper; otherwise the same bug can pass both sides.
Avoid source-text assertions when an observable behavior test proves the same
contract. Source checks are appropriate for repository policy and registrations.

Retire a redundant test only after reviewing its assertions, fixtures, browser
and configuration against the remaining owner. Record the reason in the change;
do not maintain a second per-assertion registry or preserve old aliases merely
to satisfy an inventory snapshot. File execution audits find literal duplication,
not semantic redundancy. Different files and configurations still require review.

Soundglow's Node/DSP checks run once in CI and once in Nightly, using a four-process isolated
Node pool. The dev-server integration checks run before that pool because one
starts the real development command and rebuilds UI output; every Nightly browser
reader and visual fixture waits for these checks locally. Chromium and WebKit
both exercise the real SDK and cache/script/style/worker/WASM reload contract.
The standalone SDK check has one owner per engine; app-specific diagnostic UI
checks remain separate. The Node prerequisite reserves scheduler capacity so
small browser tasks cannot starve the visual fixture and UI readers.
Shared diagnostics/offline package units belong to shared validation, not each
app's canonical lane. Developer convenience umbrellas may still compose them.

Use `node scripts/ci/coverage.cjs` to audit current expanded execution files and
alias duplication. Its output excludes setup hooks and syntax checks; the separate
reviewed resource inventory still preserves those operations and their locks.
Do not infer full behavior coverage from a clean duplicate report.

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

## Silent browser tests

Browser tests must not play through the computer's speakers. Use the shared
browser launcher and context/page helpers; Chromium also receives `--mute-audio`.
The context init script in `scripts/ci/silent-audio.cjs` routes only live hardware
output through a zero-gain sink, including WebKit. Upstream analysers, worklets,
media-stream capture and OfflineAudioContext numerical renders stay active.
Do not mute source samples, mock the AudioContext, disable the audio engine, or
change product audio code to silence a test.

Soundglow Playwright specs import `tests/visual/fixtures.cjs`, which applies the
same context policy. Shared policy checks reject specs that bypass that fixture.
Nested Chromium launches with fake microphone capture explicitly retain native
output muting; input fixtures remain unchanged. CI runs a real PCM check on both
engines proving silent output, a progressing live graph, nonzero upstream audio
and unchanged offline rendering. System-wide volume settings are not the policy.

The backing loop regression has one owner in
`apps/notewise/tests/backing-metronome.browser.ts`: seek near the real boundary,
require a newly scheduled cycle after that seek, and verify real PCM through the
seam. The mounted backing-controls test keeps real playback, pause, key/tempo/style,
navigation and persistence checks without another 87-second full-loop wait.
Pre-seek events and restored held voices must not satisfy the boundary assertion.
A temporary real scheduler mutation that refuses the next loop is rejected by
this assertion; the unmodified scheduler passes.

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

Use **Node 24** and installed Chromium and WebKit. Nightly additionally needs
Docker Desktop and Supabase CLI **3.2.0**; start Docker through its desktop app
if stopped. Commit intended changes first: the runner rejects a dirty checkout
and validates the exact committed revision. Do not create an ad hoc serial shell/Python wrapper
or run concurrent `check-app` processes in a shared checkout.

```sh
# Before a push: all applicable CI checks (60 seconds maximum locally).
npm run ci -- --base origin/main
# All CI groups, independent of changed-file selection.
npm run ci -- --all
# Complete Nightly matrix, including both account browser engines.
npm run nightly
# Inspect selection, coverage, prerequisites and resource locks without running.
npm run ci -- --all --plan
# One-app diagnostic; this does NOT satisfy pre-push validation by itself.
npm run ci -- --apps songalong
```

Affected selection uses the same pending-production-release recovery as GitHub,
so a documentation-only follow-up cannot omit validation of unpromoted app code.
Unavailable public provenance fails conservatively. `--all` avoids selection
network requests and covers every push lane.

CI runs `npm ci`, prepares shared dependencies once, and runs its graph in the
clean committed checkout under the common host lock. All selected apps rebuild;
no old artifact is accepted to save time. App output directories are disjoint,
and shared writes finish before parallel app builds. CI does not provision a
backend or create snapshots. Source revision/cleanliness is checked again at
completion. Do not edit that checkout during CI. The deadline aborts unfinished
tasks and fails the entire invocation; it never passes a partial selection.
Cancellation may need a short process-termination grace period after the deadline.
Network installation failures and missing browsers are failures, not exclusions
from the timing. Releases retain their separate staged/production verification;
cloud deployment time is not part of the local test-suite budget.

Nightly installs dependencies once and creates private detached snapshots of
the same commit. Each app/configuration builds once; Chromium and WebKit share
an app build. Accounts engines use separate backend stacks and builds. Copies
use filesystem copy-on-write where supported, with private workspace links.

`CI_WORKERS` or `--workers` controls outer scheduling (CI: up to 16 locally; Nightly: up to six;
GitHub: two; range 1–32). `CI_UNIT_WORKERS` bounds the shared music unit-file
pool (default eight in local CI, four in Nightly, two on GitHub; range 1–8). Worker slots are weighted
scheduling budgets, not a promise to pin every subprocess to a CPU. Compare worker counts against the same CI inventory. A serial CI baseline
may exceed the hard deadline and is then a failure, not a performance result. Do not raise concurrency just because a machine has many logical CPUs:
compare throughput, per-command latency and failures first.

```sh
npm run ci -- --all --workers 12
npm run ci -- --all --workers 16
npm run ci:compare -- /absolute/path/to/serial-run /absolute/path/to/parallel-run
```

The comparison refuses different tiers, commits, task/coverage inventories, dependency
graphs, failed checks or failed local lifecycle cleanup. It includes installation,
snapshot and cleanup time for local runs. Report warm/cold backend and browser
state separately; a single successful probe does not establish p95 or flake rate.

## Scheduler and coverage contract

`scripts/ci/tiers.cjs` permits only `ci` and `nightly`; the local runner accepts
`--tier ci|nightly`, and every run records its tier in its evidence. The legacy
`ci:local` alias defaults to CI; `--full` is rejected.

`scripts/ci/test-strategy.cjs` remains the owner of selected lanes and budgets.
`task-graph.cjs` creates their build prerequisites and task graph; `scheduler.cjs`
runs ready tasks within worker and exclusive-resource limits. Backend startup,
builds and account integration have explicit critical-path priorities; eligible
prerequisites reserve capacity rather than starving behind smaller UI commands. Both GitHub's
`check-app.cjs` and the local coordinator use these modules. `fast-local.cjs`
assembles the bounded local CI graph; `local.cjs` retains Nightly isolation. Shared checks use
`run-shared.cjs`. GitHub computes all matrices in the existing changes job and
starts app setup alongside shared validation; every release still requires shared
checks, its complete app matrix, and applicable Nightly Accounts checks (CI retains account unit/contracts).

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
simultaneous browser processes. Nested account reports and compact browser failure artifacts are retained too. Backend
provisioning logs may contain local credentials and stay in private snapshot
`work/ci-private/`, outside uploaded timing artifacts. Environment values are
never serialized into the inventory.

Independent tasks finish after a failure; dependants are blocked. There are no
assertion retries. Cancellation and deadlines terminate task process groups,
including detached preview children captured before their parents exit. Cancellation
waits for owned descendants to exit; PID start times guard against reuse during
the termination grace period. The Nightly coordinator stops only its owned backend
stacks concurrently in `finally`, with a separate result for each engine even if
one stop fails. Snapshots are removed after success **or failure** once logs, browser failure
artifacts, unexpected source diffs and untracked source have been retained under
the run's `evidence/` directory. Dependency trees, generated builds and backend
credentials are not retained as failure artifacts. `CI_KEEP_SNAPSHOTS=1` is an
explicit debugging opt-in; clean those printed worktrees after investigation.
A failed backend stop also retains its snapshot so its stack ownership metadata
is not lost. Preserve deliberate source changes before manual cleanup.

For targeted iteration, `TEST_BROWSER=chromium node scripts/ci/check-app.cjs
songalong ci core` still builds and runs that explicit lane through the same
scheduler. Convenience aliases are not a substitute for the complete local
runner. Nightly never publishes.

## Current 60-second CI measurement — 21 November 2026

Two complete `npm run ci -- --all` runs on the Mac Studio passed in **45.83s**
and **46.28s**, including dependency installation, fresh builds and overhead.
An additional externally timed invocation passed in **46.16s** from before
launching npm until process exit. All used the same 20-task CI inventory, 16 outer worker slots and eight music
unit-file workers, on 24 logical CPUs and 64 GiB RAM. Browsers were installed
and npm/OS caches were warm; build outputs were recreated each time. This leaves
about 14 seconds below the hard budget in these runs, not a p95 guarantee.

CI selects shared/account/offline/diagnostics/music units and contracts, DoReGo
and SongAlong units, Soundglow state/DSP and development-server checks, all four app builds and
type checks, DoReGo real PCM/playback checks, critical MIDI permission/grading/
hotplug, SongAlong audio departure/recovery and guitar controls, and desktop/
phone WebKit startup, rendering, overflow, runtime errors and isolated auth
confirmation for all four apps. The new critical MIDI check uses the existing
simulator; it does not pretend to test physical hardware.

The full real-backend Accounts suite previously took 117 seconds by itself.
It now runs in Nightly, together with exhaustive MIDI, editions, catalog,
visual/performance, offline recovery and longer browser scenarios. The policy
tests require Nightly to retain current CI execution coverage.
This is a deliberate coverage tradeoff, not a claim that parallelism alone made
the previous suite fit in 60 seconds. Release provenance and live smoke checks
remain mandatory and are timed separately from the local CI suite.

See [the measurement record](testing-ci-budget.json) for SHAs and retained evidence.

## Earlier exhaustive CI measurement — 21 November 2026

This historical comparison predates the 60-second CI coverage decision. It is
not the current CI budget or a coverage-equivalent comparison to today’s CI.

The complete push-equivalent suite on the same committed code and identical
40-task inventory measured:

| Outer workers | End-to-end time | Outcome |
| --- | --- | --- |
| 1 | 12m29s | All required checks and cleanup passed |
| 6 | 4m08s | All required checks and cleanup passed |

That is **3.02× faster**, saving 8m21s (67%). End-to-end time includes dependency
installation, private snapshots, execution and backend/snapshot cleanup. This was
one controlled pair on macOS arm64, 24 logical CPUs and 64 GiB RAM, with warm
runtime caches and a fresh backend per run. It is not a p95 or reliability claim.
The measured commit, coverage digest, machine, exact seconds and retained run
paths are in [the measurement record](testing-performance.json).

Additional validation exercised both DoReGo regression engines and all three
catalog shards per engine (184 cases each). Soundglow's original 247 collected
cases equal 48 UI plus 199 timing cases, with no omissions or duplicates. The
UI group passed on both engines (40 passed, eight existing desktop-only skips
per engine); a Chromium 4× CPU throttled continuity case passed with one worker.
Those are targeted checks of changed regression paths, not a declaration that
all unrelated pre-existing nightly failures are fixed. Required coverage and
budgets remain unchanged.

Keep later performance reports scoped the same way: a faster subset or a failed
run is not a suite speedup. The 4m46s initial parallel pilot also showed ready
queue delays of 91s for Accounts and 132s for shared music; prerequisite priority
and capacity reservation removed that starvation. Retain queue timings so future
optimizations address the current critical path rather than increasing workers
blindly.

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
