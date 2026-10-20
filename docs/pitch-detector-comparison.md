# Filtered autocorrelation experiment, 2026-10-20

Research only; no production detector or preset changes. A private user recording motivated the experiment but is not referenced by the tracked harness or included in its corpus. All private PCM, scripts and results remain in ignored outputs/pitch-comparison/private-reproduction. Do not commit those artifacts or the original recording.

## Reproduce

Prepare the pinned practice corpus as described in soundglow-pitch-pilot.md and the research WASM using tests/pitch-comparison/build-filtered.py and its pinned toolchain. Run:

```
node tests/pitch-comparison/matched-stream.test.cjs
node tests/pitch-comparison/compare-practice-detectors.cjs
node tests/pitch-comparison/report-practice-detectors.cjs
```

Report: outputs/pitch-comparison/practice-detectors/report.html. Detailed results and summary JSON are alongside it. Comparisons contain 72 cases: 16 reference originals, 32 changing-noise derivatives, 16 soft/normal AVID recordings, three noise-only negatives, five interview/conversation controls.

All modes use exactly equal production streaming requests, PCM/context hashes and observation timestamps. Research raw output must equal production raw output exactly for every clip. Research asset hashes and pinned input PCM/reference hashes are checked. Speech decisions, .45 acceptance threshold, 50 ms confirmation and the 50–1200 Hz analysis search range are held constant. Raw and filteredMatched differ in Gaussian filtering only; filteredDefaults additionally changes silence/voicing/octave costs. Mode names do not imply a complete Praat-default configuration. Scores use identical committed intervals.

## Results

Stable-reference counts below use zero reference offset. Scores also include fixed 16 and 32 ms offsets because the reference first-centre convention is unknown. Exclude ±30 ms around voicing transitions. More accepted frames does not establish better accuracy. Above-500 counts diagnose excursions, not ground-truth errors.

| Condition | Metric | Raw | Filtered matched | Filtered decision defaults |
|---|---|---:|---:|---:|
| Reference originals | Above-500 frames | 121 | 2 | 0 |
| Reference originals | Missed voiced frames | 40 | 7 | 66 |
| Reference originals | Gross pitch errors (>20%) | 24 | 23 | 11 |
| Reference originals | False voiced frames | 201 | 140 | 57 |
| 20 dB synthetic noise | Missed voiced frames | 38 | 6 | 64 |
| 20 dB synthetic noise | Gross errors | 23 | 23 | 11 |
| 20 dB synthetic noise | False voiced frames | 1242 | 512 | 255 |
| 10 dB synthetic noise | Missed voiced frames | 43 | 25 | 104 |
| 10 dB synthetic noise | Gross errors | 36 | 49 | 16 |
| 10 dB synthetic noise | False voiced frames | 1878 | 660 | 415 |
| Soft speech, unlabelled | Accepted frames | 7879 | 8473 | 6922 |
| Normal speech, unlabelled | Accepted frames | 7180 | 7670 | 6434 |
| Noise-only negatives | Accepted frames | 617 | 324 | 207 |

At 16 ms reference offset the 10 dB gross counts are 38/36/11; at 32 ms, 46/37/13. This prevents interpreting the zero-offset 36→49 as a proven accuracy regression. Conversely, missing labels and timing uncertainty prevent treating filtering as universally better. The F02-sa1-noise10 case deserves candidate-level inspection (zero-offset gross 0→19). References cover only F0 up to 284 Hz: they do not validate real high speech.

Known-signal tests passed for silence, 60/1000 Hz tones, 200 Hz harmonic signals and 128-sample versus 100 ms packet equivalence. A supplementary local harmonic-stack experiment preserved 200/350/450/600/800 Hz with every mode. Synthetic signals cannot establish high-voice retention. No phone measurements were made. Desktop timings were collected with other work running and must not be used to rank runtime performance.

## Decision

Filtered matched is the leading detector candidate: sharply fewer extreme estimates and better reference-voiced coverage without the broad speech loss of the stronger decision defaults. Do not adopt the entire filtered-default threshold bundle. Keep this as an experiment until inspecting residual errors and real high speech. Do not tune further to the evaluation speakers; acquire a fresh validation set for any new thresholds.

Next: expose several Praat candidates and their strengths, inspect the private failures and F02-sa1-noise10, then compare bounded-lookahead candidate tracking with an explicit unvoiced alternative. This can choose a supported lower candidate instead of fabricating a halved pitch or keeping the previous value. Check startup/pauses/register changes, immutable committed output, total latency and CPU on phones. Drawing should break around rejected transitions; axis clipping alone is not a detector fix.

Primary background: Praat's "how to choose a pitch analysis method" and filtered-autocorrelation manual; Mauch & Dixon (2014), pYIN; torchcrepe maintainer documentation on decoding, hysteresis and silence handling. These motivate the experiment but do not validate our live implementation.
