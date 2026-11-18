# Drum articulation A/B

Branch `experiment/drum-articulation`. The approved drum articulation version is now the app default.
`new BackingTrackPlayer()` selects the approved sparse plan with drum articulations;
`new BackingTrackPlayer(true, false)` retains the previous A reference.

B interprets the same drum performance using additional recorded Virtuosity
Drums articulations: half-open and three-quarter-open hats on selected phrase
upbeats; off-centre soft snare strokes; sparse rimshots at lifted eight-bar
phrase arrivals. It uses the source centre-snare velocity maps instead of
collapsing them into four representative velocities. Actual sample-map velocity
zones are respected. Round-robin bags cover each take without adjacent repeats;
snare maps lacking alternate takes can choose neighbouring recorded velocity
strokes within seven velocity units, with playback gain following event strength.

No onset, duration, velocity, or note count changes. Bass, guitar, percussion,
section dynamics, mix gains, room and master processing are identical. Existing
open/closed hats gain physically ordered choking for intermediate pedal states.
No extra cymbal or snare hits are invented. The approved bass stays sparse.

The additional sample pack has 116 logical samples, about 7.7 MiB compressed.
Its instrument recordings are CC0; source Git-blob SHA-256 provenance and full
attribution are in the new pack. All mixed microphone channels select the same
source stroke. These are real recordings, not simulated openness or rimshot EQ.
No software installation or sfizz is involved.

Unique decoded sample memory in the comparison is approximately 232–234 MiB,
versus 173–175 MiB for A. This is a quality/memory tradeoff to evaluate before
adoption. The app now defaults to the approved B sound.

## Validation

170 shared tests pass, including exact preservation of non-drum events and all
drum timing/density; recorded alternate coverage; and partial-hi-hat choke rules.
Chromium live playback checks pass for the experimental player, including
key/tempo changes, shared metronome phase, loop cycles and bounded decoding.
TypeScript and production build pass.

A simultaneous hand-stroke audit, grouping strikes within 0.015 beats and excluding
kick/pedal, finds no more-than-two-hand conflicts in any of the four complete
arrangements. This is a basic physical plausibility check, not a full biomechanical
model or claim that every chosen stroke reflects a measured drummer gesture.

## Reproduce

Use the existing Python audio environment with NumPy/SciPy/SoundFile and FFmpeg:

- `python scripts/build-drum-articulations.py`
- `npm test --workspace=@ldayton/music-practice`
- `npm run build --workspace=notewise`
- `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
- `npm run test:backing-realism --workspace=notewise`
- `node_modules/.bin/tsx scripts/render-drum-articulation-ab.mts OUTPUT modes`
- `python scripts/match-backing-ab.py OUTPUT`

The renderer uses the app's actual sample selection, voice/choke handling and
mixing graph. A and B share 90 BPM, key, 24-bar window, two-bar cropped preroll and
two-second tail. Final WAVs are 48 kHz / 24-bit stereo, loudness-matched with a
single constant gain, without limiting or rolling normalization.
