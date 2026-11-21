# Intermittent failures under investigation

This is an evidence log, **not** a quarantine list. These checks stay required.
A green diagnostic rerun does not close a case. Close it only with a cause,
fix, and validation of the affected lifecycle. Add new cases here when a rerun
passes without an established explanation; include the first failed run.

| Check | First evidence | Status and next investigation |
| --- | --- | --- |
| DoReGo Chromium desktop tempo commit | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407552528): `setTempo` timed out after entering 240 during playback | Open. The same required regression passed on diagnostic retry. Capture input value, committed `aria-valuenow`, transport state and any pending restoration/reset if it recurs; do not add input retries or a sleep. |
| SongAlong WebKit fingerings navigation | [Failed job](https://github.com/ldayton/SoundTools/actions/runs/44770435880/job/136407553879): pending FLAC loads reported access-control errors during navigation | Open. The same required regression passed on diagnostic retry. Determine whether this is cancellation during navigation or an actual failed asset request. Preserve browser errors and request/trace evidence; do not blanket-filter access-control errors. |

The separate guitar-fingering **mobile reload** race had a concrete fix: wait for
the lazy score before opening controls. Shared `openHymnControls` now owns startup
and responsive-layout readiness, with a delayed-startup browser regression.
That does not establish the cause of the WebKit asset-error case above.
