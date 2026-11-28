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
groups have 30 minutes. SongAlong core runs in two independently required shards per
engine. Nightly edition groups have 15 minutes. GitHub splits their discovered registry
into four required shards per engine; every shard is part of the aggregate app
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

Fault injection must target the boundary under test. To test an incomplete
service-worker installation, fail a required cached resource that does not stop
the foreground app from mounting; otherwise a bootstrap race replaces the
intended failure/retry scenario. Assert that the injected fault occurred and
that recovery restores the promised capability.

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
  `packages/music-practice/test-fixtures/hymns.ts`. The selector requires real
  Piano and Voice + Piano scores and multiple stanzas. Playback additionally
  requires a quarter-note meter, no pickup, three opening attacks, and a D4–D5
  octave so transposition, range and count-in contracts remain explicit. Hand
  practice is selected within Piano, and never through a retired stage picker.
  Passage fixtures require three first-bar and two second-bar attacks; labels
  and endpoints follow the measured rhythm through the unit-tested position model.
  Recovery uses three different piano melody notes over a sustained authored LH
  chord. A separate capability fixture supplies a real written LH tie, retaining
  coverage of re-strike behavior without requiring the retired bass generator.
  Original source melody/harmony extraction remains an internal edition-building
  primitive, not a selectable product arrangement. Retained music is never
  changed to keep a fixture available.
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

For the scale-system references, adaptations and regression owners, see
[the guitar scale-system contract](guitar-scale-systems.md).
For guitar performance rules, recorded-sample provenance and matched listening
comparisons, see [guitar playback](guitar-playback.md).

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
| Open a normal hymn page | `gotoHymn` / `reloadHymn` wait for startup restoration, responsive toolbar, title and visible engraved score; `waitForHymnPage(page, title)` also waits for an in-page song choice. Deliberate empty-score, fault and latency tests own their narrower boundaries. |
| Open hymn controls after navigation/reload or viewport change | `openHymnControls(page)` waits for startup, toolbar and responsive layout, then opens idempotently |
| Begin the local database broadcast protocol test | After channel subscription, `waitForRealtimeReplication` requires the tenant health replication connection before any tested writes; a healthy HTTP/DB response is insufficient |
| Edit a signed-in follower or measure propagation | `waitForAccountIdle(page)` and the expected restored input value before resetting counters |
| Open a menu after closing a dialog | `waitForDialogClosed(page, selector)` before opening the new menu |
| Navigate between offline exercise fixtures | Wait for `cache.setup.ready`, not just enabled Play; shared music pages use `waitForOfflineReady` for ready status and an idle background worker check, including when settings are hidden. Native cache verification must finish before reload/offline transitions. |
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
pool (default six in local CI, four in Nightly, two on GitHub; range 1–8). Worker slots are weighted
scheduling budgets, not a promise to pin every subprocess to a CPU. Compare worker counts against the same CI inventory. A serial CI baseline
may exceed the hard deadline and is then a failure, not a performance result. Do not raise concurrency just because a machine has many logical CPUs:
compare throughput, per-command latency and failures first.

SongAlong's unit command explicitly uses two isolated Node test workers, matching
its reviewed resource declaration. The same command runs every `*.test.ts` file
locally, in CI and in Nightly. Never restore Node's CPU-count default without
measuring the whole suite and updating the declared capacity: the outer
coordinator cannot otherwise account for those additional child processes.

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
assembles the bounded local CI graph; DoReGo and SongAlong source-only unit tests and their
independent app builds overlap after shared preparation. All remain required,
and browser checks still depend on the fresh build. Other app unit/build locks
retain their existing ownership. `local.cjs` retains Nightly isolation. Shared checks use
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

Browser commands also own separate writable Vite dependency caches through
`CI_VITE_CACHE_DIR`. Every actual task identity, including catalog partitions,
gets a different cache below its owned checkout's ignored `work/ci-vite-cache/`.
App configs append their app name. This prevents concurrent optimizers from
invalidating each other's versioned modules with 504 Outdated Optimize Dep errors.
Do not fix those errors with browser reload retries or serialize all app tests.
Ordinary developer/release cache defaults apply when the override is absent.

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
stacks concurrently in `finally`, destroying their disposable data as well as
containers (`stack stop` alone preserves data). Cleanup selects full stack IDs
whose registered project root exactly matches its account snapshot; developer
stacks are never selected. There is a separate result for each engine even if
one stop fails. Snapshots are removed after success **or failure** once logs, browser failure
artifacts, unexpected source diffs and untracked source have been retained under
the run's `evidence/` directory. Dependency trees, generated builds and backend
credentials are not retained as failure artifacts. Soundglow update-fixture
source/site copies are omitted; their release manifests/history and actual
traces, screenshots and reports remain retained. `CI_KEEP_SNAPSHOTS=1` is an
explicit debugging opt-in; clean those printed worktrees after investigation.
A failed backend stop also retains its snapshot so its stack ownership metadata
is not lost. Preserve deliberate source changes before manual cleanup.

