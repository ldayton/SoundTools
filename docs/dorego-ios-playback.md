# DoReGo installed-web-app playback

This work targets the web app only. No native host or paid Apple membership is required.

## Current increment

- Request the Audio Session API's `playback` type before audio initialization.
- Register system Play and Pause handlers against the existing transport.
- Publish the exercise title, actual playback state and bounded timeline through Media Session.
- Route supported seeking and previous/next actions to the existing exercise transport.
- Clear vocal-exercise metadata when Breath Squares is selected; system commands
  cannot start a hidden vocal exercise from that view.
- Unsupported APIs must not prevent ordinary in-app playback.

These changes do not establish reliable background scheduling. The existing live
scheduler and its interruption recovery remain in place. No silent audio track
or keep-alive loop is used.

## Automated evidence

`apps/dorego/tests/audio-session.test.ts` owns supported/unsupported session
configuration. `packages/music-practice/tests/media-session.test.ts` owns shared metadata, playback-state mapping and
unsupported media actions. `desktop.e2e.ts` owns app wiring: audio-session type,
system play/pause commands (including duplicate commands), actual PCM, position
continuity and existing transport regressions. It runs in CI's existing Chromium
lane and in Nightly's browser coverage. Desktop WebKit is not an iPhone substitute.

## Simulator and device acceptance

Use iPhone Simulator for Safari and, where supported, a Home Screen installation.
Record the simulator model, iOS version and app build for each run. Test:

1. Play a multi-round exercise; confirm pitches, timing and round transitions.
2. Invoke system Pause twice and Play twice; retain position and transport state.
3. Switch to another app, then return; check audible continuity and the playhead.
4. Lock for at least two complete rounds, including a rest, then unlock.
5. Repeat after changing tempo and drone strength; retain the chosen settings.
6. Pause from system controls, wait, and resume; verify audio and UI agree.

Repeat on a physical iPhone with Silent Mode on and off, at nonzero media volume,
using its speaker and Bluetooth headphones. Physical-device checks also cover
incoming calls, competing media, route changes and extended screen-off playback.
Simulator results cannot establish hardware audio routing, Silent Mode behavior,
or real-device background execution reliability.

If the scheduler is suspended, retain the failure evidence before designing a
continuous-media playback path. Any replacement must preserve pitch during tempo
changes, drone mixing, seek position, count-ins, rests and live controls.

## Local checkpoint (2026-11-23)

Environment: Xcode 27.2, iOS 27.2 runtime build 24B8117, simulated iPhone 17.
The simulator tests use Apple's XCUITest runner; DoReGo remains a web app.

Verified locally:

- Safari and an installed Home Screen web app load and play the exercise.
- The installed app continues for 30 seconds on the Home Screen, returning with
  its playhead advanced across multiple rounds and rests.
- An AudioWorklet witness captures nonzero upstream PCM while hidden. Hardware
  output is silenced with the existing `scripts/ci/silent-audio.cjs` helper.
- The system Now Playing interface shows the exercise title and DoReGo artist.
- A fresh-launch XCUITest exercises system Pause, Play, then Pause; the system
  button changes state and the app returns with Resume and its saved position.
  This demonstrates state transitions, not reliable audio resumption through
  the native controls; that remains an open simulator result.
- The screen-power-off witness captures 105 nonzero PCM windows across roughly
  59 seconds while hidden. The simulator display required a reboot afterward;
  this experiment is distinct from normal lock/unlock behavior.
- 158 unit tests and the pages build pass; Chromium/WebKit desktop playback
  checks cover app wiring and transport regressions.

Local evidence is retained under `work/ios-playback-probe/`: `first.xcresult`
(Safari backgrounding), `standalone-background.xcresult` (installed app),
`system-pause-play.xcresult` (actual system button state transitions),
`screen-off.xcresult`, `screen-off-state.json`, and `audio-evidence-v1.json`
(upstream PCM observations). These are local artifacts, not committed fixtures.
The test-only proxy injects instrumentation; it does not change production music.

Open checks: genuine locking/unlocking, physical-iPhone Silent Mode, Bluetooth
routing, interruptions and dependable native-system resume. Display power-off is a
simulator experiment, not proof of physical screen-lock behavior.

Warm-return simulator taps became unreliable after opening system overlays.
Full-size layout readiness and coordinate diagnostics did not establish a fix;
cold launch let the system-control witness complete. Retain this uncertainty
rather than treating that success as proof of warm-return input reliability.
See `docs/testing-instability.md` for the retained failure paths.


## Native timeline / navigation limitation

The current implementation exposes the timeline, seeking and previous/next
exercise through standard Media Session APIs. Exercise navigation follows the
sidebar, including Breath Squares, and selects the destination ready to play.
Unit and browser witnesses verify their transport wiring and that tempo changes
use musical time without pitch shifting.
On iOS Simulator 27.2, `setActionHandler` accepts all five actions and
`setPositionState` accepts finite duration/position values, but the native Next
button remains disabled. This also reproduces in a fresh installed app with
service-worker caching disabled for the diagnostic witness. A successful API
call does not establish that the platform exposes the control.

Retained evidence: `native-timeline.xcresult`,
`fresh-install-timeline.xcresult`, `native-timeline-order.xcresult`, and
`fresh-audio-evidence.json` under `work/ios-playback-probe/`. The fresh probe
records action registration and position reporting, actual PCM, pointer events,
and audio interruptions. `fresh-warm-resume.xcresult` retains an unresolved
in-app Resume failure after system controls; diagnostics record an audio-context
suspension and `audio-interrupted` pause. Do not claim physical-iPhone resume,
seeking, or native round navigation verified from these results.

The user requested simulator-only work. A physical-device comparison is needed
before deciding whether a different web playback path is warranted. No native
host, paid membership, background keep-alive loop, or engine replacement has
been introduced.
