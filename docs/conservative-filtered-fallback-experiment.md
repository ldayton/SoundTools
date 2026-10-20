# Conservative filtered fallback experiment

Local research, 2026-10-20. The app remains on the corroborated raw trial. This experiment does not modify production processing or settings. All recordings and results remain under ignored outputs/. No commit or push.

## Rule and timing

Only fill an observation if original raw pitch is unvoiced/weak, corroborated raw is also unvoiced/weak, and speech gating permits it. Never fill a strong raw high estimate rejected by corroboration.

The filtered estimate must be 50–500 Hz. Require two consecutive trusted original raw observations on each side: strength at least .6, no more than 100 ms to the left and all right evidence within 50 ms. The anchor frequencies must differ by at most 300 cents. Interpolate their log frequencies only to define an acceptance range, never to generate an output pitch. The accepted output is the actual filtered estimate. Never use fallback estimates as anchors.

Two parameter sets were frozen before testing:

- Guarded: filtered strength at least .55 and within 200 cents of the anchor reference.
- Strict: strength at least .65 and within 100 cents.

The fallback proposals are merged into the already committed corroborated result. They are not fed through another 50 ms confirmation filter: doing that would accidentally double the lookahead. The baseline retains its existing confirmation unchanged, and fallback uses at most the same 50 ms future budget. Prefix-equivalence tests verify that later evidence cannot revise a committed fallback decision.

## Reproduction

```
node tests/pitch-comparison/filtered-fallback.test.cjs
node tests/pitch-comparison/compare-filtered-fallback.cjs [optional-local-private-inputs.json]
node tests/pitch-comparison/report-filtered-fallback.cjs
```

Requires the prepared practice corpus and prior pitch-scoring/results.json. The comparator remeasures raw and filtered through the current production streaming engine with identical requests, checks audio hashes and exact baseline parity, and uses the same VAD/confirmation as the local trial. Observations are retained per clip under outputs/pitch-comparison/filtered-fallback for inspection. No personal filenames or paths are built into the tracked harness.

Seventy-two existing cases plus three private regressions were tested. Reference evaluation excludes ±30 ms around voicing transitions and retains fixed 0/16/32 ms first-centre sensitivity. Quiet is the lowest per-clip quartile of original 20 ms PCM RMS within stable reference voicing; unlabelled clips use previously accepted filtered observations. Previously inspected private anchors are not full truth labels.

## Results

| Set | Guarded additions | Reference-supported correct additions | New wrong voiced additions, offset zero | New false-voice additions, offset zero |
|---|---:|---:|---:|---:|
| Original references, 16 clips | 30 | 8 | 0 | 0 |
| 20 dB synthetic noise, 16 clips | 17 | 5 | 0 | 0 |
| 10 dB synthetic noise, 16 clips | 6 | 2 | 0 | 0 |
| Soft speech, 8 clips | 44 | Unlabelled | Unlabelled | Unlabelled |
| Normal speech, 8 clips | 43 | Unlabelled | Unlabelled | Unlabelled |
| Noise-only, 3 clips | 0 | N/A | N/A | 0 |
| Conversation/interview, 5 clips | 8 | Unlabelled | Unlabelled | Unlabelled |
| Private recordings, 3 | 4 | Unlabelled | Unlabelled | Unlabelled |

The guarded rule recovers 8 of the 31 previously correct observations lost on clean reference speech; 7 of those recoveries are low-level. Missing reference frames fall from 40 to 32, versus 7 for the earlier fully filtered detector. Gross pitch errors and octave-error counts remain unchanged. The strict rule recovers only 3 of the 31 (2 low-level), reducing missing frames to 37.

All 8 clean-reference correct additions remain correct at 16 and 32 ms offsets. However, 1/2 additional false-voiced observations appear at those offsets; these were unscored at offset zero. The 20 dB mix has 2 false-voiced additions at 32 ms; the 10 dB mix has none at tested offsets. There are no observed new voiced pitch/octave errors at any tested offset. Strict has no new clean-reference false voicing at those offsets, but 1 false-voiced addition in the 20 dB mix at 32 ms. Thus do not advertise zero new errors without the timing qualification. Most total additions sit near excluded transitions or lack labels.

The three private outcomes are:

- Kravitz: one guarded addition at 35.34 s, ~74 Hz, between existing ~80 and ~69 Hz raw anchors; strict adds none. This is unlabelled low-register material, not proven correct recovery.
- Baal Shem Tov: neither rule adds anything. Existing supported higher estimates and the rejected 22.5 s excursion remain unchanged.
- Original spike recording: guarded adds three observations around 9.89, 9.90 and 10.12 s (~203–224 Hz); strict adds only 9.90 s. Existing high-spike rejection remains unchanged.

No new above-500 estimate can be introduced by this fallback. That fact alone is not proof of safety: lower octave errors and false voicing were checked separately. Existing valid/raw estimates are never overwritten. Private additions have listening excerpts in the report, but no independent labels proving their correctness.

## Why coverage is small

In sequential rejection accounting over 506 private candidate observations, 143 fail filtered strength, 1 exceeds 500 Hz, 136 lack left anchors, 184 lack right anchors within 50 ms, 27 have excessive anchor movement, and 11 disagree with the anchor range; 4 pass. Counts depend on this order and are not independent rejection frequencies. Soft-speech candidates similarly often lack trusted anchors or fail speech gating. Widening these rules would change the safety/latency tradeoff and requires a separate frozen experiment.

## Decision

A narrowly bracketed fallback can recover some quiet reference speech without observed new octave errors, but benefits are modest and especially small on the user recordings. Keep the fallback experimental/off in the app for now rather than adding another live decision path for four unlabelled private observations. The guarded configuration is the more useful candidate if further trial is desired; strict loses most of the already-small recovery. Do not relax the 50 ms future budget, use filled estimates to teach the baseline, or conceal remaining uncertainty by lengthening drawn gap connections.

Further implementation would also need to account for extra filtered work in blocks where raw is missing, potentially much more often than the current high-only corroboration. Runtime/phone performance was not established by this offline experiment.
