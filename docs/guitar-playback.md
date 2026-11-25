# Guitar playback

Guitar performance is derived from the score. Written pitches, attacks, ties,
rests, capo, stanza boundaries and the practice clock remain authoritative.
Expression never rewrites the stored music or MIDI grading events.

## Performance model

`guitar-sustain.ts` retains the existing let-ring policy: a string can resonate
until a harmonic change, its own voice's rest, a repeat boundary or the end.
Explicit detached articulations retain their written end. `playback-performance.ts`
then assigns physical strings, respects edition positions and stops a displaced
string. Choir tracks are separate and never receive guitar damping or strums.

`guitar-phrasing.ts` groups the highest guitar voice, or uses the vocal melody as
a guide for accompaniment. Actual gaps are strong boundaries. Duration contrast,
register changes, harmonic changes and available lyric punctuation reinforce
one another; regular barlines are not phrase instructions. This is a conservative
local heuristic inspired by [melodic grouping research](https://www.marcus-pearce.com/assets/papers/PearceEtAlAMIR10.pdf),
not a complete harmonic cadence analyser or a claim to recover the composer's
intended interpretation. Missing/ambiguous annotations never create a rest.

A small dynamic arch shapes each group. Long final melody notes receive a gentle
tail taper, including one continuous tied note. Accompaniment follows a weaker
arch and bass ringing stays independent of melody breathing. The phrase model
is deterministic and adds no rubato, pitch detuning, ornamentation, slides or
hammer-ons. Those require separate, convincing sound models and regression owners.
[KTH's phrase-arch demonstration](https://www.speech.kth.se/music/performance/Texts/phrasing.htm)
is a reference for shaping, not evidence that a particular inferred boundary is correct.

Chord-only/accompaniment strums use beat-aware direction, including pickups and
dotted-quarter pulses in compound metres. String distance determines brush travel
time; stronger brushes move a little faster. Offbeat upstrokes are lighter. The
gesture affects audio offsets inside a chord, not the score onset, tempo or end.
Fingerpicked chords remain simultaneous. Display mode never chooses performance style.

## Recordings and working set

The sampler reuses the existing CC0 Meta Steel Guitar soft/medium recordings at
frets 0–12. `assets/songalong-guitar` adds 222 recordings: the hard layer and all
three recorded dynamics through fret 20. The combined bank has 378 mappings,
including the documented missing low-string B2 adaptation from A#2. Recordings
are 24 kHz/16-bit FLAC, with natural one-shot decays capped at six seconds and
a 40 ms terminal fade. No per-note normalization, sustain loops or invented
round robins are introduced. Meta has one take per string/note/layer.

The additional packaged recordings occupy about 13.4 MiB. Playback fetches/decodes
only the pitch/string/dynamic combinations used by the prepared performance.
The whole verified offline pack retains the recordings and their provenance.
The backing engine's palette is unchanged; the extension is selected by the hymn
sampler. Original and output hashes are in `source-sha256.json`, and credits are
included in the existing offline provenance list.

Regenerate explicitly with `python3 packages/music-practice/scripts/build-songalong-guitar.py`.
It requires ffmpeg and the reference `flac` encoder, downloads only from the pinned Meta revision and caches raw
recordings under `work/songalong-guitar-source`. CI validates committed outputs;
it never downloads or regenerates recordings. See the
[source specification](https://github.com/facebookincubator/Meta-open-sound/blob/main/systems/instruments/meta-steel-guitar/README.md).
The reference encoder uses 4096-sample blocks, matching the established bank.
Do not substitute FFmpeg's default FLAC framing without a real WebKit decode
check; successful Chromium decoding and HTTP cache verification are insufficient.

## Verification and listening

- CI: `apps/songalong/tests/playback-performance.test.ts` owns phrase/gesture
  rules, timing invariants, same-string damping and choir separation.
  `guitar-samples.test.ts` owns complete mapping coverage and output hashes.
  Existing edition contracts retain independent musical and physical goldens.
- Nightly: the existing `instrument-audio.browser.ts` owns native decoding of
  every added recording in each engine, real sample loading, captured envelopes,
  unclipped PCM and pause/resume. Guitar and edition
  browser checks retain capo, MIDI and responsive integration coverage.
- Manual listening: `node --import tsx scripts/render-guitar-comparison.mts <baseline-ref>`
  uses the standard host/resource locks and silent browser harness. It generates
  three before/after excerpts with equal RMS, preserves raw peak/RMS and memory,
  download and offline-render metrics, and writes `work/guitar-comparison/metrics.json`.
  The baseline is read from Git; scores and reference fingerings are identical in
  each pair. Audio is rendered offline. This diagnostic is not a full Nightly run.

Judge phrase direction, repeated attacks, melody/bass separation and ringing in
the matched audio. Unit checks protect musical correctness; do not freeze every
velocity or envelope point as a proxy for listening quality. The shared
`performance-envelope.ts` is used by the player, level measurement and renders.

## Encoding regression evidence

The first affected Nightly on `88d52d7` retained WebKit failures in
`work/ci-results/1795611170790-e6923e08`: the offline trace showed successful
sample responses, while an isolated offline render failed with `EncodingError`
(`1795611409763-c29cd46a`). These were deterministic decoder failures, not
unexplained timing flakes. The new FFmpeg-encoded files used 272-sample blocks;
the established reference bank uses 4096. Re-encoding the same PCM through the
reference encoder resolved the isolated WebKit render (`1795611554032-f2dd34fa`)
and halved the additional asset bytes. Native decoding now has an explicit
Nightly owner and the unit format guard prevents this framing from drifting.
