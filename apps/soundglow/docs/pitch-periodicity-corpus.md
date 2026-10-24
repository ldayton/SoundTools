# Periodicity filtering: corpus experiment

Subsequent acoustic audit: the hybrid rejects some supported voiced speech, and 78/100
original noisy-speech files contain exact internal repeats. See
[pitch-worst-cases.md](pitch-worst-cases.md) before interpreting retention as accuracy.

Local research, 2026-10-19. No application behavior or presets changed.

## Method

`tests/pitch-comparison/test-periodicity-corpus.cjs` replays the pinned 12 clips
through the release WASM and production PraatStream. Before applying a filter it
checks every grouped observation against the saved browser replay (PCM hashes,
point counts, timestamps and pitches). It resamples the same PCM to 16 kHz with
FFmpeg and applies the research-only measure in `periodicity.cjs` to accepted
raw estimates, **before** production grouping and drawing policy.

This measure uses a 64 ms centered region, 32 ms fixed comparison length, and
the minimum cumulative-normalized squared difference over integer lags spanning
50–1200 Hz. Lower is more periodic. It is an independent diagnostic, not the
installed Voice Tools detector. The score can find a period different from the
Praat estimate; it tests periodicity, not pitch correctness. It requires 32 ms of
future audio. Unavailable boundary scores are retained and counted; none of the
accepted observations in the pinned subset had unavailable scores.

Five thresholds are evaluated without modifying the data or defaults. There are
no reference voiced/unvoiced or pitch annotations. Counts measure retention of
existing estimates, NOT actual speech recall or pitch accuracy. Source-level
categories cannot label every frame: speech recordings include consonants and
silence. Frame observations are correlated and are not independent trials.

## Pinned subset results

| Threshold | Two clean-speech excursions | Clean speech estimates retained | Far-field speech case 01 retained | Other far-field case 02 retained | Environmental estimates retained |
| --- | --- | --- | --- | --- | --- |
| 0.15 | Both removed | 235 / 353 | 6 / 159 | 0 / 29 | 4 / 588 |
| 0.25 | Both removed | 263 / 353 | 15 / 159 | 0 / 29 | 154 / 588 |
| 0.35 | Both removed | 278 / 353 | 50 / 159 | 3 / 29 | 391 / 588 |
| 0.50 | First remains | 306 / 353 | 135 / 159 | 27 / 29 | 506 / 588 |
| 0.65 | First remains | 327 / 353 | 152 / 159 | 27 / 29 | 537 / 588 |

The fourth speech clip already had no accepted estimates. Environmental totals
include rain, wind, vacuum, horn, dog, knocking, typing and train. These counts
are dominated by the long periodic vacuum signal and are not a balanced metric.

At 0.35, clean speech's below-400 Hz estimates fall 345 → 278; its voiced chart
buckets fall 51 → 45. Case 01, where native Voice Tools previously displayed a
trace, falls 28 → 17 buckets. At 0.15 it falls to just two. This is substantial
loss beyond the two targeted excursions, although annotations would be needed
to classify each rejection.

## Known-input checks

`periodicity.test.cjs` checks periodic signals at 60, 100, 200, 500 and 1000 Hz,
DC invariance, silence, deterministic noise, missing boundary context and invalid
PCM/geometry. Pure high notes pass; there is no hard 500/600 Hz cutoff. A known
200 Hz sinusoid mixed with deterministic 0 dB noise fails even a 0.35 gate despite
the source remaining present. This directly demonstrates false rejection risk;
it does not substitute synthetic tones for natural speech validation.

## Reproduce

```
node tests/pitch-comparison/periodicity.test.cjs
node tests/pitch-comparison/test-periodicity-corpus.cjs
node tests/pitch-comparison/test-periodicity-corpus.cjs --full
```

The full mode reads the previously collected `outputs/voice-gating/inputs.json`,
checks original source hashes, decodes each file, and reruns the same production
analysis and gate. It is not a browser/native comparison and does not regenerate
native captures. Results, scores per raw observation, and grouped trajectories
are saved to `outputs/pitch-comparison/periodicity/results.json` and
`results-full.json`. No network access, package downloads or product dependencies
are introduced. These corpus runs remain optional local research.

## Decision

Do not enable this simple hard gate as a default. The tested thresholds do not
simultaneously remove both excursions and retain the existing noisy speech traces.
Further work should compare a period-consistent measure and temporal evidence,
with independently marked voiced regions and quiet/breathy/high-pitched speech.
A detector-specific YIN threshold is not interchangeable with Praat strength.

## Full collected corpus

All 149 original source hashes were verified: 100 CHiME6 far-field conversation
clips, 48 ESC-50 clips (38 environmental/animal and 10 other human sounds),
and the cleaner speech control. No new native-app measurements were made.

| Threshold | Far-field estimates retained | Far-field clips still with estimates | Environment/animal estimates retained | Other human-sound estimates retained |
| --- | --- | --- | --- | --- |
| 0.15 | 1968 / 14889 | 54 / 90 | 954 / 5467 | 481 / 1463 |
| 0.25 | 4920 / 14889 | 78 / 90 | 1521 / 5467 | 639 / 1463 |
| 0.35 | 8186 / 14889 | 89 / 90 | 2352 / 5467 | 781 / 1463 |
| 0.5 | 12427 / 14889 | 90 / 90 | 3391 / 5467 | 994 / 1463 |
| 0.65 | 14227 / 14889 | 90 / 90 | 4026 / 5467 | 1215 / 1463 |

The larger set reinforces the retention tradeoff. A clip retaining one estimate
is not necessarily useful feedback, and retained estimates are not guaranteed
correct. CHiME6 clips come from two sessions and are not 100 independent
speakers/environments. No threshold can currently be recommended as meeting
the requested speech-preservation requirement.

A tighter bound avoids relying only on the five chosen thresholds: the smallest
score among the eight targeted spike frames is 0.364155. Any uniform
hard threshold that removes all eight must be at or below that value. At that
most permissive limit, only 8657 / 14889 (58.1%) existing
far-field estimates survive. Thus tuning this same scalar gate between the tested
thresholds cannot eliminate the retention tradeoff.
