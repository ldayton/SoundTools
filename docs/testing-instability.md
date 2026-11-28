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

The [next hosted run](https://github.com/ldayton/SoundTools/actions/runs/45663034284/job/139377885779)
still found two pixels of scrolling at 1119px. Its retained trace (downloaded to
`work/layout-audit/hosted-second-browser` in the Hebrew/export worktree) shows
abcjs's final staff length exceeded the requested width; reducing framing padding
alone was insufficient. The shared adapter now reconciles actual engraved staff
extents with the probe's minimum and replans before presentation. Per-system
staff extents matter: abcjs repeats the widest viewBox on every system, so that
outer box cannot be used as each system's own minimum. The measurement cache is
cloned before refinement, and indivisible overflow remains explicit. The full
component property witness passes against a real Linux x64 browser through a
Playwright connection, including the original width and unchanged audio/scale.

## Repeat release rebase budget interruption (25 November 2026)

Repeat-options commit `0f3c091` first rebased validation is retained at
`/Users/lily/source/SoundTools-dorego-repeat-controls/work/ci-results/1795626427275-59db22e5`.
The standard affected CI selected DoReGo plus pending NoteWise/SongAlong releases
and exceeded the 60-second budget at 62.20 seconds including cleanup. DoReGo
desktop and SongAlong instrument-toolbar were cancelled; no assertion failed
before cancellation. Completed checks passed. Spotlight indexing and concurrent
host activity were observed; these observations do not establish a cause.

The Repeat suite now uses its completed-round case to verify changing the rest
to zero, rather than waiting through an additional unchanged two-second rest.
The same suite's initial cold-start Repeat still owns the explicit eight-beat
rest timing assertion; Pause cancellation and the sequence-boundary witness
remain required. No checks, assertions, resource locks or budget were removed.
A subsequent complete CI run must pass on the committed revision; a passing run
does not by itself resolve the shared timing investigation.

The subsequent run at `769ef63`, retained at
`/Users/lily/source/SoundTools-dorego-repeat-controls/work/ci-results/1795626769559-2a233a17`,
also reached the budget (62.19 seconds including cleanup). DoReGo logged all
behavior cases as passed before process teardown was cancelled. SongAlong was
still waiting at the bar-number assertion when cancelled. The release branch
was then rebased onto upstream `822e5f0`, which fixes optional bar-number behavior;
its independently recorded full local CI passed. These observations retain the
failure evidence without treating either cancelled run as a pass.

## Score export CI budget (25 November 2026)

The first full export validation retained in
`/Users/lily/source/SoundTools-hebrew-fairest/work/ci-results/1795627157570-60633870`
exceeded the budget (62.17 seconds including cleanup). All completed checks passed,
including the new PDF export witness (15.8 seconds). Instrument-toolbar was
cancelled during its score-view checks. Its score size, independent stave/chord
visibility, reload persistence and chord-preview scheduling assertions now move
intact to required `score-view.browser.ts` on a separate reviewed port. Instrument
controls, real organ/choir checks and account migration remain in toolbar.
All owners remain required in CI and both Nightly engines; no assertion, budget
or lock was relaxed.
The feedback fix's first full applicable CI run at `295b6554`, retained at
`/Users/lily/source/SoundTools-layout-framing-release/work/ci-results/1795627688680-0467b6ec`,
hit the 60-second coordinator limit (62.17 seconds with cleanup). Completed
checks passed; instrument-toolbar was cancelled after 32.2 seconds. Its score-size,
stave/chord visibility, view reload and chord-preview assertions are now an
independently required `score-view.browser.ts` command on reviewed port 4628.
The toolbar still owns instruments, organ/choir, migrations and bar-number state.
All assertions remain required in CI and both Nightly engines.

## PDF preparation readiness (25 November 2026)

[First hosted failure](https://github.com/ldayton/SoundTools/actions/runs/45699224187)
kept the Mobile PDF button disabled beyond the existing five-second assertion.
The artifact is retained locally under `work/layout-audit/printing-hosted-failure`.
The product waited for both PDF sizes before publishing either result and rebuilt
both on every reopening. Each size now becomes usable independently, with an
explicit browser-task yield between sizes; prepared files are reused for the
same score snapshot and invalidated by score/view changes. The browser witness
also changes bar numbers and compares embedded score-image hashes, independently
of PDF creation timestamps, to reject stale cached exports. No timeout, retry or
assertion was relaxed.


## Mobile toolbar CI budget (25 November 2026)

The first release validation at `078bc212` exceeded the 60-second budget
(62.17 seconds including bootstrap and cleanup). Evidence is retained at
`/Users/lily/source/SoundTools-mobile-options/work/ci-results/1795640136108-f2543f44`.
No assertion failed before cancellation: the coordinator interrupted the toolbar
lane during options reopening. Its closed-page error followed cancellation.
The expanded phone chooser interactions made the existing combined toolbar
scenario too long for this lane. Desktop geometry, sample scheduling and guest
migration remain owned by `instrument-toolbar.browser.ts`; phone geometry,
chooser combinations, saved selections and unified options are now owned by
`mobile-toolbar.browser.ts`. Both run the shared scenario with disjoint widths,
remain required in CI and Nightly, and retain their assertions and independent
port locks. No budget, timeout or retry policy changed.

### 2026-11-25 — engraving references and isolated existing Linux piano drift

The ledger/TAB ink change intentionally fails the prior guitar images on both
platforms and engines. Retained comparisons are under
`work/browser-results/score-layout-chromium-JcxyVm`,
`score-layout-webkit-Ch8dGP`, `score-layout-chromium-Jk7yC7` and
`score-layout-webkit-sc53w7`. Reviewed broken-string TAB references replace those
images without changing comparison thresholds. Linux Chromium also retained an
older piano-desktop break plan `[2,5]`; the current measured-staff refinement
produces `[1,4]`. `work/layout-audit/ink-layout-isolation.mts` bundles the same
fixture with the ink normalization replaced by a no-op: both runs produce
`[1,4]`, establishing that this is pre-existing reference drift, not the ledger
change. The reviewed new image has unchanged dimensions and passes independent
spacing/overflow/music contracts. Other piano/lyric references remain unchanged.

## Export-header floating-point bounds (25 November 2026)

[First hosted failure](https://github.com/ldayton/SoundTools/actions/runs/45700198741)
was `score-export.browser.ts`'s one-pixel header-ink boundary, not a toolbar
assertion. Artifact `failure-songalong-ci-chromium-core-1-of-1-attempt1`
retains the trace and exported PDFs. The trace's metadata evaluation measured
the italic supplemental credit at x=-1.0000211px on desktop and
x=-1.0000343px on mobile. Both differ from the accepted -1px overhang by
less than 0.00004px. The comparison now permits a 0.001px numerical epsilon
around the same one-pixel boundary; title centering, credit alignment,
separation, wrapping and all PDF assertions remain required and unchanged.
No product typography, test retry, sleep or timeout changed.


### 2026-11-25 — engraving validation budget cancellation

The first full local run for `1be7eee` exceeded the 60-second total budget:
`work/ci-results/1795641495980-e7298136` retained 55.2 seconds in the graph and
62.15 seconds including setup/cleanup. The DoReGo desktop lane was cancelled
while checking its final mobile drone case; its Playwright connection error
followed coordinator cancellation, with no preceding assertion failure. All
completed lanes passed. This remains budget evidence, not a passing run. A new
required validation follows merging the independently committed export-bound
fix from main; any passing result does not establish that this budget variance
has been fixed. No coverage, resource lock, timeout or assertion was relaxed.


## Source-guided layout review (26 November 2026)

The first expanded edition checks found stale mobile instrument selectors after
main's phone chooser change, not a music/layout failure. First evidence:
`work/browser-results/amazing-grace-editions.browser.ts-chromium-2895f2e4` and
`fairest-lord-jesus-editions.browser.ts-chromium-83e0aba6` (the latter includes the
closed chooser in its accessibility snapshot). All affected edition assertions
now open the chooser through the existing shared helper. Shared vocal/edition
fixtures do the same and close it before score interaction. Instrument counts,
voice state, music, clipping and fingering assertions remain in place.

The first short-lyric property incorrectly compared with the *no-lyrics collision
minimum*. Even a short syllable needs clearance at that minimum. Retained probe:
`work/layout-audit/probe-underlay.mts`. The corrected contract compares natural
spacing with at most one staff space of word/barline allowance; long lyrics must
still increase minimum width, all underlays preserve audio, and sparse pointed
Hebrew must pass independent geometry checks. This is a corrected test premise,
not a retry or a relaxed product requirement.

The expected piano/Hebrew visual differences are retained in
`work/browser-results/score-layout-chromium-ZVthBH` and the final OS/browser
candidate directories recorded in each changed reference's review provenance.
Reviewed references retain the same pixel comparator and acceptance limits.

The first complete edition groups retained additional failures at
`work/ci-results/1795645739193-a564109c` (Chromium) and
`1795645823757-b6daf8e3` (WebKit). Their first failing owners were fingerstyle,
I'll Fly Away and In Christ Alone. Different line breaks exposed real shared
adapter problems: abcjs's empty opening repeat token offset the printed final
measure to 14 instead of 13; simultaneous notation voices could contribute
identical TAB fermatas/position marks. The assertions remain unchanged. Generic
wrapped-repeat and multi-voice TAB fixtures now reproduce the defects; fixes
live in the shared score-markings/layout boundary and TAB presentation adapter.

## Local tempo-edit recurrence (25 November 2026)

The guitar phrase-planner checkout reproduced the open DoReGo Chromium tempo
case on `62eb5963`. First local failure:
`SoundTools-phrase-fingerings/work/ci-results/1795641647024-dbbcf136/logs/dorego_ci_core_chromium_0.log`.
The bounded event history shows focus at `65 BPM`, an input event containing
`240`, then Enter about 9 ms later already containing `65 BPM`. The final input,
ARIA and persisted owner were all 65, with transport playing and busy false.
The draft was lost before Enter; the responsible state update is not established.

The subsequent full CI run on `3b533c3` passed with no DoReGo source or test
changes (`work/ci-results/1795642589532-b9f3889e` in that checkout). This is an
unexplained passing rerun, not a tempo fix. Keep the desktop check required and
investigate the owner/render update between input and keydown. No retry, delay,
timeout increase or assertion relaxation was added.


The merge with main consolidates its coincident-fermata guard (`0cffae8e`) with
the shared destination-ink de-duplication used for TAB positions. Glyph width and
height remain part of identity, preserving genuinely distinct symbols at one anchor.


The first full CI on `157247f3` failed two existing signature contracts in
`apps/songalong/tests/hymn-ottava.test.ts`; evidence:
`work/ci-results/1795647091688-840dd567/logs/songalong_units.log`. The new inline
state tracking also consumed key/clef events attached after a system's final note
by abcjs, incorrectly suppressing a genuine boundary change at the next opening.
Tracking now requires following music in that same system. Existing boundary
assertions and new inline-change assertions are both retained unchanged.

## Hebrew lyric release CI budget (26 November 2026)

The first full local CI on `161213e5` exceeded the 60-second budget
(62.18 seconds including cancellation/cleanup). Evidence:
`SoundTools-jesus-hebrew-release/work/ci-results/1795680137532-545e769b`.
The coordinator cancelled `songalong:ci:core:chromium:1` (guitar) at 30.4 seconds;
its retained error reports the browser closing during an assertion, not an
established assertion failure. Dependency installation took 7.49 seconds.

One bounded diagnostic rerun of the same commit, with no source, test, coverage,
timeout or runner changes, passed in 57.46 seconds. Evidence:
`SoundTools-jesus-hebrew-release/work/ci-results/1795680225674-7b301fde`.
The guitar command completed in 29.5 seconds. This demonstrates sensitivity to
setup/execution timing near the budget, not a performance fix or proof of its
cause. All checks remain required and the 60-second limit is unchanged.

### 2026-11-26 DoReGo voice ribbon: local disk exhaustion

Local CI for `12057cf8` failed during build output writes with `ENOSPC`, before
the required browser checks. First logs: `work/ci-results/1795687605532-fb97bcb5/`.
The coordinator could not write `local.json` after exhausting storage. This is
an infrastructure failure, not a passing or complete run. Cleared reproducible
node_modules installations from five old worktrees, preserving source and audio
comparison artifacts. Rerun the standard full applicable CI on the final commit.

The next full run (`04fd4f53`, `work/ci-results/1795687683861-03211656/`)
reached the 60-second budget and cancelled the DoReGo desktop and SongAlong
guitar commands without a preceding assertion failure. Separated the new
voice-feedback scenario into a required CI/Nightly lane on port 4709. It tests
real-WASM input/render/lifecycle outcomes, not hardware latency or measured PCM,
so it needs no exclusive realtime-audio lock. Existing desktop/drone coverage
stays in its original lane; no assertions were removed.

The first split-lane audit (`c258590e`,
`work/ci-results/1795687826256-f20f6677/`) finished all app checks within
59.49 seconds but failed two stale policy expectations: Nightly's explicit
extra browser-file list and the desktop audio-lock assertion tied to index 0.
Updated both consumers for the added lane; desktop retains its audio lock and
the new lane must retain port 4709 without claiming realtime-audio.

The corrected policy run (`85a4b152`,
`work/ci-results/1795687905608-c84fcd5a/`) passed DoReGo and shared checks,
but exhausted the budget during the existing SongAlong guitar registry loop
(34.1 seconds for the combined control-and-sustain lane). Split those existing
assertions by ownership: `guitar.browser.ts` retains desktop/phone controls;
`guitar-sustain.browser.ts` retains every registry entry's real scheduling
durations and editorial-mark checks. Both are required in CI and Nightly.
No product music, timing assertions or coverage were changed.

Hosted run 45799723222, DoReGo job 139839750381, failed before application
checks in browser provisioning: the second Playwright dependency-install
attempt could not acquire `/var/lib/dpkg/lock-frontend` (held by apt-get 3293).
First job log retained under `work/hosted-dorego.log`; shared and the other
three app validations passed. GitHub's job-retry API returned HTTP 403
(admin rights required for this connection), so a documentation-only follow-up
triggers fresh-run validation of the unchanged feature code. This is an
infrastructure retry, not a retry of an application assertion.

The documentation-only retry's pending-release selection omitted the already
promoted NoteWise app and hit the local budget during DoReGo's final drone
cases (`work/ci-results/1795688755457-5529dc6b/`, no earlier assertion failure).
Use the standard `npm run ci -- --base origin/main --all` to validate the exact
retry commit with the broader all-app graph, previously measured at 54.85s.
No checks or resource locks are bypassed; the partial-plan timing remains an
investigation item rather than a passing run.

Hosted run 45801668107 passed all validation, but release job 139848488699
reproduced the apt contention while downloading 21 MB of fonts: the first
180-second npx attempt left apt-get 2649 running, and the second attempt
failed immediately on its frontend lock. Added apt's bounded 120-second lock
acquisition wait on disposable Linux runners, inside the unchanged 180-second
provisioning deadline. The new shell-boundary test uses fake sudo/npx and
checks the emitted apt configuration and unchanged browser-install arguments.
Retained first release log: `work/hosted-dorego-release.log`. No application
assertions, test budgets, package mirrors or signing settings were changed.

## Native swipe distance contract (28 November 2026)

[First hosted failure](https://github.com/ldayton/SoundTools/actions/runs/46128050878)
retains the `instrument-features.browser.ts` log, screenshot and trace. The
150-pixel touch gesture scrolled 135 pixels on Linux; the test incorrectly
required reaching the 303-pixel content limit, relying on macOS momentum.
This is an overspecified platform contract, not a product scrolling failure.
The required witness still verifies real native movement and no accidental
selection, then explicitly positions the score for its independent double-tap
selection check. The separate deterministic witness retains full-range access
and handle alignment assertions. No sleeps, retries or timeout changes were added.

## Frozen piano research archive validation (28 November 2026)

Before backing up the unchanged research commit `ae420530`, the standard
16-worker local CI run exceeded the 60-second budget at 62.20 seconds.
The DoReGo build took 31.0 seconds; its desktop check was cancelled after
16.9 seconds. Retained evidence: `1795860813888-ee848b80`. Completed
commands passed; the cancelled run is not a validation pass.

After inspecting the build log, process resource usage, dependency timing and
the coordinator's supported worker setting, the same full suite was run with
`npm run ci -- --base origin/main --workers 24` on the host reporting 24
available cores. All 31 required tasks passed at the same commit in 55.90
seconds, with the DoReGo build taking 17.0 seconds. Evidence:
`1795860975083-5f8807aa`. Both full runs and command logs are retained in the
private `piano-fingering-2026-11-28` archive, alongside the research snapshot.

No archived code, test selection, assertion, timeout, resource lock or budget
was changed. The capacity change and observed build-time variation are
recorded; this passing run does not establish that the historical runner's
default performance variability is fixed. This note does not authorize skipping
future checks or adding assertion retries. Only documentation is carried onto
main; the research implementation remains archived.

## Native scroll settlement before programmatic positioning (28 November 2026)

The first native-paging local CI run retained evidence at
`1795861357979-e2e26c7d`; `instrument-features.browser.ts` observed native
horizontal movement, then expected its subsequent programmatic scroll to stay
at 287 pixels while receiving 0. The test positioned the selection witness
before waiting for the preceding native gesture's momentum to finish. It now
registers `scrollend` before injecting touch and waits for that observable
boundary before setting the independent selection position. Movement, full-range
positioning and double-tap selection assertions remain required, with unchanged
timeouts and no assertion retries. The focused command passes with this wait.

That full run also exceeded the end-to-end budget at 62.16 seconds; the DoReGo
build took 22.6 seconds and its desktop witness was cancelled. It is not a pass.
The next full validation uses the standard coordinator's supported 24-worker
setting on this 24-core host, retaining all required tasks, locks and the
60-second budget, as in the preceding archived-research validation.

The 24-worker run (`1795861486993-f44cc346`) passed the repaired native-scroll
witness and all completed commands, but again hit the budget at 62.17 seconds;
DoReGo's build completed 35.2 seconds into the task graph and left too little
time for its desktop witness. Increasing parallel browser work also increased
shared-music execution from 26.8 to 35.7 seconds. The next measurement returns
to 16 coordinator slots and uses the existing `CI_UNIT_WORKERS=2` option: the
same shared-music files execute in two isolated Node workers, reserving less
capacity and reducing CPU contention while builds start. No coverage or resource
locks change. Neither cancelled run is considered a validation pass.

The two-Node-worker measurement (`1795861589415-e1d2732b`) also exceeded the
budget at 62.21 seconds; shared-music and DoReGo desktop were cancelled. Reducing
workers was insufficient. Inspection of DoReGo's build log found the identical
TypeScript project checked once by `build` and again by `build:pages`. The CI
build now retains `build` as the type-check owner and invokes a separate pages
bundle script after it succeeds. Standalone `build:pages` still type-checks.
Both Vite configurations, fresh outputs, preflight and SHA/digest validation
remain required. The build-policy unit witness retains the standalone and paired
script contracts. This is duplicate-check consolidation, not displaced coverage.
