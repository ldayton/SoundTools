# Intermittent failures under investigation

This is an evidence log, **not** a quarantine list. These checks stay required.
A green diagnostic rerun does not close a case. Close it only with a cause,
fix, and validation of the affected lifecycle. Add new cases here when a rerun
passes without an established explanation; include the first failed run.

| Check | First evidence | Status and next investigation |
| --- | --- | --- |
| DoReGo Chromium desktop tempo commit | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407552528): `setTempo` timed out after entering 240 during playback | Open: not reproduced in the desktop suite or 100 Chromium edits under 6× CPU throttling, including volume-popover dismissal (macOS and Linux probes). This is not evidence of a fix. `setTempo` now requires both the displayed draft and persisted owner value, and reports the bounded input/key/focus event history, input text, ARIA, committed BPM, focused element, transport mode and busy state on failure. No retries or sleeps were added. The original artifact contained only a timeout and console warning, so its final input/owner state cannot be recovered. |
| SongAlong WebKit fingerings navigation | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407553879): pending FLAC loads reported access-control errors during navigation | Fixed: a completing prewarm worker could start another fetch after navigation began but before `pagehide`. Reproduced locally after removing the `networkidle` workaround; the retained trace reports the same access-control error at `sampleBytes`/`fetch`, 24 ms after `goto`, while the same asset successfully returned HTTP 200 in the surrounding documents. `beforeunload` now marks departure and aborts pending requests before that gap; `pagehide` also aborts for lifecycle paths without unload. Workers check a generation so old work cannot resume. The required `audio-lifecycle.browser.ts` holds real sample requests and verifies both boundaries, reload/playback recovery, and a visible error for a genuine live HTTP 503. It fails against the original build (0 of 4 requests aborted) and passes with the fix. Fingerings now captures trace/network evidence through the shared harness, retains all page-error assertions, and no longer waits for `networkidle`. |
| Accounts private realtime notification | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44895853285/job/136821304650): `No private change notification` immediately after cold backend provisioning | Fixed readiness gap: local tenant shutdown/rejoin reproduced `SUBSCRIBED` with health `healthy=true`, `db_connected=true`, `replication_connected=false`. Websocket membership is not database-broadcast readiness. The protocol test now waits on the local tenant health replication flag before issuing its first tested write; the notification deadline and one-attempt writes are unchanged. Unit regressions hold replication false despite healthy DB/socket state, check bounded failure evidence, and reject non-local endpoints. Original failure was not discarded or retried. |

The separate guitar-fingering **mobile reload** race had a concrete fix: wait for
the lazy score before opening controls. Shared `openHymnControls` now owns startup
and responsive-layout readiness, with a delayed-startup browser regression.
That does not establish the cause of the WebKit asset-error case above.

## Reproduction evidence (21 November 2026)

The local WebKit trace for the navigation reproduction is retained at
`apps/songalong/work/browser-results/fingerings.browser.ts-webkit-5a13446e/trace-0.zip`
in the investigation worktree. The original GitHub jobs above remain the durable
first-failure references. The trace's `goto` starts at 3324.277 ms; its matching
`pageError` occurs at 3348.678 ms. This established why cancellation only at
`pagehide` was insufficient; the first pagehide-only fix was not accepted as a
solution. No browser error is filtered in the resulting tests.

The tempo case remains open until a failed edit supplies the new state evidence
and a corresponding failing regression identifies its cause. Passing stress
probes and a stronger assertion are not grounds for closing it.

## Deterministic stale contracts found during full regression validation

The wider SongAlong WebKit lane also exposed legacy named-song assumptions in
sidebar, key, passage, octave, sight-reading and sustained-bass recovery tests.
These were repeatable stale contracts, not flakes: the named song now has a
dedicated instrument edition. The tests now use capability fixtures and the
shared arrangement-control helper. They retain partial-chord retry, tied bass,
transposition, note feedback, bookmarks, gesture/bar boundaries, clef marks,
completion and offline checks. Passage rhythm and sustained-bass requirements
are explicit in the fixture selector and shared unit tests; CI policy guards
these generic consumers against reintroducing literal song routes.

The WebKit workspace group additionally found a deterministic environment gap:
`hymn-library.browser.ts` asserted the MIDI connection menu without installing
the shared MIDI fixture. Chromium happened to supply the native API; WebKit did
not. Library geometry tests now install the same explicit MIDI fixture on both
engines, and retain the open/close, visibility and pinned-footer assertions.
The complete WebKit workspace group passed after the change.

