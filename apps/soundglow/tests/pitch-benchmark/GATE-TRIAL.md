# Bounded follow-up cycle (2026-10-21, rejected research archive)

This trial did not change app analysis. The experimental gate stays at its existing configuration and remains off by default. Trial scripts are archived here; generated inputs and outputs remain local and ignored. The source hashes describe the code at trial time, before subsequent pitch-display changes.

The two fixed follow-up candidates are in `gate-cycle.json`: fixed0.2 with the existing100ms evidence history, and0.3/0.15 hysteresis with96ms of low-score evidence before exit and no additional100ms history. No threshold sweep was performed.

Diagnosis: the previous18 correctly pitched EGG anchors lost at0.3 occur at0.10–0.25seconds in `sp5_s1_sen1_soft` and `sp13_s1_sen1_soft`. Scores remain below0.3 during these onsets.0.2 recovers them all; hysteresis cannot help before its entry threshold is reached.

The follow-up covers400PTDB originals,64existing AVID excerpts,40moderate-noise variants plus3noise-only controls,31scoreable excerpts from8previously unused AVID speakers, and20fixed context sequences. One of32requested fresh excerpts failed the unchanged0.4locator-correlation floor and is explicitly unscored; no replacement was selected. EGG anchors remain partial ground truth. Context sequences concatenate pinned public speech/noise, with joins excluded and original PTDB transition masks preserved; they are not natural phone recordings.

Fixed0.2 results after the actual PitchContour stage (early-ready scenario):

| Condition | Correct voiced recall loss | False pitched noise reduction |
|---|---:|---:|
| Existing AVID soft/normal/loud/veryloud |0pp|Not identifiable from partial EGG anchors|
| Fresh speakers, soft/normal |0pp|Not identifiable from partial EGG anchors|
| PTDB evaluation |0pp|1.45%|
|20dB controlled noise|0pp|38.81%|
|10dB controlled noise|0pp|42.24%|
|Noise-only controls|Not applicable|92.73%|
|Speech after10s noise|15.21pp|90.70%|
|Speech after prior normal utterance|0pp|81.95%|

The lower threshold passes the original primary limits but fails the same1pp preservation limit on the new noise-before context test in all three activation scenarios. Hysteresis fails the original quiet-onset criterion as well. Neither candidate is eligible for enabling. Comparing the production contour against candidate contours found no newly admitted wrong-pitch reference frames in these tested cases.

A separate diagnostic (`gate-cycle-state-probe.cjs`) feeds identical model input and64sample context on the same frame grid to two branches. The alternate branch clears only recurrent state at the known source speech boundary. Speech-positive frame counts at0.2 change9→34,0→31,23→37,and14→41 across the four affected AVID context sequences. The script checks that inference does not mutate the shared input. This establishes sensitivity to recurrent history for these cases. The boundary reset is an oracle control, not a causal candidate or pass result; a safe automatic state policy remains unproven.

Reproduction:

- Run `gate-cycle.cjs MANIFEST OUTPUT_DIRECTORY` for each corpus. It records gate decisions, actual PitchContour output, actual preset plotted points, per-frame model evidence, loading/activation epochs, and input/source/model hashes.
- `gate-cycle-context.cjs` generates the20fixed context sequences from pinned public inputs.
- `gate-cycle-state-probe.cjs` runs the non-deployable state-only diagnostic.
- `gate-cycle-report.cjs` independently reconstructs gate and contour scores from saved observations, rechecks all hashes/coverage/aggregate counts, and writes `outputs/pitch-benchmark/gate-cycle/report.html` plus `decision.json`. It deliberately reports no passing candidate.
- `npm run test:pitch-benchmark` includes fixed-candidate threshold/hysteresis regressions. Existing EGG reference synthetic tests also pass.
- Corpus preparation supports `AVID_OUTPUT`, `AVID_SPEAKERS`, and `AVID_INTENSITIES`; the new speaker reservation is recorded before scoring. `AVID_ALLOW_UNMATCHED=1` records and excludes failed locator matches without changing the quality floor. The default remains strict failure.

