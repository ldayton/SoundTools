# Backing realism exploration

Branch: `explore/backing-realism`, based on main's backing/metronome merge.

## Musical changes

- The committed scale's **tonic and major/minor quality** now reach the player.
- Major rock uses I–IV–vi–V, minor rock i–VI–III–VII. Each chord lasts two bars.
- Major shuffle uses I/IV/ii/V; minor shuffle uses i/iv/VI/v over the original 12-bar form. These are deliberately scale-compatible practice harmonies. Traditional dominant-seventh blues would be a separate explicit harmonic choice because its color tones can conflict with a major-scale exercise.
- Guitar voicings are selected from playable three-string grips with three different chord tones and no more than a four-fret span among fretted notes. The cost favors nearby voices and common tones, with a bounded register center.
- Supporting strums vary in direction, string coverage, attack strength and spread. Quiet sections retain common ringing strings. Active adds occasional soft rebrushes and short recorded staccato strokes; no lead melody is added.
- Bass roots and answers follow the new chords, coordinate with actual kick timings, and simplify during fills. Approaches target the next chord's root and remain within the selected scale.
- The existing long 64/72-bar dynamic arc remains. Each successive take makes seeded phrase-level choices. Human-performance fill fragments can replace other fill fragments in their existing musical slots; kick anchors and section arrivals remain intact. Velocity variation is correlated over phrases rather than independently jittering notes.
- Brighter sections engage stronger recorded string velocity layers. The approved -12 dB bass/guitar bus attenuation remains unchanged, with drums leading the arrangement.

## Playback changes

- Native chromatic recordings reduce pitch shifting to at most one semitone for generated notes across all twelve keys.
- Additional recordings and staccato articulations come from the existing CC0 libraries. No sampler or software installation is required. The expanded pack is approximately 50 MiB; the existing sample-library commit pins and the new source-blob SHA-256 audit retain provenance.
- Closed/pedal hi-hat events choke open hats. Bass is monophonic; guitar voice replacement is scoped to the physical string, so other strings can continue ringing. Future note-off noises are cancelled when a voice is replaced.
- A quiet original stereo room with early reflections is shared by the instruments; the bass send is very low. The room is generated deterministically in code and requires no external impulse response.
- Live playback and offline WAV rendering share the same sampler, compression, buses and room graph.
- Only the active scale's pitch/register working set is decoded. Bass buffers are resampled by the browser to 16 kHz and guitar to 24 kHz, above their already filtered bandwidths; drums retain the context rate. This preserves pitch and note duration while bounding memory. Stale key-load completions cannot overwrite the latest key's working set.
- A fixed post-compressor headroom trim prevents the observed transient overload without flattening the long dynamic arc. During a key reload the band can mute briefly while the metronome continues its backing clock, rather than jumping to its independent BPM.
- The arrangement cache retains only the current and preceding take. Tempo edits and pause/resume preserve the absolute long-form position, including after a loop.

## Validation

Unit coverage checks deterministic takes, changing cycles, four harmonic areas, scale compatibility, playable guitar grips, long string durations, native-pitch/release/articulation coverage in all keys, physical choke rules and the original room response.

Browser coverage checks actual decoded playback, time-signature/metronome controls, long loop boundaries, note choking, major/minor propagation from Scales, bounded decoded memory, tempo edits after wraparound and cancellation of overlapping key loads. A separate listening renderer creates complete major/minor Active previews through the live audio graph.

Commands:

```
npm test --workspace=@ldayton/music-practice
npm run build --workspace=notewise
./node_modules/.bin/tsx apps/notewise/tests/backing-realism.browser.ts
TEST_BROWSER=firefox ./node_modules/.bin/tsx apps/notewise/tests/backing-realism.browser.ts
TEST_BROWSER=webkit ./node_modules/.bin/tsx apps/notewise/tests/backing-realism.browser.ts
./node_modules/.bin/tsx apps/notewise/tests/backing-metronome.browser.ts
./node_modules/.bin/tsx scripts/render-backing-realism.mts OUTPUT_DIRECTORY
python scripts/normalize-backing-previews.py OUTPUT_DIRECTORY --target-lufs -20
```

Expand recordings using the existing local Python audio environment:

```
python scripts/expand-backing-samples.py --renderer /path/to/render_realistic.py
```

That renderer reads the existing pinned local library repositories, including original Git blobs for guitar WAV files. Source recording licenses remain CC0; adapted Groove MIDI Dataset performances remain CC BY 4.0. Attribution remains in Settings.

## Listening criteria

Compare at similar loudness. Listen for connected chord transitions, less repetitive guitar articulation, kick/bass agreement, the quiet middle section and the final return to the opening. These checks are hypotheses about musical usefulness; automated timing and harmony checks do not replace listening.

Final local results: 148 unit tests passed; NoteWise production build passed; the live realism suite passed in Chromium, Firefox and WebKit. The existing backing/metronome browser suite passed its actual-audio loop seam and synchronization checks. The measured A-minor sample working set was 222,620,248 bytes (about 212 MiB), versus 1,278 recordings in the full pack. Four major/minor Active WAVs are matched to -20.00/-20.01 LUFS, with measured true peaks below 0 dBTP and loudness ranges of 5.8–10 LU.
