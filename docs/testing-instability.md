# Intermittent failures under investigation

This is an evidence log, **not** a quarantine list. These checks stay required.
A green diagnostic rerun does not close a case. Close it only with a cause,
fix, and validation of the affected lifecycle. Add new cases here when a rerun
passes without an established explanation; include the first failed run.

| Check | First evidence | Status and next investigation |
| --- | --- | --- |
| Production diagnostics processing and build queue | [Soundglow release](https://github.com/ldayton/SoundTools/actions/runs/45213813982/job/137831055226) uploaded its UI source maps, then Sentry reported `Failed to process files in 300s`; [DoReGo](https://github.com/ldayton/SoundTools/actions/runs/45213813982/job/137831458362) and [SongAlong](https://github.com/ldayton/SoundTools/actions/runs/45213813982/job/137831604571) subsequently reached the release deadline while builds were queued/running. DoReGo's worker upload then hit the same processing timeout in [its first build](https://github.com/ldayton/SoundTools/actions/runs/45213813982/job/137842292496) and [a new build after the queue cleared](https://github.com/ldayton/SoundTools/actions/runs/45213813982/job/137846839171). | Open infrastructure investigation: [NoteWise’s 23 November release](https://github.com/ldayton/SoundTools/actions/runs/45239116162/job/137920283672) also built successfully and uploaded bundle `9863bafd-5294-5021-983e-f6532bfd876d`, then failed strict Sentry processing after 300 seconds; production was not promoted. [The diagnostic retry](https://github.com/ldayton/SoundTools/actions/runs/45239116162/job/137929616629) passed strict processing and staged/production checks for the same `84356e2` application commit; the live NoteWise revision and integrated controls were independently verified. This is recovery, not a processing fix. The same run’s SongAlong staging build also errored and was not promoted. All four apps previously eventually passed strict processing and staged/production checks, including [DoReGo's recovered release](https://github.com/ldayton/SoundTools/actions/runs/45220500289/job/137854910984). Soundglow's retry processed the identical UI bundle (`194e579f-1ef5-5517-8ec9-eb512a7df784`); the original timeouts have no established server-side cause. This establishes recovery, not a fix. Keep strict source-map processing, release smoke checks and existing deadlines required. |
| Protected release smoke cleanup | [Timed-out SongAlong release](https://github.com/ldayton/SoundTools/actions/runs/45200514232/job/137784470317): staged resource integrity passed, then the browser stopped after the desktop email-confirmation check | Cleanup stall: a routed background request can outlive navigation, leaving `unrouteAll({behavior:'wait'})` waiting on the download. A held HTTP response reproduces the original cleanup failure in the real protected-stage browser fixture. Smoke cleanup now closes the owning browser context, which aborts its downloads and releases its handlers. Disposing the browser-owned API client's response bodies alone does not abort those downloads. Startup, privacy, credential-origin and browser-error assertions remain required; no retry or timeout increase was added. |
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

## Parallel Vite dependency cache invalidation (21 November 2026)

Nightly `1795296237166-ba62bc4a` failed DoReGo Chromium audio-channels before the
Output control appeared. The retained context log reports HTTP 504
`Outdated Optimize Dep` for Mantine hooks, react-dom, Tone and shared diagnostics/
offline modules, followed by a failed dynamic import of `src/main.ts`. This was
not an audio routing assertion failure. Concurrent development servers in one app
snapshot shared Vite's writable default dependency cache.

Command tasks now own distinct `CI_VITE_CACHE_DIR` paths, including separate
catalog partitions. All app Vite configs honor that override while retaining
normal cache defaults outside the runner. The required assertion is unchanged;
no reload retry, extra sleep, relaxed audio check or blanket serialization was
added. The first failure and cancelled remainder remain retained.

## Offline fixture navigation before cache setup completed (21 November 2026)

[WebKit job 136989857300](https://github.com/ldayton/SoundTools/actions/runs/44951332514/job/136989857300)
failed the final no-error assertion with `Context is stopped`. Its retained trace
identifies the native error name as `Cache API operation failed`, with no script
stack, during an exercise-fixture `goto`; it is not an AudioContext failure.
The test waited for cached navigation and enabled Play, then could replace the
document while initial native cache verification was still running.

Its fixture readiness now also requires the existing `cache.setup.ready`
diagnostic event. All 12 exercises, both range extremes, actual offline playback,
worker/update/repair assertions and the no-error assertion remain required. No
native-error filter, fixed sleep, assertion retry or timeout increase was added.

## Incomplete-install fixture failed foreground assets (21 November 2026)

Nightly `1795297608652-a3578e9d` failed NoteWise WebKit offline testing at the
fresh partial-install page, waiting for its E control. Its trace/network log
shows foreground JavaScript and CSS receiving the fixture's HTTP 503s. The
fixture switched every asset to failure when `sw.js` was requested, although
worker registration can precede completion of foreground module loading.

The failed-install scenario now targets the required offline manifest, leaving
foreground JS/CSS available. It verifies that the intended resource really
failed and was not cached, that offline readiness is withheld, and that Retry
completes installation after the fault is cleared. All other corruption,
eviction, offline practice, update and storage-denial cases remain required.
The original failure is retained; no assertion was retried or weakened.

## Corruption fixture competed with online repair (22 November 2026)

[Soundglow job 137000504052](https://github.com/ldayton/SoundTools/actions/runs/44954777777/job/137000504052)
failed the expected recovery-version assertion after cached HTML corruption.
The audio timing/UI groups and other workflow jobs passed. The fixture
reconnected before mutating Cache Storage, allowing background release staging
to compete with the intended corruption; it did not establish that the poisoned
bytes remained present at navigation.

This scenario now stays offline through retention and corruption, verifies the
poisoned cached bytes, and preserves both the exact recovery-release assertion
and subsequent explicit online repair. Its complete affected local check passed
in `1795300462935-b70a2cbd`. The measured full Mac Nightly at the preceding code
revision also passed all 121 tasks; complete GitHub Nightly remains the final
cross-platform gate for the fixture correction. No fallback assertion was
relaxed, error ignored, sleep added, timeout raised or assertion retried.

## NoteWise linked-scale mobile layout readiness (21 November 2026)

First evidence: `apps/notewise/work/browser-results/scale-loop.browser.ts-chromium-2dc56d95/`.
The page-width assertion ran immediately after `setViewportSize`, before React
committed the mobile shell. The retained screenshot shows the settled mobile
layout without page overflow. The test now waits for the navbar's presence to
match the responsive media query before measuring containment and note sizes;
the containment and size assertions remain unchanged.

## NoteWise outline verification reached an older preview (21 November 2026)

First evidence: `apps/notewise/work/browser-results/hila-scale-shapes.browser.ts-webkit-8bd9dc78/`.
WebKit received `Extended Set` although the newly built assets contain
`Seven-position major` and Chromium had just passed. A concurrent Nightly
coordinator was running previews from the separate testing-model checkout.
The fixed-port preview may have collided; the listener had gone by inspection,
so that cause remains unconfirmed. The Hila browser test now accepts the runner's
`TEST_PORT` override. Diagnostic validation uses separate unused ports; this
passing rerun does not establish a fix to shared preview-server ownership.

## Maqamat browser scenario isolation (22 November 2026)

First evidence: `apps/notewise/work/browser-results/maqamat.browser.ts-webkit-7c5b1a2b/`.
The exhaustive key/hand-position loop exceeded WebKit's explicit history quota:
`Attempt to use history.replaceState() more than 100 times per 10 seconds`.
The musical diagrams continued to update, but the URL stopped at Nahawand,
so the final Hijazkar reload assertion correctly failed. Each maqam now runs
in its own browser context, retaining every key/position assertion and adding
reload coverage for each maqam. Console errors are asserted as well as page
errors; no sleeps, retries, deadline increases or product changes mask the quota.

## Guitar legend contract after chord outlines (22 November 2026)

First evidence: `apps/notewise/work/browser-results/guitar-scales.browser.ts-chromium-cfc2c709/`.
The older generic scale test expected the entire legend to contain only `Root`;
the previously added `Chord shape` control made that assertion stale. The test
now independently asserts the Root legend and exact chord-control text, keeping
root colours and all musical/layout checks. Its preview now uses the shared
server helper and accepts the coordinator's port override.

## NoteWise release switch before old update checks finished (22 November 2026)

[Chromium job 137010995964](https://github.com/ldayton/SoundTools/actions/runs/44958194222/job/137010995964)
failed waiting for the staged-update control. Its first command log and empty
browser console log are retained; that GitHub artifact did not contain a usable
trace. The fixture waited for `Available offline` in two tabs before replacing
the server release. That state precedes `prepare-update` completion; both tabs
can still share the worker's release-A `latestTask` when the synthetic reconnect
joins it, legitimately receiving A rather than discovering B.

The fixture now opts into local diagnostics and requires the latest update
check in each tab to report ready before switching releases. This establishes
an atomic fixture transition, without changing the product's update policy,
adding a delay/retry, raising its deadline, or relaxing the staged-release,
geometry, session-preservation or automatic-update assertions. Failure output
also records each tab's visibility, status and bounded cache events.

## Soundglow worker lookup treated CDP updates as snapshots (22 November 2026)

[Chromium job 137016751433](https://github.com/ldayton/SoundTools/actions/runs/44960057868/job/137016751433)
failed `Find the active worker through Chromium` in `test:updates`; all audio,
visual and other Nightly jobs passed. The test replaced its entire worker list
on each `workerVersionUpdated` event, losing a known active version when a
notification described a different version. Enabling CDP also does not guarantee
that its asynchronous lifecycle notification has arrived before the lookup.

The shared test helper retains versions by version ID, replaces lifecycle state
for changed IDs, and waits for the intended script to be activated and running.
A deterministic event-stream regression covers unrelated updates, a redundant
old version, a stopped replacement, and the subsequent running notification.
The browser scenario still stops the actual worker through CDP during a held
model request, now explicitly asserts that request exists, and retains the
resume-intent and UI-recovery assertions with their original deadlines.

## Chord preview counted notes before the SVG mounted (23 November 2026)

[SongAlong CI job 137708218381](https://github.com/ldayton/SoundTools/actions/runs/45179079195/job/137708218381)
failed the chord-breakdown timing assertion with six actual attacks but an
empty expected array. The fixture read `toneCount` immediately after opening
the dialog and obtained zero before the SVG mounted; its zero-length wait then
completed before playback. The test now waits for the visible dialog and first
rendered chord note, and requires a nonempty chord before measuring. Simultaneous
chord attacks, exact broken-chord offsets, PCM checks and error assertions remain
unchanged; no sleeps, timeout increases, error filters or assertion retries.


## Manual iOS simulator warm-return input (23 November 2026)

In the DoReGo iPhone 17 / iOS 27.2 (24B8117) investigation, XCUITest initially
reported an invalid activation point after returning from a system overlay.
Subsequent Go to start / Resume taps did not produce the expected DOM state,
even with full-size control readiness and coordinate diagnostics. This is an
unresolved simulator/automation or warm-return product issue, not an explained
flake. No production transport assertion was relaxed.

Retained local evidence under `work/ios-playback-probe/`:
`system-pause.xcresult`, `system-pause-layout.xcresult`,
`system-pause-coordinate.xcresult`, and `frames.xcresult`. The last confirms
application and web-view frames of 402 x 874 points. A fresh-process witness,
`system-pause-play.xcresult`, successfully invokes the real system Pause/Play
buttons and verifies the app's Resume state. That witness proves the system
handler wiring, but does not resolve the warm-return input failure. A physical
phone comparison is deferred at the user's request to use simulator only.


Additional iOS simulator evidence: `work/ios-playback-probe/fresh-warm-resume.xcresult`
reproduces the Resume failure in a fresh installed diagnostic app with real
pointer/diagnostic capture. The audio context reports `suspended` and the player
reports `audio-interrupted`; a cold-start success does not close this case.
`native-timeline-order.xcresult` also retains the native Next button remaining
disabled despite successful action and position API calls. These are unresolved
platform/product distinctions requiring a physical-device comparison, not
permission to relax any automated transport check. See `docs/dorego-ios-playback.md`.

## Local Hebrew-stanza preview (24 November 2026)

During Amazing Grace development, the browser run in
`work/browser-results/amazing-grace-editions.browser.ts-chromium-32f2b3c5/`
served `/assets/index-yXO3aJ4f.js` and `/assets/main-DlUiJ273.js`: its retained
screenshot still has three stanza choices and no translation credit. A later
preview served the rebuilt eight-stanza bundle with the translation credit.
The initial attempt also followed a failed TypeScript build, whose log is
`work/hebrew-build.log` in this development worktree (subsequently replaced by
successful build output). The precise cause of the second stale preview is
unconfirmed; it is not evidence of a product stanza-selection fix. Keep this
case open if old content reappears after a successful build. Edition checks now
wait for app startup and require the new translation credit before interacting;
the build and browser commands are chained so a failed build cannot run a stale
preview. These assertions remain required. Later test-setup failures (a retained
chords-only preference and a non-unique readiness locator) were diagnosed and
corrected separately, without changing product music or relaxing assertions.

## DoReGo audio recovery development (25 November 2026)

The first WebKit lifecycle run after adding resume deadlines and clock probes
failed at initial elapsed-time progress (line 65):
`apps/dorego/work/browser-results/lifecycle.e2e.ts-webkit-aab580f9/` in the
`SoundTools-dorego-repeat-controls` worktree; command output is retained at
`/tmp/dorego-recovery-lifecycle-webkit.log`. Its screenshot shows an idle player,
and the cause remains unconfirmed. A single diagnostic rerun instrumented startup
failures and passed that point; this is not proof of a fix or a confirmed flake.
That rerun failed later at the deliberate scheduling-gap test
(`lifecycle.e2e.ts-webkit-622cd846`, `/tmp/dorego-recovery-diagnose.log`): the test
blocked the thread while the new asynchronous clock probe was still starting.
The Pause label covers both starting and playing, so it was not sufficient
readiness. That witness now requires elapsed audio progress before inducing the
scheduling gap. Both assertions remain required; no timeout or retry was added.

Later Chromium diagnostics reproduced a concrete product regression introduced by
that preflight check: `diagnostics.e2e.ts-chromium-d93dc7ed` first timed out waiting
for render metrics; a diagnostic run `diagnostics.e2e.ts-chromium-e809988f` retained
`audioState: running`, `audioFailure: clock_stalled`, and a 113 ms startup check.
No source had been scheduled yet. The related Chromium lifecycle run also failed
closed-context recovery (`/tmp/dorego-recovery-lifecycle-chromium-final.log`).
Clock checks now run only after scheduling sources: the existing active-playback
watchdog and a reference-note probe that does not delay the note attack. This
removes the false cold-start assumption rather than increasing a test timeout.
The original first-run artifact lacks that diagnostic payload, so its exact cause
remains unconfirmed.

## Score layout CI budget (25 November 2026)

The first merged-revision validation at `ca85e88` exceeded the 60-second end-to-end
limit: `work/ci-results/1795625140767-bebcf87d` (62.21 seconds including cleanup).
The coordinator cancelled DoReGo desktop and SongAlong browser commands; their
page-closed errors are cancellation artifacts, not passing tests. The shared
component properties were unnecessarily serialized behind toolbar interactions.
They now have an independently required CI/Nightly command and resource entry,
with the same assertions and no server, so the coordinator can overlap that work.
No coverage, timeout or budget was relaxed.

The split-command run retained at `work/ci-results/1795625262772-07ff1686`
completed the component checks in 2.1 seconds, but still exceeded the total budget
(62.16 seconds including cleanup). Its final queued command was SongAlong's
sample-loading/lifecycle witness, unnecessarily waiting for DoReGo's realtime
lock. Inspection confirms that witness asserts loading, aborts, UI/playback state
and media actions, without PCM or latency measurements. Its inventory declaration
is corrected from realtime audio to UI; DoReGo's PCM/timing lock is retained.
All lifecycle assertions remain required in both tiers.

## Score layout horizontal framing (25 November 2026)

[Hosted failure](https://github.com/ldayton/SoundTools/actions/runs/45658306343/job/139361265583)
failed the independent space-quality assertion at 1119px on Linux. First evidence
is retained locally in `work/layout-audit/hosted-failure`. A Linux browser probe
reproduced a 1.28px excess frame: the final ink was inside the original page, but
adding eight more horizontal units unnecessarily expanded it. Horizontal framing
now reserves one unit for stroke edges; the existing engraving padding supplies
whitespace. Vertical padding and genuinely overflowing ink remain unchanged.
The same Linux probe reports zero overflow after the correction. Both macOS
browser visual corpora match the existing approved references, without updates.
The failure message now retains the complete measured geometry.

The first framing-fix CI attempt ran no tests because another worktree held the
coordinator lock. The subsequent run at `d4d6bf5` retained in
`work/ci-results/1795625896530-07d1a01f` again hit the budget (62.15 seconds
including cleanup), cancelling DoReGo desktop after 33.7 seconds. Its sequence
witness is now a separately required CI/Nightly command on its own declared port.
It observes scheduled source identities/times and UI state, with no PCM sampling
or latency benchmark; desktop retains the realtime lock for actual audio checks.
All assertions remain and the source-continuity witness has exactly one owner.

## Local CI budget interruption (25 November 2026)

Scale-heading release `8747c4b` first run retained at
`/Users/lily/source/SoundTools-scale-heading-release/work/ci-results/1795625823111-1af19aff`:
62.22 seconds including bootstrap/cleanup exceeded the 60-second budget.
DoReGo desktop and SongAlong instrument-toolbar lanes were cancelled by the
coordinator; no assertion had failed before cancellation. SongAlong's subsequent
"page closed" error occurred during cancellation, at its phone startup wait.
Builds, unit checks and completed browser lanes passed. Host sampling also showed
Spotlight indexing using 181% CPU; this is evidence of concurrent load, not an
established cause. A full diagnostic rerun keeps the same commands, assertions,
locks and budget. A passing rerun does not resolve the timing investigation.
