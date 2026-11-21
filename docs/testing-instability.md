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
