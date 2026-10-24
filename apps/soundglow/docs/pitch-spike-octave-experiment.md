# Preserving spike rejection without new octave drops

Local research, 2026-10-20. No app, engine package, preset or production settings changes. No commits or pushes. All recordings, PCM, private input lists, plots and results remain under ignored outputs/. The two new user recordings and the original spike regression are passed as an optional local input list; no personal file paths or audio are required by tracked scripts.

## Frozen approaches

All variants use the same production PraatStream geometry and audio requests, the same speech decisions, .45 acceptance threshold and 50 ms confirmation. Methods were chosen before reviewing the new corpus results:

1. Previous raw autocorrelation (control).
2. Current filtered autocorrelation: octave cost .01, top 1200 Hz.
3. Filtered with octave cost .055 only. Other thresholds remain identical.
4. Filtered with cost .055 and top 800 Hz. This is a distinct range change, not merely a different confidence threshold.
5. Raw pitch with filtered corroboration: preserve the raw frequency; above 500 Hz, require filtered pitch within 100 cents and strength at least .45, otherwise emit unvoiced. Never replace pitch by halving/doubling, interpolate, or fill raw-unvoiced frames from filtered estimates. The 500 Hz boundary is an experimental policy, not a universal speech ceiling; genuine higher pitch can pass if corroborated. The two detectors are related and their errors are not statistically independent.

## Reproduce

Prepare the pinned practice corpus. Activate the pinned toolchain, then:

```
python3 tests/pitch-comparison/build-pitch-scoring.py /path/to/current/praat-checkout
node tests/pitch-comparison/pitch-scoring.test.cjs
node tests/pitch-comparison/pitch-corroboration.test.cjs
node tests/pitch-comparison/compare-pitch-scoring.cjs [optional-local-input-list.json]
node tests/pitch-comparison/report-pitch-scoring.cjs
node tests/pitch-comparison/summarize-pitch-octaves.cjs
```

Build from the checkout matching the currently packaged source (the local voice-capabilities checkout), not the older raw research checkout. The builder changes a copied bridge and never edits that checkout. Asset hashes, PCM hashes and reference hashes are checked. Research mode zero exactly reproduces current production output for every recording. Configuration/source fingerprints are captured and unchanged source checks guard publication. All output methods have equal timestamps and committed intervals. Small-packet versus 100 ms packet results match exactly on known-signal tests.

Results: outputs/pitch-comparison/pitch-scoring/report.html, results.json, summary.json and octave-scores.json. This run included 72 existing cases and 3 private regressions. Scoring is on stable reference voicing excluding ±30 ms boundaries; first-centre timing is uncertain, so retain 0/16/32 ms sensitivity. Noisy copies are controlled mixes, not actual phone noise. Soft/normal and conversation samples lack pitch truth. Reused evaluation speakers are not a new independent validation set.

## Private regression outcome

Thirty-one acoustically supported higher-pitch inspection anchors in Baal Shem Tov were frozen from the preceding waveform/spectrum audit; two ambiguous low-register stretches were excluded. These anchors are not exhaustive ground-truth labels and were selected to investigate known octave disagreements.

| Variant | Matches the 31 anchors | Remaining Baal excursion | Above-500 frames: Kravitz / Baal / original |
|---|---:|---|---|
| Raw | 31 | ~208–213 Hz | 31 / 1 / 36 |
| Current filtered | 0 | ~651–729 Hz | 0 / 6 / 0 |
| Cost .055 only | 20 | ~651–729 Hz | 0 / 16 / 0 |
| Cost .055, top 800 | 10 | Gap | 0 / 0 / 0 |
| Raw + corroboration | 31 | ~208–213 Hz | 0 / 0 / 0 |

Thus the scoring/range changes do not solve both private failures. Cost .055 also sharply reduces unlabelled acceptance in Kravitz (2127 current filtered versus 1372), which cannot be interpreted as demonstrated speech loss without labels but is a serious retention concern. Corroboration accepts 1977.

## Existing-corpus tradeoffs

Counts below use zero reference offset. "Gross" means >20% pitch deviation on accepted, reference-voiced observations. Missed and wrong accepted estimates are different failure types; don't count either as correct merely because a line exists.

| Condition / metric | Current filtered | Cost .055 | Cost .055/top 800 | Corroborated raw |
|---|---:|---:|---:|---:|
| Original references: missed voiced | 7 | 33 | 12 | 40 |
| Original references: gross pitch errors | 23 | 12 | 12 | 24 |
| Original references: false voiced | 140 | 81 | 104 | 84 |
| 20 dB noise: missed voiced | 6 | 35 | 14 | 38 |
| 20 dB noise: gross errors | 23 | 9 | 9 | 23 |
| 20 dB noise: false voiced | 512 | 359 | 225 | 190 |
| 10 dB noise: missed voiced | 25 | 76 | 49 | 52 |
| 10 dB noise: gross errors | 49 | 17 | 29 | 27 |
| 10 dB noise: false voiced | 660 | 507 | 291 | 210 |
| Noise-only false accepted frames | 324 | 240 | 97 | 55 |
| Soft speech accepted, unlabelled | 8473 | 7663 | 7968 | 7554 |
| Normal speech accepted, unlabelled | 7670 | 6996 | 7288 | 7022 |

At 16 ms offset, original-reference missed/gross counts are 7/16 for filtered and 38/23 for corroborated raw; at 32 ms, 8/19 and 42/24. For the strongest noise at 16 ms, gross errors improve 36→23 but missing observations increase 34→60; at 32 ms, gross improves 37→24 and missing increases 41→74. The basic tradeoff survives timing sensitivity. Corroboration does not magically fix the pre-existing raw detector's lower-range errors: on original references it retains 17 near-half-frequency errors versus 17 for current filtered. It specifically avoids the new private octave drops while reducing high errors.

## Engineering checks and recommendation

The top-800 variant rejects a genuine synthetic 1000 Hz tone. The .055-only variant and current filtered preserve that tone, and real-WASM raw/filtered corroboration also preserves it. This confirms corroboration isn't a hard 500 Hz cap; it does not prove high human voice coverage.

An additional private-only experiment runs raw analysis first and invokes filtered analysis only for request blocks with strong raw estimates above 500 Hz. Its emitted rows exactly match full two-pass corroboration on all three private clips. Additional filtered passes were needed for 5.8% of Kravitz requests, 4.2% of Baal requests and 11% of the original recording. This is an optimization opportunity, not a phone-performance result; noise can trigger much more work. It would need corpus-wide parity and device measurements before integration.

Corroborated raw is the strongest next local trial for this product goal: it keeps the supported private speaking contours, rejects the reproduced high spikes, and has the lowest noise-only false detections. However, current filtered retains more reference-voiced frames. Do not claim universal superiority or ship the hybrid from this experiment alone. A later local trial should inspect which additional raw gaps matter in normal/soft speech, preserve genuine high speech, and compare conditional versus full corroboration under real-time load. No additional candidate tracker is warranted by these results.
