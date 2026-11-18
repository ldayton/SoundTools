# Connected guitar transitions — isolated A/B

Branch `experiment/guitar-transitions`, based on approved drum articulation main
commit `d96e6fc`. The approved B guitar transitions are now the app default.
`new BackingTrackPlayer(true, true, false)` preserves the previous A reference.

The B layer operates exclusively on guitar events after the approved sparse plan
and drum interpretation. It groups simultaneous notes into hand gestures, uses
correlated down/up brush spacing (15–61 ms) and a small within-brush accent shape.
This does not add a lead part, new chord progression, extra guitar attacks or a
bus-level boost. It retains the same sampled electric guitar.

When a still-ringing pitch is repeated on the same string, B can carry it into the
next brush, leaving an upper voice rearticulated. It caps eligibility using the shortest actual p-layer recording for that pitch
(across alternates, minus a 100 ms safety margin). These samples naturally decay
in approximately 1.2–2.5 seconds. It does not loop or stretch audio to create sustain. The sampler still stops at
the actual recording's natural end. Carry opportunities depend on the chord/grip:
some passages have none. Other notes damp before the string changes pitch, with
shorter transition tails rather than a uniform 80 ms release. Foreign tones stop
before the next harmony. Sampled note-off noise follows the actual played hold
and is reduced for these soft support gestures. No decorative fret squeaks,
slides, hammer-on melody, or recorded whole-chord library are introduced.

Drums, bass, percussion, all sample libraries, bus gains, section plan and mix
processing remain identical. Guitar event count stays the same or decreases.
Shared master dynamics can react differently to the changed guitar input; the
non-guitar MIDI/performance events and samples are preserved exactly.

## Validation

171 tests pass. The new regression compares every non-guitar event exactly for
both styles and modes at 72/90/120 BPM in several keys. It checks non-overlapping
physical strings, valid harmony across held chord boundaries, loop-end bounds,
and the presence of eligible common-note carries. Existing all-key grip tests
continue to pass. Production build and TypeScript pass. Chromium live playback
checks pass for the opt-in transition layer, including key reload, tempo edits,
metronome phase, physical chokes and loop cycles.

A/B WAVs use the actual app sampler and shared processing, identical key/tempo,
24-bar windows, cropped two-bar preroll and a two-second tail. Outputs are stereo
48 kHz/24-bit; matching uses one constant gain per file, no limiting or rolling
normalization. The listening-approved B version is now the production default.

## Reproduce

- `npm test --workspace=@ldayton/music-practice`
- `npm run build --workspace=notewise`
- `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
- `npm run test:backing-realism --workspace=notewise`
- `node_modules/.bin/tsx scripts/render-guitar-transitions-ab.mts OUTPUT modes`
- `python scripts/match-backing-ab.py OUTPUT`

Uses existing tools and CC0 instrument recordings. No installation or sfizz.