For targeted iteration, `TEST_BROWSER=chromium node scripts/ci/check-app.cjs
songalong ci core` still builds and runs that explicit lane through the same
scheduler. Convenience aliases are not a substitute for the complete local
runner. Nightly never publishes.

## Current CI and Nightly measurement — 22 November 2026

Complete CI passed in **46.41 seconds** on the Mac Studio, including dependency
installation, fresh builds and runner overhead. Its 21-task graph includes the
previously canonical Soundglow Node/DSP checks in a bounded pool, server
integration and a real silent-output/PCM regression on Chromium and WebKit.
The hard 60-second limit is unchanged. A prior 20-task CI run took 46.48s;
coverage increased, so this is not a claim of a material CI speedup.

Complete Mac Nightly passed **121/121 tasks in 26m12s**, including private
snapshots, fresh backends and successful cleanup, versus **143/143 in 32m31s**
before the redesign: **6m19s saved (19.4%)**. Every distinct previously scheduled
execution remains owned; repeated aliases, shared-package units and browser-
independent Node checks no longer multiply across browser jobs. The loop-boundary
regression replaces repeated full-loop waits with a stronger verified witness.

The measured full Mac code revision was `1fe8e264561f96402a21c10bfd1ee0e70642b1fa`.
Later corruption-fixture and artifact-retention corrections passed their
affected local checks. Exact-commit CI and full GitHub Nightly gate final publication; the whole
Mac timing was not repeated after those corrections. See [the audit](testing-suite-audit.md) and
[measurement record](testing-suite-audit.json) for exact SHAs, scope, conditions
and retained evidence. These are individual observations, not p95 or flake-rate
estimates. The earlier 60-second coverage decision remains documented in
[its historical record](testing-ci-budget.json).

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

## SongAlong instrument selector contract

Instrument selection uses exclusive Guitar/Piano controls and an independent Voice toggle. The combined choice is persisted as one score ID. `apps/songalong/tests/hymn-instruments.test.ts` owns arrangement
membership, unsupported selection normalization and account/offline snapshot
roundtrips. The required `instrument-toolbar.browser.ts` command covers the primary
selection UI on generic capability fixtures and the explicitly named teacher score,
including keyboard exclusivity, durable selection and desktop/phone layout. It runs
in CI's Chromium lane and in each Nightly engine, using port 4613. The
Nightly edition files remain the per-registry-ID witnesses; their old instrument
menu assertions were replaced with radio-state and availability assertions, while
musical, tab, layout and persistence assertions remain in place. Generic arrangement
helpers select the owning instrument first and wait for the options panel before
inspecting an arrangement picker that may not be mounted on a narrow layout.

Teacher-score chord symbols and their piano dialog are covered by the existing
CI instrument-toolbar witness and the Nightly teacher-score browser witness.
`piano-chord.test.ts` owns independent triad/inversion/spelling expectations;
the score's photo goldens continue to require unchanged printed notes and timing.
The guitar and piano diagrams share hit-target and keyboard/focus behavior.

SongAlong's drawbar organ uses the existing playback engine. CI's required
`instrument-toolbar.browser.ts` additionally observes real organ sample loops,
checks the decoded sustain level, and renders a 12-second held note offline.
`organ-playback.test.ts` owns explicit score routing, unchanged timing and the
normalization/loop audit. Nightly's existing instrument-audio and offline commands
include organ alongside piano/guitar; no new command, tier or duplicated owner
was introduced. Whole-score loudness calibration is documented in SongAlong's README.

Staff Show/Play independence is owned by `playback-staves.test.ts` (track groups,
all registered editions, preserved music/clock, visibility and account/offline/URL
roundtrips), CI's existing instrument-toolbar witness (real Show/Play controls and
normalized choir plus organ audio), and Nightly's teacher-score witness (individual staff
visibility, all-hidden, durable choices, two-second piano preview, contrast and
responsive screenshots). Each registry edition browser retains a table contract
assertion. Key-menu, octave, key and playback witnesses now read the range from
the selected key label. No new command or tier was added.

