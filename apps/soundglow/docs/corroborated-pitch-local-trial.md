# Corroborated pitch local trial

2026-10-20. Soundglow now selects `corroborated` locally. Raw and filtered options remain available under Advanced trace, and Praat still selects raw. Publication was subsequently authorized after correctness review; the fallback remains disabled.

The worker runs raw analysis first. When the result contains any raw estimate above 500 Hz, it makes a second pitch-only filtered call on identical PCM/context. A high estimate is retained only if filtered pitch is voiced, strength is at least .45, and the frequency difference is at most 100 cents. Otherwise the observation becomes unvoiced. Filtered agreement still requires strength at least .45. A correctness review extended the trigger to weak high raw estimates as well, so lowering display confidence cannot expose unchecked high candidates. This preserves the earlier experiment at the default .45 acceptance threshold.

Raw intensity/formants and spectrogram output are copied before the second WASM call and preserved. No extra lookahead or invented replacement pitches are added. The existing 50 ms confirmation and drawing rules remain unchanged. The processor explicitly selects a method for each request, preventing shared-WASM state leakage. The source archive contains the corresponding worker source; the compiled WASM is unchanged from the filtered integration.

## Validation

- Real-WASM test confirms no filtered pass for ordinary 200 Hz, a pitch-only extra pass for 1000 Hz, retention of supported high pitch, correct metadata ownership and method isolation.
- The integrated worker matches the prior full two-pass accepted output at default confidence for all 72 existing corpus cases and three private regressions. Unvoiced/weak observations are normalized for this comparison because the correctness fix also clears previously unchecked weak high values.
- Interactive English playback confirmed the trial selector, switching to filtered and back, and pause behavior.
- Desktop/mobile preset switching, history rebuilding, rapid cancellation and transport checks are part of the browser suite.

## Quiet-speech audit

```
node tests/pitch-comparison/trial-corroborated.cjs [optional-private-inputs.json]
node tests/pitch-comparison/report-corroborated-trial.cjs
```

The prepared corpus and previous pitch-scoring/results.json are needed for parity. Input PCM/reference hashes are verified. Reports and audio excerpts are generated only under ignored outputs/pitch-comparison/corroborated-trial. Never commit user audio or those artifacts.

Quiet means the lowest RMS quartile of 20 ms original-audio frames per clip, within stable reference voicing where references exist. Without labels, the quartile is taken among baseline accepted observations. This is a relative level measure, not an absolute mic-volume threshold. Stable reference comparisons use the existing ±30 ms transition exclusion at offset zero; reference timing uncertainty remains as documented in the preceding offset-sensitivity experiments.

Against current filtered Soundglow:

| Set | Baseline accepted → missing | Low-level subset | Baseline correct → missing | Low-level correct subset | Longest additional missing run |
|---|---:|---:|---:|---:|---:|
| Clean references, 16 clips | 258 | 241 | 31 | 23 | 50 ms |
| 20 dB noise, 16 clips | 1073 | 1055 | 30 | 22 | 250 ms |
| 10 dB noise, 16 clips | 1315 | 1291 | 34 | 25 | 360 ms |
| Soft speech, 8 clips | 974 | 784 | Unlabelled | Unlabelled | 140 ms |
| Normal speech, 8 clips | 675 | 551 | Unlabelled | Unlabelled | 70 ms |
| Private clips, 3 | 536 | 393 | Unlabelled | Unlabelled | 90 ms |

The longest added runs in Kravitz/Baal/original are 80/80/90 ms. Added missing runs are consecutive observations that were accepted by the old detector and are now unvoiced; they can extend existing gaps and do not measure total gap length. They are not necessarily visible blanks: the existing 200 ms drawing-gap connection can bridge missing observations. Losses in unlabelled audio are not automatically genuine lost speech; removed wrong estimates and newly accepted observations must also be considered.

Of the 31 baseline-correct reference observations newly missing, all 31 were already absent in raw analysis. None was rejected by high-pitch corroboration. For private clips, 520 of 536 losses were already absent in raw; 16 involved high raw estimates rejected by corroboration. For soft speech, 928 of 974 were already missing from raw and 46 involved high estimates. Thus the main quiet-speech limitation is the primary raw detector, not the high-pitch comparison rule. Do not respond by relaxing that rule or merely extending visual gap bridges.

This is a usable local trial with a confirmed quiet-speech tradeoff, not a demonstrated universal improvement. Public reference counts establish some genuine lost coverage; private/soft excerpts are provided for inspection without claiming pitch truth. Next evidence should be real quiet, breathy and high voice recordings before introducing fallback policies. Phone measurements remain outstanding.

Final validation: full build passed, including core checks, 106 browser tests (5 configured skips), slowed-browser continuity, real AudioWorklet/worker example playback, looping fake-microphone capture, update/offline/cache checks and immutable release packaging. Mobile testing was viewport/DPR simulation, not a physical phone. Those validation runs made no commits or pushes.

Correctness review before publication: weak high raw estimates are corroborated regardless of display-confidence settings; a regression test covers the previous bypass. The conservative filtered fallback remains research-only and is not imported or packaged by the app.

Publication review passed core, desktop/mobile detector switching, update/cache checks and default accepted-output parity on all 75 corpus/private cases. User audio and generated artifacts are excluded from the commit.
