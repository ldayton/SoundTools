# Plan-first accompaniment and sampler experiment

Branch: `experiment/backing-musical-model`, based on `72ec3e3`.

A is the current approved production arrangement (`practiceBackingArrangement`),
not the earlier pre-phrasing baseline. B is `plannedBackingArrangement` with
`new BackingTrackPlayer(true)`. The default constructor now selects the approved sparse B revision. Pass `false`
explicitly to render the previous A reference.

## Musical model

The authored story metadata is recovered from the existing story generator's
bar and fill annotations, rather than inferred from instrument note counts.
Every bar declares section, texture, harmonic root/quality, phrase role, motif,
fill slot and energy. Both modes retain the 64-bar rock / 72-bar blues form.
A three-chorus conversation memory changes response ownership deterministically;
the final section returns to the opening energy for the loop seam.

Concert-pitch guitar grips are enumerated separately for each selected key.
Each is a complete triad on three real strings, within frets 0–12 and a
four-fret fretting span. A dynamic program minimizes voice motion around the
entire cyclic progression, including its last-to-first transition. Most audible
brushes use open shells, with full triads as recurring harmonic landmarks.
Direction and brush timing vary; these are assembled sampled notes, **not
recordings of whole strummed chords**. Ringing pitches stop before incompatible
harmony, or when the same physical string is picked again.

Bass uses A's existing attack times, capped at two notes per bar, without added
ghost hits or quick responses. Chord-tone choices change over 8-bar rock /
12-bar blues phrases, with a restrained phrase-level breath in duration and
velocity. Note length and brush spread vary continuously with tempo. The approved human drum performances remain
the rhythmic foundation; no generative audio model or replacement drummer is used.

## Assets and sampler

B retains the same CC0 instrument recordings and approved instrument bus gains.
The redundant guitar p layer is removed, since it is the same recording at a
second baked-in gain. Actual alternate takes and the distinct mf recording remain.
Recorded Black and Blue Bass ghost notes add a genuine articulation.

Bass is prepared at 16 kHz and guitar at 24 kHz; kit recordings retain their
source rate. Decode contexts run at the desired instrument rate, avoiding a
separate resampling render per sample. Content-addressed files and shared decode
promises reuse identical audio. Only the current key's native-pitch working set is
retained. Note-off noise responds to strike velocity and elapsed note duration.
All source attribution is preserved in the pack NOTICE and source SHA audits.

This is a controlled sampler/arrangement experiment, not a claim of whole-chord
sample realism or a trained ensemble model. It does not yet add a new recorded
whole-chord electric-guitar library or a larger drummer-performance corpus.

## Reproduce

Use the existing Python environment containing NumPy, SciPy and SoundFile, plus
FFmpeg and the repository's existing Node dependencies. No installation required.

1. `python scripts/build-backing-v2.py`
2. `npm test --workspace=@ldayton/music-practice`
3. `npm run build --workspace=notewise`
4. `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
5. `npm run test:backing-realism --workspace=notewise`
6. `node_modules/.bin/tsx scripts/render-backing-plan-ab.mts OUTPUT modes`
7. `python scripts/match-backing-ab.py OUTPUT`

Omit `modes` for Active at 72 and 120 BPM. With `modes`, both styles and both
modes render at 90 BPM. Each pair shares key, tempo, bar window, sample rate,
processing graph and bus levels. Excerpts cover 24 bars with two-bar preroll
cropped away and a two-second release tail. Loudness matching applies one
constant gain per file, preserving phrase dynamics; it performs no limiting.
The render log reports native peak and decoded sample memory; the final audit
reports integrated loudness and true peak.

## Sparse bass listening revision

Following listening feedback, B no longer adds bass attacks. It follows A's
existing onset schedule, using at most two notes per bar. This deliberately
leaves the newly packaged ghost articulation unused in the arrangement. Only
pitch choice, duration and restrained phrase dynamics vary, over longer spans.
The new render directory is `backing-sparse-bass-ab`; earlier WAVs are preserved.

## App adoption

The sparse B revision was approved and is now the default BackingTrackPlayer
configuration for both styles and modes. Settings links the active pack’s NOTICE.
The existing playback regression test exercises this default, including key/tempo
changes, metronome synchronization and loop cycles.