Pitch/timing/stanza tests continue to compare every written note; choir timbre
metadata is checked separately against the teacher's original vocal track. The
existing instrument-audio and offline owners require both human choir and organ
samples on that score. Full-song calibrated choir/organ levels are in SongAlong's
README; the builder retains source hashes and independent decoded measurements.

## SongAlong complete arrangement support

The nine-song support standard and musical validation owners are documented in
[the song support matrix](songalong-song-support.md). The three additional edition
browser files use the existing automatic Nightly edition registry and reviewed
resource inventory. Generic controls select real instrument scores by capability. The old practice
stages and their generators are retired; the support matrix records the replacement
regression owners. No product music is changed to keep a fixture available.

## SongAlong option persistence

Song choices (score, key/octave/capo, tempo, count-in, stanzas, notation and staff
Show/Play choices) survive song changes, bare routes, reloads and account restore.
Each score keeps its own staff choices. Original represents the source tonic once
in the key menu; older explicit source-tonic links remain accepted.

Independent guest-window fields merge, while key/octave/capo and checkpoints stay
atomic. Guest windows refresh durable state at a safe idle point and before song
selection. Account presentation fields and desktop/mobile sizes are separate
records; legacy bundled records remain readable and new fields take precedence.
SongAlong cloud schema 2 makes older cached readers request an update before
uploading their obsolete bundles; existing schema 1 data migrates on restore.
An explicit initial song link outranks the cloud's last-opened song, and its
retained selection is queued durably rather than merely displayed locally.

Unit owners are recovery.test.ts, account-records.test.ts, playback-staves.test.ts
and the account client's client-sync.test.ts. CI's instrument-toolbar witness
covers per-score staff choices and unique key choices. Nightly's song-memory and
key-menu witnesses cover guest windows, saved octaves and responsive menus;
tests/accounts.browser.mts covers real signed-in link restore and replication on
both engines, including desktop-to-phone favorites, reload persistence and
phone-to-desktop offline removals. These extend existing command owners, without new lanes or aliases.

## Guitar resonance

Written rhythm and sounding string duration are separate. Solo guitar playback
allows separate strings to resonate until
replayed, a changed harmony, that voice's rest, or the phrase/score end. Detached
articulations retain their written release. Piano and singer durations stay intact.
`playback-performance.test.ts` owns independent sustain, string-reuse, rest,
repeat and swing expectations; `jesus-loves-me-editions.test.ts` owns the opening
G/E overlap, G7 release, held-shape feasibility and three-stanza endings.
`instrument-edition-contract.test.ts` checks the complete registry without
changing written music. CI's existing `guitar.browser.ts` observes actual browser
sample scheduling and the printed instruction for every registered solo guitar
edition. Existing instrument-audio and edition browser checks retain PCM and
responsive notation coverage. No new lane or alias is needed.


## Shared score layout component

The contract and regression ownership are documented in [score-layout.md](score-layout.md).
Shared music units own the pure geometry planner. The required SongAlong
score-layout-contract browser witness also exercises the component independently
with piano, tab, pointed-Hebrew and dense synthetic fixtures, including unchanged
sound, physical scale, cache reuse and contained overflow. It uses the existing
browser harness and command resource ownership; no separate lane is introduced.

The score-layout evaluation corpus is a required Nightly-only command,
`test:score-layout`, with no server port. Small transformation and geometry checks
remain in the required CI component witness, and quality-contract mutation tests
are discovered by the shared music unit suite. Reviewed raster baselines are
separate for macOS/Linux and Chromium/WebKit, with a pinned test font. Normal
runs cannot replace baselines. See `docs/score-layout.md` and the baseline README
for measurement limits, candidate review and retained comparison artifacts.

## DoReGo sequence edits

The [sequence contract](dorego-sequences.md) centralizes option timing for every
exercise. `sequence.test.ts` is included by DoReGo's existing CI unit glob. The
independently required `sequence.e2e.ts` command calls `sequence.browser.ts` for source continuity,
future-round chords/rest, delayed sample preparation, paused edits and deferred
count-in. The exercise matrix stays in pure units rather than repeated browsers.

## Score print and PDF exports