No physical-phone validation or high-register preservation claim is made. Private recordings were neither acquired nor committed in this cycle.

---

# Speech-confirmation trial: not enabled by default

The corrected matched streaming evaluation fails the fixed quiet-speech limit: early-ready model loses approximately 2.98 percentage points of correct soft-speech tracking. The earlier padded evaluation below is historical and does not justify default activation. Threshold and acceptance limits remain unchanged.

Production retains the existing filter. Add `?experimentalSpeechGate=1` to explicitly try the neural gate; this is a temporary developer experiment, not a preset setting. Missing/failed optional assets still fall back to the existing filter.

## Corrected reproduction

Run `node tests/pitch-benchmark/live-gate-trial.cjs MANIFEST OUTPUT` for each frozen corpus, producing `live-noise.json`, `live-avid.json`, and `live-ptdb.json` under the trial output directory. Then run `node tests/pitch-benchmark/check-gate-trial.cjs`. A nonzero exit for the quiet-speech acceptance failure is expected. The runner uses unpadded PCM, the shipped pitch stream, WebRTC adapter, neural client, model adapter and evidence epochs. It tests early readiness, delayed readiness, and off/re-enable. The model is preloaded for throughput; readiness is injected at fixed packet boundaries. This validates deterministic state/clock transitions, not actual network or phone latency. The browser tests cover real nested-worker loading/failure.

The checker verifies current contract, source and model pins, corpus/input/reference hashes, complete scenario coverage, and recomputed aggregate counts. Regression tests exercise stale/mismatched evidence rejection without needing corpus downloads in CI.

## Historical padded trial (superseded)

# Local speech-confirmation trial

The shipped pitch detector and drawing are unchanged. Soundglow speech filtering now requires the existing WebRTC decision AND optional Silero evidence. Praat filtering remains off. Loading/failure falls back to the existing gate; model loading runs separately from pitch processing.

The fixed threshold and primary acceptance limits are in `gate-trial.json`. Run the browser evaluator over the frozen manifests, then `node tests/pitch-benchmark/check-gate-trial.cjs` to write the local decision artifact. Input audio and generated results remain ignored. No private recordings are packaged.

## Shipped implementation results

| Condition | False pitch reduction | Correct voiced recall loss |
|---|---:|---:|
| Controlled noise, 20 dB | 43.6% | 0.047 percentage points |
| Controlled noise, 10 dB | 47.3% | 0 |
| Three noise-only controls | 100% (0.59 s to zero) | Not applicable |
| Soft speech EGG anchors | Unknown unvoiced truth | 0.828 percentage points |
| Normal speech EGG anchors | Unknown unvoiced truth | 0 |
| Clean PTDB evaluation | 1.6% | 0 |

All fixed primary limits pass. Secondary very-loud speech loses 1.62 percentage points; this is a remaining limitation, not hidden in the primary aggregate. AVID anchors cover only confident EGG regions, not complete voicing truth. Noise derivatives share source speakers. High-register speech and physical phones still need validation.

Initial browser scoring treated each model decision as a point. The model classifies a full 32 ms interval; using interval overlap corrects the timing interpretation and changes soft loss from 1.159 to 0.828 percentage points. Threshold and acceptance limits were not changed. Previous outputs are preserved.

There is no additional audio buffering or lookahead. Inference still adds execution time (roughly 1–3 ms per packet on the tested M2 Ultra); this is not a phone latency claim. An 80 ms inference deadline falls back to the old gate. The optional model/runtime totals about 14.6 MB, loads lazily from content-addressed local assets, and is excluded from mandatory service-worker precaching. MIT notices and pinned hashes are included.

Validation includes independent resampling references across ten rates, packet invariance, model state/timestamps, causal evidence/activation epochs, disabled/download/inference failure, and desktop/mobile-viewport browser tests with real model execution.
