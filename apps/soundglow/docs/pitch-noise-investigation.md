# Pitch rejection investigation — 2026-10-19

Local research only. No application settings, detector, presets, or dependencies changed.

## Reference application evidence

The initial launch/input failures were resolved in the subsequent live investigation below. Voice Tools 2.0.186 is now running locally and all 149 original recordings have been tested through its actual live pitch view. The initial offline candidate results remain below as a separate experiment; they are not Voice Tools measurements.

The retained local inspection of its installed assembly establishes, in `AudioAnalyserService.ProcessChunk_Pitch.MoveNext`:

- Return without analysing when `VAD_TimeSinceLastVoicedData > 2.0` seconds.
- Remove DC before pitch analysis.
- Call `Analyse_Pitch_YINLinear.Calculate` with 60 Hz floor, 900 Hz ceiling and threshold 0.15, conditional on normalized zero-crossing rate below 0.2 (except the app's internally generated tone override).
- A separate VAD callback updates the last-voiced timestamp from its Boolean speech decision. VAD is enabled by default in `AudioAnalyserConfig`.

Local evidence: `/tmp/voice-tools-all-il.txt`, method RVAs 143128 and 144060. These are retained inspection artifacts, not a fresh end-to-end measurement. Installed `DevExtras.Common.Audio.dll` SHA-256: `fe3a1c4e087f0d68e99b97e121b1d97681afcfc631adcdaabdde933634d875a9`. No proprietary assemblies or recovered code are copied into the repo. Library strings include WebRTC and Speex processors, but strings alone do not establish which detector/configuration supplies this gate.

This does not prove why a particular whistle is ignored: frequency limits, speech classification, preprocessing, and YIN rejection must be separated experimentally.

## Actual Voice Tools live measurements (follow-up)

### Verified setup

Opening the outer app with Launch Services starts a wrapped, translocated bundle. Bind the running wrapped path discovered from the process/window rather than attempting to launch its iPhoneOS executable directly. Source app remains signed and unmodified.

The earlier Teams loopback route was invalid for this purpose: `DeviceCanBeDefaultDevice` is zero for its input, and setting it as default returned success while reading back the physical Yeti input. Aggregate attempts also did not become selectable inputs. Nonzero audio on a directly addressed driver therefore did not prove that Voice Tools received it.

Installed BlackHole 2ch 0.7.1 through Homebrew's official cask. Reloaded the audio service; no reboot or security setting changes were needed. Verified BlackHole became the default input by reading it back. The native Voice Tools pitch view then drew the Alice Waters recording: a successful end-to-end positive control. Voice Tools uses its own unchanged preprocessing and detector. The source recordings are not normalized or amplified. Both BlackHole output channels receive identical mono 48 kHz PCM, with frame position advanced once per callback; there is no stereo sample-skipping. The feeder uses atomic frame-position counters. Speaker output remained the LG device. Original Yeti Nano input and LG output were verified restored after completion. BlackHole remains installed for subsequent local testing.

### Protocol and capture integrity

- All 149 baseline recordings played at normal speed in a fixed shuffled order (seed 192026).
- Three seconds of digital silence precede each initial trial, exceeding the inspected two-second VAD inactivity condition.
- Eleven extra English speech controls are interspersed through the main pass.
- Screenshots are captured through the native UI tools at clip end + approximately 200 ms, with actual feeder timestamps saved. Captures more than one second late are excluded and repeated. All original trials have a valid capture or replacement; 22 main-pass timing failures and five repeat-pass timing failures were repaired.
- Additional speech-adjacent noise trials and three paired vacuum repetitions bring the total to **214 screenshot captures**, with **27 on-time positive controls; all 27 showed pitch**.
- Local artifacts: `schedule.json`, `native-captures.json`, `native-followup.json`, `native-final.json`, `native-context.json`, screenshot directories, `native-combined.json`, `native-summary.json`. Run `combine-results.py` after the screenshot scoring scripts to reproduce the final counts.

The image scorer detects saturated red line/blue marker pixels in the chart's final clip-duration region, excluding labels, margins and the previous clip. A minimum three matching pixels counts as a visible trace, including a lone measurement dot. This is clip-level visible output, not measured speech recall, pitch accuracy, or sample-by-sample native detector output. Display/capture latency is not independently calibrated; edge observations can be missed. Representative speech, blank environmental, isolated-marker and dog-bark captures were visually inspected. The 100 speech clips are short excerpts from two sessions; they are not 100 independent speakers/environments.

### Results

| Input group | Clips with visible dots/curves | Total clips |
|---|---:|---:|
| Distant conversational speech | 59 | 100 |
| Environmental/non-voice categories, including dogs | 8 | 38 |
| Coughing, sneezing, breathing, laughter, baby crying | 7 | 10 |
| Existing cleaner English speech excerpt | 1 | 1 |
| Added positive speech controls | 27 | 27 |

Environmental traces occurred in both car-horn clips, both dog clips, both wood-knocking clips, one train clip and one typing clip. Some are only isolated dots. Neither clip in each of the other environmental categories had detected trace pixels. Rain, waves, appliances, alarms, sirens, wind and bird/insect recordings were among the blank results in this small sample.

For orientation only: the separate Soundglow offline baseline had eligible raw pitch observations in 25/38 environmental clips and 86/100 distant-speech clips. These are **different endpoints** (eligible raw observations versus captured native drawing), so do not use the difference as a detector accuracy or recall comparison.

One vacuum trial showed dots immediately after speech although its isolated trial was blank. Three additional paired trials with exactly the same clip/level showed **0/3 traces after silence and 0/3 immediately after speech**; all six intervening speech controls passed. The first outcome is an outlier and is not evidence for a reproducible history effect. Other one-off speech-adjacent tests: wind/rain remained blank; knocking and horn showed output. The code's two-second condition is real, but its isolated contribution has not been measured, and it is not a complete explanation of rejection.

### What this establishes

Voice Tools is substantially selective on these actual inputs; broad environmental sounds often produce no trace, while some non-speech periodic/transient sounds still produce measurements. Distant speech is also frequently blank. This does not establish that 41% of speech is wrongly rejected: pauses, unvoiced speech, input level, pitch range and detector failures are not independently annotated.

Keep Soundglow unchanged. Before choosing a gate, annotate voiced intervals/reference pitch on selected files, include quiet/breathy/creaky/high-pitch speech and humming, and add real whistles/music. Compare like-for-like native and Soundglow rendered output, with calibrated latency and repeated level/context trials. Do not equate the rejected fraction with voice-classification accuracy, or attribute all rejection to VAD alone.

## Corpus actually processed

149 recordings, 648 seconds, 63,310 analysis frames:

- 100 four-second far-field conversational excerpts from CHiME-6 sessions S02/S09, obtained from https://zenodo.org/records/21892821 . Third-party segmentation described as single active speaker; these are not 100 independent rooms/speakers. Original corpus/license: https://www.openslr.org/150/ (CC BY-SA 4.0).
- 48 five-second ESC-50 recordings, two per category: rain, waves, fire, crickets, birds, wind, pouring water, toilet flushing, vacuum, washing machine, engine, train, airplane, car horn, siren, alarm clock, typing, knocking, coughing, sneezing, breathing, laughing, baby crying and dog. Source: https://github.com/karolpiczak/ESC-50 . Research copy under ESC-50's CC BY-NC 3.0 terms; no audio shipped in the application.
- Eight seconds of the existing Alice Waters English interview as a cleaner speech control.

Files, provenance, checksums, per-frame data and local harnesses: `outputs/voice-gating/` (ignored by Git). `inputs.json` hashes each actual input. `manifest.json` records ESC source URLs; `chime6/source.json` records the speech archive. No synthetic mixtures are presented as real noisy recordings. Real whistle sources were located on Wikimedia Commons, but downloading them failed with HTTP 403; **whistles are not included in the results**. Music remains untested.

## Method

Original-level PCM -> FFmpeg mono 24 kHz -> actual Soundglow Praat WASM processor and PraatStream. Fixed analysis settings: pitch floor 50 Hz, ceiling 1200 Hz, flags 6, 25 ms spectrogram window, 5 ms requested analysis step, 100 ms streaming pushes. Actual feature timestamps are retained; this run produced approximately 10 ms pitch frames. Every recording starts a fresh stream. No browser/OS microphone processing is included.

Baseline eligible raw pitch frames have pitch 50–500 Hz and strength >=0.45. This measures raw observations eligible for the default chart; it does not measure rendered bucket/pixel coverage, correctness against reference F0, or final path bridging.

Candidate experiment: WebRTC VAD (`webrtcvad-wheels`, version in `vad-comparison.json`) on separately resampled original-level mono 16 kHz signed 16-bit PCM, 20 ms frames, modes 0–3, fresh state per clip with two seconds of silence warmup. Tested no added hold, 200 ms hold and 2 second hold; only completed VAD frames ending at or before each pitch timestamp can authorize that observation. VAD has its own internal hangover even with zero added hold. This is an offline candidate test, **not an emulation of Voice Tools' complete preprocessing/detector**. See https://github.com/wiseman/py-webrtcvad for frame/rate/mode requirements.

Repeated rain, car-horn and one far-field speech measurement in a fresh processor run: all per-frame values/timestamps were exactly identical (`repeat.json`). This verifies reproducibility of those three inputs, not coverage of physical microphones.

## Findings

The non-voice category excludes coughing, sneezing, breathing, laughter and crying. It contains 38 clips with 707 baseline eligible observations. Far-field speech contains 100 clips with 12,653 baseline eligible observations.

| Candidate | Non-voice baseline observations retained | Far-field speech baseline observations retained |
|---|---:|---:|
| Current baseline | 100% | 100% |
| WebRTC mode 1, no added hold | 93.6% | 83.7% |
| WebRTC mode 2, 200 ms hold | 95.0% | 88.3% |
| WebRTC mode 3, no added hold | 85.1% | 51.9% |
| WebRTC mode 3, 200 ms hold | 92.5% | 68.4% |
| WebRTC mode 3, 2 second hold | 99.0% | 92.2% |
| Raise pitch strength to 0.7 | 34.1% | 50.4% |
| Raise pitch strength to 0.9 | 5.7% | 7.4% |

These are duration/frame-weighted descriptive results on this corpus, not independent-trial confidence intervals. Speech retention is not accuracy: some discarded observations may be pitch errors; some retained observations may be incorrect. ESC labels are clip-level categories, not manually verified frame-level absence-of-speech labels.

Baseline eligible-frame coverage by selected sound category: rain/waves/dog 0%; car horn 13.4%; knocking 10.4%; wind 8.4%; vacuum 5.6%; engine 4.7%; distant speech 32.4%. Fourteen of the 100 far-field clips already have zero baseline eligible pitch frames, so additional gating cannot recover those.

## Decision and next experiments

Do not add an aggressive gate based on this evidence. The tested WebRTC gate removes too little non-voice tracing for the amount of existing speech tracing lost. A higher periodicity/confidence threshold is not a substitute for speech classification.

1. Completed: restore live access, establish a positive speech control, and document the exact input route, version and screen output (see follow-up above).
2. Completed initial corpus pass and selected context repetitions. Expand repeated context/level tests after annotation; the first vacuum history difference did not reproduce.
3. Add manually annotated speech/noise intervals and reference F0 for a representative subset, split development/held-out files by original recording/session. Report false displayed segments per noise-minute, voiced-speech recall, octave errors, onset delay and release delay; do not optimize raw coverage alone.
4. Add real whistles, music, background speech/TV, hums and quiet/breathy/creaky/high-pitch speech. Test original levels plus calibrated level variants. A voice-training gate must preserve sustained vowel/humming exercises, not only conversation.
5. Compare a stronger speech classifier with the simple WebRTC and confidence baselines; assess mobile processing cost separately. Keep the spectrogram raw; apply any future voice-only gate to pitch observations, with explicit state/reset/hangover tests.

Reproduce from repository root while research audio remains available:

```sh
node outputs/voice-gating/measure.cjs
/tmp/soundglow-vad-research/bin/python outputs/voice-gating/compare-vad.py
node outputs/voice-gating/repeat.cjs
```

`measure.cjs` resumes existing results; delete/move its baseline output only when deliberately requesting a full recomputation. The research environment is separate from app dependencies. Nothing has been committed or pushed.