`score-export.test.ts` owns complete-system pagination, ordering, page bounds and
oversized-system handling. The independently required SongAlong
`score-export.browser.ts` command runs in CI and both Nightly engines. Using the
shared generic hymn fixture, it checks bar-number defaults/reload persistence, the actual desktop print window, opening-only
signatures, both PDF page dimensions and parseable file contents, native file-share
payloads and the browser download fallback. Browser outputs retain the printable
sheet screenshot, mobile size chooser and both PDF files, separately by engine.
The platform share sheet itself remains an OS surface, not a headless browser assertion.

The bar-number view-preference witness moved intact from instrument-toolbar into
the independent export/view-options command; its default, on/off and reload
assertions have one CI/Nightly owner. Toolbar still owns instrument controls,
preferences/migrations and responsive staff-spacing controls.

`score-view.browser.ts` separately owns score size, independent stave/chord
visibility, view-option reload and chord-preview scheduling. Those assertions
were extracted intact from instrument-toolbar so independent required commands
can overlap; they are not executed twice.

### Instrument-view feature parity

`instrument-features.test.ts` and the required `instrument-features.browser.ts`
cover every ID in `instrumentEditionIds`, using the real two-bar sources across
all supported instrument/Voice combinations. The browser command owns four
isolated render workers, declared in `resources.json`. It verifies instrument-only
fingerings, full accompaniment TAB, hidden-Voice source identity, score framing,
and exact source pitches/timing (including the existing swing transformation).
A separate synthetic Voice/keyboard opening checks actual phone page bounds,
including named-staff space, key signatures, chord labels and fingerings; it
rejects overflow that would still fit inside an oversized SVG. The same owner
checks passage binding preserves local scroll, aligned handles after scrolling,
and native Chromium touch panning without accidental passage selection.
`score-view.browser.ts` owns desktop/phone controls, independent visibility,
reload persistence and chord interaction. `fingerings.browser.ts` owns piano
key changes. Existing musical edition goldens remain the music regression owner.

## Independent Nightly checks and measured scheduling

Reviewed SongAlong key, playback and sight/workspace/guitar aliases, and NoteWise
guitar/backing aliases expand into independently scheduled browser commands.
Developer aliases remain convenient, but an early assertion no longer prevents
later independent files from executing. Ordered setup/hooks fail policy review
rather than being silently split. Resource declarations preserve each command's
TCP/audio ownership; conservation tests require every expanded file exactly once.

SongAlong core has two required shards per engine; editions retain four. Both
use deterministic longest-duration-first assignment, with a bounded file count.
`scripts/ci/durations.json` records successful Linux Nightly measurements keyed by
app, engine and command, independent of task indices. Unknown checks remain
required with an explicit 60-second estimate. Estimates influence Nightly shard
assignment and bounded queue priority, and break ties between equally prioritized
critical commands in both tiers; they never change assertions,
timeouts, CI coverage or the 60-second local CI budget. Catalog costs include all
three required inner partitions. Explicit resource/prerequisite priority wins.

Refresh the reviewed snapshot from downloaded timing artifacts, not local Mac
measurements or failed runs:

```sh
gh run download RUN_ID --pattern 'timings-songalong-*' --dir work/nightly-timings
node scripts/ci/refresh-durations.cjs work/nightly-timings
```

Review the resulting plan and conservation tests, then validate the committed
change. Timings are observations, not percentile guarantees; retain headroom
rather than raising group deadlines. Newly separated commands acquire their own
measurements on the next successful hosted Nightly.

Each failed scheduled command writes an immutable `failure-*.json` beside its
timings with SHA, command, resources, exit/signal/timeout and a bounded first-error
excerpt. GitHub's job summary includes that command and excerpt. Private backend
logs stay private. Browser evidence additionally includes bounded control values,
focused element, startup/account status and allowlisted saved preferences, with
credential fields excluded and secrets redacted. Capture failures are recorded;
they do not replace the original assertion.

Failed app jobs package a diagnostic bundle with a byte/file manifest. Screenshots,
traces, reports, PDFs and measured WAVs remain; generated offline builds, sample
assets, model files, dependency caches and credential files are excluded. Timing
artifacts remain separate and always upload. A collector cannot overwrite its
first bundle. This avoids thousands of generated audio assets obscuring the
actual failure evidence.

Generic library, staff-size and audio-output checks use capability-selected hymn
fixtures. Exact musical content, pitches, timing and edition metadata retain their
independent edition/unit owners; this refactor changes no product arrangement or
musical golden. A generic fixture must satisfy its required capabilities rather
than preserve an incidental song title.
