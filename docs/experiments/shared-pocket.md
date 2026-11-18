# Shared pocket — isolated timing A/B

Branch `experiment/shared-pocket`, based on `1aa47a5`. The approved B shared pocket is now the app default.
`new BackingTrackPlayer(true, true, true, false)` retains the previous A reference.

B follows the approved human drummer without moving any drum/percussion event.
It estimates local timing placement around the appropriate subdivision grid
(triplets for blues, eighths for rock), using median kick/hat placement and a
smaller contribution from the backbeat. Very soft snare ghost notes, tom fills,
and strokes far from the subdivision are excluded from this pulse estimate.
The profile is centred around the performance’s own average placement, so the
string instruments follow local deviations without accumulating the drummer’s
absolute grid offset. The grid is an analytical reference; drum playback is
never quantized.

A bass attack already near a kick targets 4 ms after it. Other existing bass
attacks follow the local placement with a restrained 6 ms lag. Adjustments are
capped at 18 ms relative to A. The guitar's whole brush follows the local pulse
with a restrained 14 ms lag, capped at 24 ms relative to A. This preserves the
approved string-to-string brush timing. There is no independent per-note jitter.

No notes are added, removed, or repitched. Velocities, event levels, articulations,
samples, section dynamics, instrument gains and room processing remain approved.
Bass stays exactly as sparse as A. Drums/percussion are byte-for-byte equivalent
as event data. Existing physical note durations may shorten slightly to avoid
new overlaps or ringing through a foreign chord; they never lengthen. Harmonic
arrivals and the loop boundary stay in bounds. Tempo and metronome phase remain
on the existing transport clock rather than following the microtiming.

Shared compression can react to altered overlaps, and loudness matching applies
one constant gain per WAV. Thus the final mixed audio is not a bit-identical drum
stem plus altered strings; the drummer's events, assets and mix settings are fixed.
No new audio assets, software installs or changes to the approved sound palette.

## Validation and reproduction

178 unit tests pass, including exact note/velocity/articulation preservation,
unchanged drums/percussion, 18/24 ms bounds, deterministic output, physical-string
and bass non-overlap, near-kick alignment and whole-brush timing preservation.
Both modes/styles are checked at 72/90/120 BPM in several keys. Production build,
TypeScript and Chromium live playback checks pass, including key reload, tempo
changes, shared metronome phase and loop-cycle handling. Memory matches A.

- `npm test --workspace=@ldayton/music-practice`
- `npm run build --workspace=notewise`
- `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
- `npm run test:backing-realism --workspace=notewise`
- `node_modules/.bin/tsx scripts/render-shared-pocket-ab.mts OUTPUT modes`
- `python scripts/match-backing-ab.py OUTPUT`

All four 90 BPM A/B pairs use the actual app sampler, approved drums, sparse bass,
and guitar transitions. Same 24-bar source windows, cropped two-bar preroll,
two-second tail, stereo 48 kHz/24-bit. Constant-gain loudness matching preserves
phrase dynamics, without limiting or rolling normalization.
