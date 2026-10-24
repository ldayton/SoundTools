# Candidate inspection and fixed-lag tracker experiment

2026-10-20. Research only; the app, production WASM, presets and settings are unchanged. No commit or push. The motivating user audio and every derivative remain in ignored outputs/pitch-comparison/private-reproduction and are not harness inputs or tracked fixtures.

## Reproduce

Use the pinned Emscripten toolchain and cached Praat objects documented by build-filtered.py:

```
python3 tests/pitch-comparison/build-candidates.py /path/to/praat-wasm
node tests/pitch-comparison/candidate-engine.test.cjs
node tests/pitch-comparison/candidate-tracker.test.cjs
node tests/pitch-comparison/compare-candidate-tracker.cjs
node tests/pitch-comparison/report-candidate-tracker.cjs
```

The prepared 72-case practice corpus is required for the last two commands. Results: outputs/pitch-comparison/candidate-stream/tracker-results.json, tracker-summary.json, tracker-report.html. Source PCM and pitch reference hashes are checked. The exporter returns all candidates for each existing feature observation, their strengths, and frame-relative intensity. Candidate 1 remains Praat's chosen path. Praat can increase its nominal 15-candidate limit to 24 at a 50–1200 Hz range. The export explicitly bounds at 32 and errors on overflow; it does not truncate. Candidate frequencies can exceed the configured search ceiling internally; the research tracker excludes those from voiced choices.

For every recording, compare the exporting build with the unchanged filtered research build. Assert identical request PCM/context hashes and exact feature output after removing candidate metadata. This makes candidate inspection non-invasive. Both builds retain the existing 100 ms streaming analysis requests.

## Frozen comparison

All variants use filtered autocorrelation, its existing raw-method path parameters, the same speech flags, candidate acceptance strength .45, and the same committed observation times (50 ms lookahead, no end-of-file flush). The baseline is filtered autocorrelation plus our existing confirmation filter. Thus "filtered" includes the existing downstream filtering; it is not an unprocessed offline pitch track.

Two research alternatives replace that confirmation filter:

- `path`: a fixed-lag candidate decoder, using pitch strengths with Praat-style local unvoiced/silence scores, .01 octave cost, .35 inter-frame octave-jump cost and .14 voiced/unvoiced switching cost.
- `speechPrior`: the same decoder with an additional .3 × max(0, log2(F0 / 400)) penalty. This was a deliberately simple experimental prior, frozen before the corpus run, not a scientifically calibrated boundary or a hard ceiling.

Each step re-solves the bounded pending sequence anchored to the last committed decision. Only the oldest decision is emitted. Every nonzero output is a real candidate at that timestamp; it never fabricates an octave correction or carries forward an old frequency. Speech-gated frames allow only unvoiced. The fixed-lag anchor can get stuck on the wrong octave: this experiment tests that risk rather than assuming smoother means correct.

## Inspection of the private failure

At approximately 6.95 s raw AC chooses 905 Hz (strength .695) while alternatives include 235–272 Hz (about .59–.61). Filtering selects 266 Hz (.714). At 7.10 s the filtered list offers only unvoiced and 143 Hz (.287), so filling the missing contour would be unsupported.

At 9.55 s raw AC selects 917 Hz (.913); alternatives include 471/488 Hz (.854) and 313 Hz (.789), with no strong candidate near the preceding ~120 Hz. Filtered AC has only the unvoiced candidate there. The correct response cannot be inferred by simply halving the chosen frequency.

At 9.68 s filtered AC selects 528 Hz (.565); the available 242 Hz candidate is weaker (.423), below our common acceptance threshold. The existing confirmation filter rejects this short rise. The plain decoder accepts it, and the speech-prior decoder rejects it. Over the entire private recording, committed above-500 frame counts are baseline 0, path 1, speechPrior 0. Candidate inspection does not supply ground truth for the remaining lower estimates.

## Corpus findings

Stable-reference counts below are at reference offset zero. Reference origin is uncertain; the report also contains fixed 16 and 32 ms offsets and excludes ±30 ms voicing transitions.

| Condition / metric | Filtered baseline | Candidate path | Path + high penalty |
|---|---:|---:|---:|
| Reference originals: gross pitch error (>20%) | 23 | 40 | 40 |
| Reference originals: missing voiced frames | 7 | 7 | 7 |
| Held-out reference originals: gross errors | 16 | 32 | 32 |
| 20 dB noise: gross errors | 23 | 41 | 41 |
| 20 dB noise: missing voiced frames | 6 | 10 | 10 |
| 10 dB noise: gross errors | 49 | 62 | 62 |
| 10 dB noise: missing voiced frames | 25 | 29 | 29 |
| Noise-only negatives: false accepted frames | 324 | 327 | 244 |
| Soft speech: accepted, unlabelled | 8473 | 8603 | 8469 |
| Normal speech: accepted, unlabelled | 7670 | 7776 | 7666 |

The worse reference accuracy survives the timing-sensitivity checks. For original reference clips at 16 ms offset, gross counts are 16/33/33; at 32 ms, 19/35/35. Stronger high-frequency penalties do not fix errors at low frequencies. Unlabelled retention counts are not accuracy measurements.

The clearest failure is F03-sa1 at 5.15–5.30 s: reference ~200–213 Hz, filtered baseline ~201–217 Hz, both new decoders ~100–108 Hz. Both octave candidates have very strong periodicity. The committed path stays on the subharmonic to avoid a transition, despite the supported correct candidate. This is observed octave locking, not a demonstrated improvement in speech recognition. Do not tune parameters on this held-out case and continue calling it held-out validation.

## Decision

Do not adopt either custom decoder. Filtered autocorrelation with the existing confirmation policy remains the best-supported option tested here. It already contains Praat's candidate path finding; our 50 ms anchored decoder is an additional, shorter-horizon interpretation and can make it worse. These results reject this implementation/configuration, not every possible candidate-aware tracker.

The useful next implementation step is integrating filtered AC without the custom decoder, followed by focused testing of residual ambiguous intervals and drawing gaps. A separate speech/noise gate may still help noise-only errors, but cannot establish which pitch candidate is correct during speech. Any future tracker must demonstrate octave-recovery performance, not only suppress high-frequency counts. Real high-speech reference recordings and physical-phone measurements remain missing; synthetic high tones do not replace them.

Tests cover exporter parity/alignment, packet equivalence, candidate membership, atomic input validation, bounded commitment, immutable emitted output, silence/speech gating, isolated jump rejection and recovery to a sustained real register change. They test implementation behavior; the corpus comparison separately tests quality. No claim of improved device performance is made.