The local Realtime health contract is pinned to the backend version used by the
CLI: [Realtime v2.167.0 tenant health API](https://github.com/supabase/realtime/blob/v2.167.0/lib/realtime_web/controllers/tenant_controller.ex).
The cold diagnostic log is `/tmp/ci-flakes-realtime-cold-diagnostic.log`;
it captures the joined-but-not-replicating state. The protocol test logs the
completed readiness boundary and includes channel/status state in a missing
notification failure. This wait polls infrastructure health; it never retries
an application write or a failed notification assertion.

The maqamat/Yemenite integration exposed a deterministic account-test focus
contract: selecting the grouped five-note exercise now leaves `#major-notes`
focused. Account restoration deliberately defers updates while any editing
control owns focus. The first failure is retained at
`/tmp/maqamat-final-accounts-first-failure.log` (expected 132 BPM, retained 160).
An isolated diagnostic seeded 128 BPM, committed 132 in the follower, observed
128 in the focused leader, then released focus; the same write propagated in
266 ms and all takeover/recovery assertions passed. The reliability test now
seeds a distinct baseline and focuses the transport before measuring propagation.
No product synchronization guard, assertion deadline or retry policy changed.

## Parallel runner validation: legacy downloaded audio eviction

The first prioritized local run (`0249120`) retained a Soundglow bookmark as
locally downloaded after `removeDownload`, failing the unchanged "Download to
open" assertion. Evidence is in
`work/ci-results/1795266332219-3b59d2d3/` (including retained browser traces).
The compatibility scenario removes the cached fingerprint. Eviction matched
only fingerprints, despite cloud-linked legacy records also having a durable
cloud ID. A deterministic unit regression fails against the original method:
it leaves the legacy cache behind while removing a fingerprint-matched copy.
Eviction now matches owned cloud identity or fingerprint and still excludes
another owner's files. The browser scenario explicitly holds the legacy
fingerprint absent and uses the real enabled Remove download menu, retaining
its bookmark/cloud-file and privacy assertions. No timeout or retry changed.

## DoReGo output routing: instantaneous reference-key audition

On 2026-11-21, the first WebKit output-channel check after preserving playback
through Settings timed out waiting for reference-note PCM at
`apps/dorego/tests/audio-channels.e2e.ts:136`. The earlier exercise-output and
live-transport assertions had passed. Retained evidence:
`apps/dorego/work/browser-results/audio-channels.e2e.ts-webkit-90798fd3/`
and `/tmp/dorego-continuity-channels-webkit.log`.

The routing scenario now explicitly holds the reference key until PCM and the
expected stereo/mono signal are observed, then releases it. The same peak and
channel-difference assertions pass with that gesture; no retry, delay or timeout
was added. This separates routing from the duration of a synthetic click.
A release before WebKit's first audio quantum is a suspected cause, based on
the reference envelope's immediate key-up path, not a proven diagnosis. Very
short reference-key tap timing remains a separate investigation; a passing
held-note routing check is not evidence that the original tap issue is fixed.

## Nightly repairs — 21 November 2026

The diagnostic run on `a9ea606` retained its first failures in
`work/ci-results/1795274850501-da54cda6/`. It was deliberately cancelled after
isolating the failures; it is not a passing Nightly result. The complete
143-task plan remains required on the repaired revision.

- **DoReGo spelling, both engines:** the new canonical exercise URL correctly
  overrode a test's separately seeded guest preferences. The label fixture now
  clears that URL before reloading its seeded preferences. All note spelling,
  geometry, picker, keyboard and responsive assertions remain unchanged.
- **DoReGo diagnostics:** port 4329 was occupied by an unrelated, hours-old Vite
  development server. The failed trace shows development dependency requests and
  HTTP 504 responses, not the packaged test artifact. The test now owns reviewed
  port 4981 and uses the shared server-readiness helper; the existing server was
  left alone. Consent, privacy, report and recovery assertions remain required.
- **DoReGo resilience:** its static test server did not implement the deployed
  SPA rewrite for the new exercise URLs. Once the test deliberately stalled the
  worker's cache, online navigation fell through to a 404. HTML navigations now
  receive the app shell; missing scripts/media still fail. All hanging-cache,
  storage-denial, offline, Range/HEAD and startup deadlines remain unchanged.
  Failures now also retain a screenshot, HTML and trace.
- **NoteWise guitar scales, both engines:** the exact persisted checkpoint
  expectation predated shape-set, Hila-shape and fret-range settings. The strict
  equality now includes their independent expected values; unrelated activity,
  migration, MIDI and all-key assertions remain required.
- **NoteWise offline, both engines:** the test still expected a second window to
  be blocked. Concurrent windows are supported. The latest-generation window
  must instead be writable with the same saved checkpoint, while the old active
  window preserves its checkpoint and exact assets. All offline/update and
  storage-failure scenarios remain required.

The earlier [Nightly failure](https://github.com/ldayton/SoundTools/actions/runs/44898663958)
also identifies two cross-platform/lifecycle issues. SongAlong's instrument audio
test explicitly passed Chromium's `--mute-audio` to WebKit; the shared harness
now supplies engine-specific launch arguments without that override. Accounts'
WebKit confirmation-window test reported an in-flight snapshot fetch as an
access-control error during navigation. Account HTTP requests now share a
document lifetime: `beforeunload` and `pagehide` abort current requests and
prevent new requests, while `pageshow` restores network access. Caller
cancellation and genuine live failures remain visible. Unit tests cover both
boundaries, and the existing real-backend confirmation-window test holds a
snapshot across each boundary, requires cancellation, and verifies recovery on
all three practice apps. Ordinary passing reloads are not the regression proof.

The diagnostic cleanup also found an untracked generated
`apps/soundglow/playwright-report-ui/index.html`. The UI/timing split introduced
report-directory suffixes, but the app ignored only `playwright-report/`.
Both suffixed report directories are now ignored as generated output. They
remain retained by the runner's report/evidence collection; tracked-source
revision checks remain strict. Both diagnostic backend stacks stopped cleanly.

The first Linux verification on `d041e1c` exposed a Soundglow environment bug:
[WebKit core job](https://github.com/ldayton/SoundTools/actions/runs/44921100009/job/136897260317)
failed because `dev-server.test.cjs` hard-coded Chromium in a WebKit-only job.
The unchanged reload/cache/worker/WASM assertions now run through the shared
engine-aware browser harness, with failure capture. The Chromium Nightly group
still exercises Chromium; the WebKit group now exercises its selected engine.
No browser install or test assertion was skipped to make the matrix pass.

The next full Linux run found an edition budget failure, not a passing result:
[SongAlong WebKit editions](https://github.com/ldayton/SoundTools/actions/runs/44924271267/job/136906905374)
was cancelled at the 15-minute job deadline while its sixth edition was still
running. The earlier identical registry took 638 seconds; this run's first five
commands took 68–321 seconds each and left insufficient time for the final one.
The registry now partitions into two independent required jobs per engine, with
the same 15-minute limit. Matrix identity, artifacts, command scheduling and
aggregate validation retain each shard. Tests prove their exact, duplicate-free
union equals every discovered edition, including uneven registry sizes. The
local full Nightly still runs the same 143 tasks. No assertion, edition or
timeout was removed or relaxed. A cancelled job is never counted as passed.

## Hosted checkout stall — 21 November 2026

The first main-branch CI attempt for `db82d1d` could not start SongAlong's tests:
[checkout job](https://github.com/ldayton/SoundTools/actions/runs/44928154655/job/136918798969)
remained inside `git fetch --depth=1` from 17:06:21 to 17:16:14 UTC, then reached
the job's 10-minute limit. No build or test command executed. The complete first
log is retained at
`work/ci-results/github-checkout-44928154655-attempt1.log`.

One targeted infrastructure rerun was requested for the same commit and its
dependents. Checkout completed on the replacement runner and validation resumed.
The underlying hosted-runner/network cause is unproven; a successful rerun is
not a code fix or evidence that an assertion flake was solved. No test or timeout
was changed for this rerun. Keep this infrastructure evidence separate from the
Nightly fixture, lifecycle and edition-partition repairs above.

## Detached visual server after cancellation (21 November 2026)

Local Nightly `1795293719172-40fc0d50` failed before Soundglow timing assertions:
Playwright found `http://127.0.0.1:4851/tests/visual/generated/harness.html`
already in use. The failure log is retained under that run's `logs/` directory.
`lsof` identified PID 21448, `node tests/visual/server.cjs`, with cwd in the owned
`SoundTools-test-model/apps/soundglow` checkout, parent 1 and its own process group.
It was left by the interrupted exploratory run `1795292814167-faee18ec`.
Only that confirmed owned listener was terminated; another old visual server
from an unrelated checkout was left alone.

Cause: terminating the test command's process group did not reach Playwright's
detached web-server group. Cleanup now captures the owned descendant tree before
terminating parents, applies a bounded SIGTERM/SIGKILL grace period, verifies
process start times before signaling a PID again, and waits for exit before
releasing the task. The regression starts a real detached listener that ignores
SIGTERM, lets its parent exit, and requires cancellation to release the port.
That lifecycle regression passes. The failed Nightly is retained as a failure,
not described as a passing rerun or discarded as unexplained intermittency.
