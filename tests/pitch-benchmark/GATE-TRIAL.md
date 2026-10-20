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
