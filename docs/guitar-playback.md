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
not a complete harmonic analyser or a claim to recover the composer's
intended interpretation. Missing/ambiguous annotations never create a rest.

A held consonant arrival after major V–I (also V–i in minor) supplies additional
boundary evidence. Chord roots, rather than slash basses, determine the cadence;
unsupported chord annotations interrupt that evidence. A brief tonic arrival
does not automatically end a phrase. The melodic apex moves the dynamic climax
within the middle 30–70% of the group. Repeated/transposed contours receive the
same interpretation. Meter and pickups give modest pulse emphasis, including
dotted-quarter pulses in compound meter. We infer no lexical word stress from
English spelling.

A small dynamic arch shapes each group. Long final melody notes receive a gentle
tail taper, including one continuous tied note. Accompaniment follows a weaker
arch and bass ringing stays independent of melody breathing. The phrase model
is deterministic and adds no rubato, pitch detuning, ornamentation, slides or
hammer-ons. Those require separate, convincing sound models and regression owners.
[KTH's phrase-arch demonstration](https://www.speech.kth.se/music/performance/Texts/phrasing.htm)
is a reference for shaping, not evidence that a particular inferred boundary is correct.

Listening review found the original interpretation too forceful despite useful
grouping. The same boundaries and contour now use 40% of their previous expression
depth, with a 6% final-note taper and only 0.5 dB of added chord presence. Authored
dynamic level chooses the recording; inferred phrase, finger and brush weights
use the separate playback gain. A small inferred accent therefore cannot cross
a velocity threshold into a much harder recording. Written strong dynamics can
still select the hard layer. Picking alternation and stroke direction remain,
with subtler energy differences; pitches, timing, rests and resonance are unchanged.

Chord-only/accompaniment strums use beat-aware direction, including pickups and
dotted-quarter pulses in compound metres. String distance determines brush travel
time; stronger brushes move a little faster. Offbeat upstrokes are lighter. The
gesture affects audio offsets inside a chord, not the score onset, tempo or end.
Downstrokes lean slightly on bass strings; upstrokes on treble. Partial brushes
cross only the strings in the written voicing and never discard or add notes.
Fingerpicked chords remain simultaneous: thumb on the three lower strings and
i/m/a on the upper three. Successive single upper-string attacks alternate i/m,
resetting after a gap of 1.5 quarter beats. Their modest energy differences feed
the recorded dynamic layers, not detuning, random timing or fake round robins.
Melody, bass and inner accompaniment have separate expression depths; melody
breathing does not shorten bass sustain. Display mode never chooses performance style.

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
- Manual listening: `node --import tsx scripts/render-guitar-comparison.mts`
  uses the standard host/resource locks and silent browser harness. It generates
  three before/after excerpts with matched integrated loudness, preserves raw peak/RMS and memory,
  download and offline-render metrics, and writes `work/guitar-comparison/metrics.json`.
  The baseline is read from Git; scores and engine-selected capos/fingerings are
  identical in each pair. The default baseline is **03ba1ed2affe9f88db72dbfea354bbae928c1414**,
  before the entire expression/sample workstream, never the previous prototype.
  Static gain reduces each pair to its quieter side (or −24 LUFS if both are
  louder), with no compression or boosts. It retains per-side measured LUFS,
  true peak, input-identity hashes and gain correction. Audio is rendered offline. This diagnostic is not a
  full Nightly run.

The output includes the established [A/B page template](../scripts/audio-ab/README.md)
with **only the current comparison**, no experiment history or old links. The
same diagnostic checks loading, same-position switching, seeking, one active
player, decoded-buffer release and phone layout in Chromium and WebKit. Serve
the generated directory over local HTTP; no app release is needed to audition it.

## Articulated-sample investigation — 25 November 2026

The A/B uses the Meta acoustic recordings, including this workstream's expanded
three-dynamic bank. No new articulated bank is silently substituted. The current
bank has no recorded hammer-ons, pull-offs, slides, alternate takes or releases.
Changing an envelope or playback rate does not manufacture those recordings.

| Candidate | Evidence and suitability | Decision |
| --- | --- | --- |
| [Karoryfer Black And Green Guitars](https://shop.karoryfer.com/pages/free-black-and-green-guitars) | Free, publisher-confirmed [CC0](https://shop.karoryfer.com/pages/free-samples). Green Gretsch has actual hammer-on recordings; [SFZ map](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars/blob/b3b3249d37dc977a1a297bd2dc053e6d9b6b805c/Programs/modules/maps_green/hammer.sfz) has 92 regions, 46 chromatic destinations MIDI 40–86, two real round robins. Pluck/staccato/feedback also exist. | Reusable articulation reference or separate electric instrument. Electric hollowbody timbre and destination-pitch mapping make it unsuitable to splice into the acoustic bank. Map does not encode every source/destination interval or string; do not infer that coverage from sample names. |
| [Karoryfer Shinyguitar](https://shop.karoryfer.com/pages/free-shinyguitar) | CC0; archtop guitar with microphone and pickup channels, 846 samples. The published [controls](https://github.com/sfzinstruments/karoryfer.shinyguitar/blob/master/readme.txt) include muted envelopes, release-noise volume and sample-offset control. | Useful alternative acoustic-like timbre/release reference. Publisher documentation does not establish a complete acoustic legato-transition bank. |
| [Pettinhouse AcousticGuitar 3.0](https://www.pettinhouse.com/html/acousticguitar_for_konatkt.html) | Closest acoustic feature match: separate finger/pick styles, hammer-ons/pull-offs, slides, direction, pick position and mutes. Requires full Kontakt. | Desktop reference. Product/download page does not grant redistribution of raw recordings in our app; no samples extracted or added. |
| [Ample acoustic guitars](https://www.amplesound.net/en/tutorial.asp) | Detailed string-constrained legato/hammer/pull/slide engine. [EULA section 6](https://www.amplesound.net/en/EULA-Ample.pdf) expressly excludes distributing sounds or derivatives in an app without permission. | Feature reference; not an embeddable browser sample source under the published license. |

For a matching acoustic extension, obtain a redistribution agreement or record
CC0/expressly licensed material from the same instrument/session. Prioritise true
alternate plucks, thumb/finger attacks and releases, then same-string semitone/
whole-tone hammer/pull pairs in both directions. Audit actual pitch/string/interval,
velocity and take coverage before designing selectors. Preserve source hashes,
natural dynamics, lazy working sets and native Chromium/WebKit codec checks.
Do not mix unrelated guitars into an alleged seamless legato transition, assume
“free download” grants sample redistribution, or ship a large desktop bank whole.

The backing palette already uses Black And Green's twang subset; the documented
hammer-on map is additional source material, not an articulation already shipped
by the hymn sampler.

### Listening finding: I'll Fly Away, 9–11 seconds

The audition's C3/E3/G3 chord starts at 9 seconds. Both sides use the inherited
medium recordings `acoustic-0-48-2`, `acoustic-1-52-2` and `acoustic-2-55-2`.
Their two-second waveforms correlate at 0.999879 after scalar gain fitting;
peaks are 0.191 (A) and 0.179 (B), well below clipping. The issue therefore
predates this expression workstream and is not an overloaded new mix.

The G3/D-string recording has an unusually strong, moving low resonance:
its early spectral maximum is about 197.8 Hz, while the second partial is about
392.3 Hz. That mismatch is a plausible source of the reported warbling/beating;
these measurements alone do not establish every perceptual cause. The original
24-bit WAV was extracted by byte range from Meta's published
`meta-open-sound-meta-steel-guitar-wav.zip` (release `meta-steel-guitar-v1.0.0`),
verified against its SHA256SUMS, and compared at the same sample rate. It has
the same spectral mismatch and correlates at 0.999937 with the existing
OGG-derived asset. Switching to lossless source alone will not remove it.
All three recorded dynamics show a similar mismatch, so replacing medium with
soft/hard is not an established remedy. Do not silently change the musical
voicing/fingering, randomise pitch, or claim that turning it down fixes the source.
Keep the original audition A immutable while evaluating a cleaner recording.

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
