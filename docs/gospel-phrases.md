# Authored Gospel ensemble phrases

The first content-authoring milestone adds eight coordinated eight-bar scores to
Traditional Gospel in the scale viewer: two each for major/minor and Steady/Active.
They alternate at phrase boundaries inside the existing 64-bar dynamic form. Key
and tempo changes preserve the phrase sequence; pausing does not choose new music.
No model runs in the browser, and no service, subscription or API key is needed.

## Musical brief

Keep tonic harmony suitable for practising the selected scale. Hammond is the
lead accompaniment, piano provides occasional punctuation, and bass/drums leave
room for the learner. A bass reply, organ answer or drum turn gets its own window;
the other parts leave space. Steady uses held voicings, roots/fifths and quiet rim
sections. Active adds swung comping, restrained bass pickups and tambourine.
Major sixth/ninth colours and minor seventh/suspended colours vary the harmony
without introducing notes outside the selected pentatonic vocabulary. This common
vocabulary also fits the full major/minor and blues exercises. This is a deliberate
constraint for scale practice, not an attempt to reproduce every Gospel harmony.

## Content contract and integration

`packages/music-practice/src/backing-phrases/gospel.json` contains explicitly
authored cells and eight-bar ensemble scores, with provenance and descriptions.
Each bar names one cell for each instrument and an optional answer owner. Cells
contain `[tick, length, notes, velocity]` strokes at 12 ticks per quarter note
(48 ticks per bar). Drum/percussion notes are GM pitches; bass offsets are relative
to C2 and manual offsets to C4. Transposition uses the nearest tonic around C,
keeping bass at MIDI 30–53 and manuals at 49–79 across all twelve keys.

`readGospelLibrary` rejects unsupported versions, malformed strokes, missing cells,
unavailable pitches, overlapping bass/same-pitch attacks, non-scale notes, excessive
density/polyphony, competing answers and misplaced fills. The default library is
validated once. Unit tests require its acceptance; unavailable/rejected content
falls back to the existing arranger. Structural validation cannot establish that
a performance sounds good.

`gospelPhraseTake` realizes accepted scores over a resolved tonic plan, retaining
its section expression, Hammond registrations and rotary scenes. The standard
drum articulation, ensemble timing, sample processing, mixer and master-volume
path still run. Organ velocity becomes gain because the synthesized organ does
not use the sampled-piano velocity layers. A measured 1.1 dB score gain matches
the existing factory loudness target. Other styles and the generic Gospel
progression path remain unchanged.

For another content iteration, author replacement cells/scores against this brief,
validate them, render the actual instruments and inspect the ensemble and stems.
Review the music before shipping; do not automatically accept a model's output.
Changing arrangement density or voicings requires another full loudness audit.

## Local verification and previews

With Node 24, FFmpeg and Playwright available, from the repository root:

```sh
npm test --workspace=notewise
npm run build --workspace=notewise
npx tsx apps/notewise/tests/gospel-phrases.browser.ts
TEST_BROWSER=firefox npx tsx apps/notewise/tests/gospel-phrases.browser.ts
TEST_BROWSER=webkit npx tsx apps/notewise/tests/gospel-phrases.browser.ts
npx tsx apps/notewise/tests/audit-backing-loudness.mts --styles gospel --scale-harmony --check --output work/gospel-phrases/full-audit
npx tsx apps/notewise/tests/audit-backing-loudness.mts --gospel-phrases --check --output work/gospel-phrases/previews
```

The phrase tool exports eight stereo mixes and their five stems as 48 kHz/16-bit
WAVs, using the production player, recordings, effects and factory mixer. Steady
intentionally rests the tambourine, so those four percussion stems are silent.
The exports are diagnostics after the master processing, not stems intended to
sum perfectly back into the compressed mix. Files and reports stay in ignored
`work/`. Live output is muted during automated rendering.

Unit checks cover all twelve keys, all six scale types, both feels and 50/90/180
BPM, plus rejected content, fallback, immutability and phrase sequencing. Browser
checks use MacBook Air (1680×1050, DPR 2) and iPhone 14 Pro (393×852, DPR 3), with
real playback, transposition, pause/resume and saved/reset mixer controls.

On 20 November 2026, complete C-major/minor factory renders at 76 BPM measured
**−24.1 to −23.9 LUFS**, maximum **5.2 LU LRA**, and highest true peak **−10.4 dBTP**.
These are complete-program measurements; quiet stems and short phrases are not
individually normalized to the full-mix target.
