# Reggae and Funk exploration

Branch `experiment/reggae-funk`, based on the committed Country/genre framework
`58d66b5`. Main and the separate acoustic-space experiment are unchanged.

## Definitions and strategies

Both genres are added to the shared registry. IDs, labels, preferred tempo,
harmony, groove strategy, subdivision, roles, phrase/fill policy and the 64-bar
section envelope are data. The generated groove builder implements two distinct
strategies: one-drop and syncopated funk. It reuses concert-key cyclic guitar
voicing, recorded drum articulation, guitar handling and the shared pocket.
The pocket now reads subdivision from the registry: Blues triplets, Rock/Country/
Reggae eighths, Funk sixteenths. Existing subdivisions remain unchanged.

The backing widget exposes all five genres in a wrapped three-column control.
Saved settings and playback selection use the same registry. Preferred tempo
remains advisory, preserving the user's BPM when changing genres.

### Reggae

78 BPM previews, one-drop kick/cross-stick on beat 3, light eighth-note hats, ringing
guitar chord support on the offbeats, and two spacious bass attacks per bar.
Alternating bars shift bass placement without adding notes. The Breathe section
omits the second bass attack on alternate bars, producing 124 bass attacks in the
64-bar form. Steady/Active keep identical bass counts; activity changes restrained
fills and chord length. Harmonic cycles provide four areas in major/natural minor.

### Funk

104 BPM previews, strong backbeat, syncopated kick placement, damped ringing guitar shells,
short recorded staccato bass, and a solid first-beat anchor. Steady keeps a lighter
hat pulse. Active adds selected sixteenths, very soft off-centre snare strokes and
occasional extra supporting guitar chops, with exactly the same two bass attacks
per bar. The goal is supporting practice rather than a busy bass showcase.

Both have Opening (8), Pocket (16), First lift (16), Breathe/Break (8), Return (8),
Home (8), with a return to opening energy at the 256-beat loop seam. Phrase-level
chord-tone and fill variation changes with the loop cycle. All pitched material
stays within the chosen major/natural-minor parent scale; these initial versions
use triad-shell harmony. Additional chord vocabularies require their own explicit
scale compatibility policy.

## Sounds and balance

Existing CC0 sampled electric guitar, bass and Virtuosity kit/percussion only.
Bass uses the existing recorded sustained/staccato articulations. Guitar chord
support now uses ordinary ringing recordings, following the sustain listening
revision below. Approved bus gains, dry panning, compressors, shared room and
sample libraries are retained. No new downloads, software installation or sfizz.
The new genre rhythms/compositions are original; previous GMD attribution for
Blues/Rock remains intact. Instruments play new genre-specific parts, so their
perceived activity differs while the mixer stays fixed.

## Preservation and checks

186 unit tests pass. The 224 frozen Blues/Rock fingerprints still match exactly.
An additional 112 Country fingerprints captured before this change also match
exactly, spanning modes, qualities, keys, two cycles and tempo cases. Reggae/Funk
are checked in every major/minor key and both modes for sparse bass, four-plus
pitch classes, playable string positions, scale-safe harmony, physical voice
bounds, seam energy and at-most-two simultaneous hand strokes. One-drop kick
placement, recorded muted comping and Funk ghost strokes are checked explicitly.

Build and TypeScript pass. Browser checks cover Country and both new styles,
selection/playback, key reload, tempo changes, loop cycles, physical chokes,
metronome phase and mobile horizontal overflow. The approved Blues/Rock browser
regression also passes. Working sample memory remains unchanged.

## Reproduce

- `npm test --workspace=@ldayton/music-practice`
- `npm run build --workspace=notewise`
- `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
- `npm run test:backing-genres --workspace=notewise`
- `npm run test:backing-realism --workspace=notewise`
- `node_modules/.bin/tsx scripts/render-groove-previews.mts OUTPUT`
- `python scripts/match-backing-ab.py OUTPUT`

Eight full 64-bar WAV previews: Reggae 78 BPM / Funk 104 BPM, A major and A minor,
Steady and Active. Stereo 48 kHz/24-bit, with two seconds of release after the
story. The preview tail is not part of the app's loop period. One constant gain
per file matches loudness across the set, without limiting or rolling gain changes.

## Chord sustain revision

Listening feedback requested more chord sustain. Only guitar articulation and
length change: ordinary ringing samples replace staccato samples, with lengths
owned by each genre's activity definition. Reggae Steady/Active use .78/.66 beats
(about 600/508 ms at 78 BPM); Funk uses .60/.48 beats (about 346/277 ms at 104 BPM).
The prior values were .23/.18 and .18/.13 beats respectively. Physical string
repicks, harmonic boundaries and the circular endpoint can shorten individual
notes. No new attacks, pitches, chord rhythms, or mixer-gain changes are added.

An additional 48 frozen fingerprints verify that drums, percussion and bass are
exactly unchanged across styles, modes, qualities, selected keys and two cycles.
The original eight preview files remain in `reggae-funk-backing-tracks`; updated
previews are in `reggae-funk-sustained-chords`.
