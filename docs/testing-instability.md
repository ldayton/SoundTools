# Intermittent failures under investigation

This is an evidence log, **not** a quarantine list. These checks stay required.
A green diagnostic rerun does not close a case. Close it only with a cause,
fix, and validation of the affected lifecycle. Add new cases here when a rerun
passes without an established explanation; include the first failed run.

| Check | First evidence | Status and next investigation |
| --- | --- | --- |
| DoReGo Chromium desktop tempo commit | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407552528): `setTempo` timed out after entering 240 during playback | Open: not reproduced in the desktop suite or 100 Chromium edits under 6× CPU throttling, including volume-popover dismissal (macOS and Linux probes). This is not evidence of a fix. `setTempo` now requires both the displayed draft and persisted owner value, and reports the bounded input/key/focus event history, input text, ARIA, committed BPM, focused element, transport mode and busy state on failure. No retries or sleeps were added. The original artifact contained only a timeout and console warning, so its final input/owner state cannot be recovered. |
| SongAlong WebKit fingerings navigation | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407553879): pending FLAC loads reported access-control errors during navigation | Fixed: a completing prewarm worker could start another fetch after navigation began but before `pagehide`. Reproduced locally after removing the `networkidle` workaround; the retained trace reports the same access-control error at `sampleBytes`/`fetch`, 24 ms after `goto`, while the same asset successfully returned HTTP 200 in the surrounding documents. `beforeunload` now marks departure and aborts pending requests before that gap; `pagehide` also aborts for lifecycle paths without unload. Workers check a generation so old work cannot resume. The required `audio-lifecycle.browser.ts` holds real sample requests and verifies both boundaries, reload/playback recovery, and a visible error for a genuine live HTTP 503. It fails against the original build (0 of 4 requests aborted) and passes with the fix. Fingerings now captures trace/network evidence through the shared harness, retains all page-error assertions, and no longer waits for `networkidle`. |

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
