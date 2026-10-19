# Foreground-voice line quality pilot

2026-10-20, local only. Production application unchanged.

## Target

One prominent speaker talking into a nearby phone or microphone, with ordinary
imperfections and changing background noise. The primary criteria are readable
lines, retaining brief normal voicing, sensible continuity and responsiveness.
Distant barely audible speech and competing talkers no longer determine tuning.
This pass tests a narrow excursion rule, not a new detector or universal VAD.

## Recordings

Four original individual-headset channels from AMI ES2004a, official Edinburgh
mirror, CC BY 4.0; source URLs/hashes/attribution are in the local manifest. Each
12-second continuous passage is selected BEFORE pitch evaluation to maximize an
energy-based target-dominance score over the four simultaneous headset channels.
Windows start at 318.88, 171.58, 992.86 and 714.04 seconds for channels 0–3.
Target dominance fractions are 73.2%, 68.7%, 75.3%, 76.7%; competing-energy fractions
are 0.7%, 4.2%, 0.5%, 6.5%. These are microphone-energy proxies, not diarization
labels. The original channel includes its real room/crosstalk imperfections.
All four are from one meeting: this is a small pilot, not phone validation.

Matching secondary stress cases add three distinct nonvoice ESC-50 excerpts:
rain at 24 dB, vacuum at 14 dB and typing at 20 dB, each occupying four seconds.
SNR is relative to whole-excerpt speech RMS, not voiced-frame SNR. Twenty-millisecond
transition blends avoid artificial step impulses. These are explicitly synthetic
mixtures, not claimed real phone recordings. No audio is looped. No gain
normalization, clipping or time stretching is applied to the speech. ESC-50 audio
remains research-only under CC BY-NC 3.0; no recordings are shipped in the app.

The original eight-second Alice Waters control is retained to check the known
excursions. Production PraatStream, processor/WASM and grouping/path geometry are
reused. Raw detector settings, confidence threshold and gap bridging are unchanged.

## Conservative candidate

A new accepted raw estimate is tentative only if it rises at least 1,800 cents
(1.5 octaves) above the median accepted pitch from the preceding 500 ms, with at
least three recent accepted observations. Require six consecutive voiced frames,
within 600 cents of the proposed pitch, to confirm that new high regime. Six
10 ms observations require at most 50 ms future context. Once confirmed, that new
regime becomes trusted. Otherwise suppress just the tentative estimates.

There is no absolute frequency ceiling. Unanchored onsets, ordinary octave
changes, short normal voiced segments and downward/fry changes are untouched.
The policy intentionally permits unanchored/sustained noise rather than behaving
as a general noise gate. It can still reject a genuine very brief large upward
leap, or a return after sustained low fry. These are explicit failure cases to
check before adoption; high-pitch and short-voice preservation are not universal
claims.

This is an offline research function with bounded decisions, not integrated live
buffering. A live implementation must hold tentative frames instead of flashing
and revising them. The 50 ms bound is decision lookahead, not measured end-to-end
app latency. Existing analysis batching may absorb some of it, but that is untested.

## Results

| Input | Accepted raw estimates before → after | Groups above 500 Hz before → after |
| --- | --- | --- |
| English interview control | 353 → 345 | 2 → 0 |
| Voice 0 original | 653 → 625 | 3 → 1 |
| Voice 0 variable noise | 826 → 802 | 21 → 18 |
| Voice 1 original | 633 → 611 | 8 → 3 |
| Voice 1 variable noise | 761 → 721 | 18 → 13 |
| Voice 2 original | 804 → 795 | 0 → 0 |
| Voice 2 variable noise | 890 → 869 | 2 → 2 |
| Voice 3 original | 725 → 704 | 0 → 0 |
| Voice 3 variable noise | 787 → 762 | 6 → 5 |

The interview loses exactly the eight previously identified high estimates,
removing both grouped excursions. Originals retain 2,735 / 2,815 estimates (97.2%);
noise variants retain 3,154 / 3,264 (96.6%). Every removed estimate in this pilot
is above 536 Hz, despite no hard frequency rule. All below-400 Hz estimates remain.
These are descriptive retention/drawing counts, NOT accuracy or speech recall.
Retained high values may be genuine or wrong; removed high values are not labelled
errors solely on their frequency. Grouping can change selected values even when
only a few raw estimates are removed.

Some noise versions still show long high traces during background sound. The
candidate improves isolated rises; it does not solve background voice/noise
classification. The report includes all nine cases, both original and stress
versions, rather than just the clean success. Charts use the production rounded
path and an expanded axis to expose excursions that exceed the normal display.

## Reproduce

```
python tests/pitch-comparison/prepare-near-mic.py
node tests/pitch-comparison/isolated-rise.test.cjs
node tests/pitch-comparison/compare-near-mic.cjs
node tests/pitch-comparison/report-near-mic.cjs
```

Requires FFmpeg, the prior local ESC-50 research inputs, and NumPy/SciPy in the
isolated Python research environment. The preparation downloads only original
AMI sources. Output manifests record source and derived hashes. The report and
playable excerpts are under `outputs/pitch-comparison/near-mic/`.

Focused tests cover isolated rises, confirmed sustained high notes, normal octave
changes, short low/fry notes, unanchored onsets, expired context and stable results
after the 50 ms confirmation horizon. Existing preset/grouping tests also pass.
No app setting, preset, default or production asset was changed in this pass.

Integrity checks now use the source corpus pin and a separate English-control
pin. Replay validates both WAV and PCM before analysis; reports validate the same
files and the corpus identity stored in results. Missing, changed or stale inputs
fail before replacing the report. Preparation generates into a temporary directory
and validates every clip before publishing; generation or pin failures preserve
accepted audio and evidence. Publication uses per-file atomic replacement after
validation, rather than promising an atomic directory-wide transaction.

Integrity regressions (small fixtures, no corpus downloads):

```
node --test tests/pitch-comparison/near-mic-integrity.test.cjs
python3 tests/pitch-comparison/staged_corpus_test.py
```
