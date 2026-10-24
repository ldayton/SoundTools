# Causal recurrent-state reset trial — rejected

Local research only; no app changes. The optional neural gate remains experimental and off by default. This tests one fixed rule, not a threshold sweep.

## Frozen rule

At the fixed 16 kHz / 512-sample model grid, before the next inference, reset only the 256-element recurrent state after 32 consecutive earlier scores below 0.2 (1.024 seconds). Clear the counter after resetting; a score of 0.2 or higher breaks the quiet run. Keep the 64-sample acoustic context, resampler, frame grid and audio unchanged. Decisions have no access to reference labels or target onset boundaries. Both control and candidate use threshold 0.2 and the existing 100 ms evidence history. No additional lookahead.

Run through real NeuralClient warm-up/re-enable and actual PitchContour output. Each candidate has its own recurrent state. The two model calls share a loaded session; this is a quality experiment, **not** a representative phone performance benchmark. Unexpected inference fallback aborts a run.

## Results

158 public regression sequences: 64 AVID, 31 previously reserved AVID, 43 moderate-noise/control clips, 20 context sequences. Each tested ready, delayed-ready and re-enable. Inputs and references are hash pinned; unknown EGG frames remain excluded. Previously reserved speakers have already been examined and are no longer held out. No private recordings were used.

Ready-state actual contour results, relative to existing WebRTC product baseline:

| Condition | Continuous 0.2 correct-pitch recall loss | Reset 0.2 loss |
|---|---:|---:|
| Speech after 10 seconds noise | 15.21 pp | 4.99 pp |
| Speech after preceding speech | 0 pp | 0 pp |
| AVID quiet/normal/loud/very loud | 0 pp | 0 pp |
| Previously reserved quiet/normal | 0 pp | 0 pp |
| Speech with 20 / 10 dB noise | 0 pp | 0 pp |

Noise-before loss is 4.99 pp for ready and delayed, 4.24 pp for re-enable. Limit: 1 pp. The reset still rejects 40 correct anchors of 802 voiced reference anchors: sp5 soft 14, sp5 normal 5, sp13 soft 12, sp13 normal 9. These are reference-clock 10 ms scoring anchors, not independent speech events. All four are AVID speech after noise; the other six context target utterances lose no correct anchors.

False-pitch reduction with reset: 38.81% at 20 dB, 42.46% at 10 dB, 92.73% for noise-only. No newly wrong contour admissions relative to baseline in the scored references. This does not prove correctness on excluded/unknown EGG frames.

The continuous control reproduces the earlier 0.2 results exactly in every clip/scenario, at both gate and contour stages. The report independently reconstructs scores from emitted observations and verifies source, model, input and reference hashes and aggregate counts. Six acceptance checks fail: noise-before at both stages in three activation scenarios. No clean PTDB rerun: the required context check already fails, so further evaluation cannot qualify this candidate.

## Decision

Do not integrate this reset or lower the experimental gate's production threshold. Recurrent history explains part of the problem, but this causal reset does not solve it. Preserve the existing default detector and stop tuning this candidate on the same clips. Any future replacement needs independent continuous nearby-microphone speech validation and real-phone latency testing; neither is established here.

## Reproduce

Run `npm run test:pitch-benchmark` for deterministic reset-policy and stream invariants. For each of the manifests below, run `node tests/pitch-benchmark/gate-reset.cjs MANIFEST OUTPUT`:

- `outputs/pitch-benchmark/avid/scoring-manifest.json` → `outputs/pitch-benchmark/gate-reset/avid`
- `outputs/pitch-benchmark/avid-holdout/scoring-manifest.json` → `outputs/pitch-benchmark/gate-reset/holdout`
- `outputs/pitch-benchmark/moderate-noise/manifest.json` → `outputs/pitch-benchmark/gate-reset/noise`
- `outputs/pitch-benchmark/gate-cycle/context-inputs-v2/manifest.json` → `outputs/pitch-benchmark/gate-reset/context`

Then `node tests/pitch-benchmark/gate-reset-report.cjs`. Expected: no passing candidate, six failed checks, zero newly wrong admissions. Ignored report: `outputs/pitch-benchmark/gate-reset/report.html`; complete counts and per-clip evidence: `decision.json` alongside it.
