# What the hybrid rejects in the worst noisy-speech clips

Local acoustic investigation, 2026-10-19. No product changes.

## Conclusion

It rejects **both useful voiced speech and likely bad pitch estimates**. The
previous 96.1% retention figure cannot establish that the discarded 3.9% was bad.
In particular, a file that the hybrid blanks completely has corroborated weak
voicing near 130 Hz. The hybrid should not become a default in its current form.

## Evidence collected

Selected the eight far-field files with the lowest hybrid/baseline raw-estimate
retention among files with any accepted estimates. This includes the entirely
blanked file, not only cases with at least 20 estimates. Across these files there
are 170 rejected observations, including many exact repetitions of the same audio.

For each source file, verified its SHA-256 against the harness, then inspected:

- The original waveform, 40 ms spectrogram, 80 ms spectrum and autocorrelation at
  rejected events, without denoising or changing levels.
- Whole-clip Praat raw autocorrelation, raw cross-correlation, filtered AC with
  top 1200 Hz, and filtered AC with top 800 Hz. All use floor 50 Hz / hop 10 ms;
  raw methods use their normal 0.03 silence / 0.45 voicing settings and filtered
  methods their 0.09 / 0.50 settings. Filtered AC attenuation is 0.03 and octave
  cost 0.055, versus 0.01 for raw methods.
- Sample-exact source excerpts for user listening, with original time offsets
  recorded. Findings below are acoustic review, NOT listening/transcription labels.

Reference executable: installed Praat 7.0.02. Its version and executable hash are
recorded in `audit.json`. These reference methods share Praat code, use a whole
four-second clip instead of streaming context, and have different preprocessing
and defaults. Their agreement is corroboration, NOT independent ground truth or
a controlled comparison isolating one parameter. Reference queries use nearest
frames, no interpolation. Comparisons tolerate 5.01 ms in time and 50 cents in pitch.

## Findings

| File prefix | Rejected event | Assessment |
| --- | --- | --- |
| 0011 | 132–134 Hz, including 2.83–2.85 s | **Useful weak voicing likely lost.** All five rejected estimates match both filtered AC settings; raw CC matches three. Harmonic spacing supports roughly 130 Hz. These were the file's only streaming estimates, so the hybrid makes it blank. |
| 0041 | 144–153 Hz near 1.67–1.69 and 3.10–3.12 s; about 270 Hz at 3.53–3.55 s | **Strong evidence of real voiced speech being rejected.** Visible harmonic trajectories and alternative trackers support these pitches. The lost portions include beginnings of longer voiced stretches. |
| 0095 | 217–221 Hz at 0.07–0.09 s and repetitions | **Voiced onset rejected.** Raw CC and filtered AC agree near 220–226 Hz, supported by harmonic spacing. Other 148 Hz events are ambiguous because filtered AC can choose about 300–328 Hz; the entire clip is not uniformly good or bad. |
| 0032 | 345–358 Hz at 0.24–0.27 s and repetitions | **Supported short descending voicing rejected.** Harmonics and the alternative tracks follow the descending trajectory. Later isolated 505–526 Hz events are less certain. |
| 0014 | 1101–1104 Hz bursts, e.g. 0.24–0.27 s | **Likely bad F0 selections removed.** The lower speech-related harmonic structure and filtered AC do not support a 1.1 kHz vocal fundamental. Raw-method agreement can share the high selection and is insufficient by itself. Isolated 467/813 Hz events remain unlabelled. |
| 0085 | 1070–1080 Hz pieces | **Likely high-frequency tracking error.** Filtered AC follows roughly 100–160 Hz with visible low-frequency speech structure. The hybrid removes some short pieces but retains much of the same high track when it lasts longer. |
| 0065 | Brief 87 Hz at 0.36–0.38 s and repetitions | **Unresolved / possible subharmonic.** Raw methods support the low choice; filtered methods disagree and the stronger speech structure is around 180–200 Hz. Do not count rejection as a confirmed benefit. |
| 0071 | Brief 89 Hz events; separate 790–799 Hz event | **Unresolved.** Raw and filtered methods disagree; noise and harmonic/subharmonic ambiguity prevent a defensible per-frame reference pitch. |

Across the eight files, 36 of 170 rejected observations match both raw CC and at
least one filtered AC setting within 50 cents. This is a useful corroboration
count, not an estimate of the number of true false rejections. The other 134 are
NOT thereby wrong. Repeated samples are not independent observations.

## Why the filter loses speech

It measures the length of a run of **already accepted raw detector observations**,
not the actual length of a voiced syllable. The streaming raw detector may expose
only a few observations from a noisy voiced region. Requiring six then removes
those remaining valid glimpses. The periodicity rescue can also fail around
nonstationary or noisy voiced onsets because its fixed 64 ms region includes
surrounding sound. Filtered AC sometimes follows a longer voiced region through
these same short rejected runs, making that distinction visible.

Conversely, a wrong high track can persist for many frames. A minimum-run rule then
protects it, as in 0085. Thus temporal persistence is neither necessary nor
sufficient for correct voice pitch in this corpus.

## Source-corpus limitation discovered

Exact PCM comparison finds repetitions at offsets between 0.25 and 2 seconds in
**78 of the 100 original far-field source files**. All eight audited worst files
have exact repeats. This is measured on the original downloaded WAVs, before
resampling or replay; the harness did not introduce the loops. The search is
bounded, so the remaining 22 are not proven non-repeating.

The clips are noisy speech-derived material but not 400 seconds of distinct
conversation. Existing aggregate retention numbers remain arithmetically correct
for those files; they overstate coverage if read as many independent speech
examples. Do not infer held-out accuracy or confidence intervals from these frame
counts. A new continuous, non-looped corpus is needed before tuning defaults.

## Reproduction and artifacts

```
node tests/pitch-comparison/reference-pitch.test.cjs
python tests/pitch-comparison/inspect-worst.py
python tests/pitch-comparison/focus-worst.py
python tests/pitch-comparison/check-corpus-repeats.py
python tests/pitch-comparison/report-worst.py
```

The Python tools require NumPy, SciPy and Matplotlib. For this investigation they
were installed only in `/tmp/soundglow-vad-research`; project dependencies and the
ordinary build are unchanged. Native reference commands only write to stdout;
no elevated Praat trust flag is needed. The regression tests validate queries on
known 200 Hz plus silence for all four configurations.

Artifacts under `outputs/pitch-comparison/worst-cases/`: source hashes and raw
reference results, whole-clip and detailed evidence panels, untouched-level audio
excerpts, and `report.html`. `worst-case-review.json` holds provisional review
notes and exact excerpt locations, not ground-truth scoring labels. No files are
uploaded or pushed.

## Next step

Do not ship the current hybrid. Compare a filtered-AC detector path using matched
streaming context, then evaluate it on continuous non-looped noisy speech and
explicitly reviewed voiced intervals. Preserve these cases as failure examples:
0011 / 0041 / 0095 / 0032 for lost speech and 0014 / 0085 for false high tracks.
Avoid another threshold chosen only to fix the two clean-control spikes.
