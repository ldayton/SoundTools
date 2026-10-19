# Temporal filtering and alternative voicing measures

Subsequent acoustic audit: the hybrid rejects some supported voiced speech, and 78/100
original noisy-speech files contain exact internal repeats. See
[pitch-worst-cases.md](pitch-worst-cases.md) before interpreting retention as accuracy.

Local investigation, 2026-10-19. No production files or presets changed.

## Evidence and method

All 149 recordings from the previous experiment were evaluated: 100 far-field
CHiME6 conversation clips from two sessions, 48 ESC-50 environmental/animal/other
human-sound clips, and the eight-second English interview control. The harness
reuses production WASM/PraatStream raw estimates saved by the prior experiment.
Original source hashes and newly decoded 48 kHz PCM hashes are checked again;
new acoustic measures are recomputed from that verified PCM. This avoids paying
for the same pitch analysis again. The prior pinned-subset run already verified
production grouping against the browser replay. No new native Voice Tools
captures were made, and there is no claim of detector equivalence.

All filters act **before** the existing FeatureState grouping/drawing. They can
only suppress estimates, not invent pitches or alter retained raw frequencies.
Grouping can nevertheless pick a different frequency after a rejection, because
continuity selection depends on the preceding bucket.

Background: Praat's [pitch method guidance](https://uvafon.hum.uva.nl/praat/manual/how_to_choose_a_pitch_analysis_method.html)
favors filtered autocorrelation for intonation over raw autocorrelation. The
[pYIN implementation](https://github.com/c4dm/pyin/blob/default/PYinVamp.cpp) combines
pitch likelihoods and temporal tracking. These motivate testing evidence over
multiple observations; neither is implemented or claimed equivalent here. Changing
the underlying detector to filtered AC remains a separate experiment.

## Approaches

- Hard periodicity gate: the previous minimum normalized-difference threshold 0.35.
- Minimum coherent run: accept at least six voiced estimates, with at most 20 ms
  between observations and at most 600 cents between adjacent pitches. With a
  10 ms grid this is normally 50 ms from first to sixth sample. Four- and eight-
  frame variants were also evaluated. Real gaps and abrupt jumps split runs.
- Hybrid: retain those long runs regardless of periodicity; also retain short
  runs if at least one estimate has normalized difference below 0.35. Stricter
  rescue thresholds 0.15 and 0.25 were evaluated too. This is the promising case.
- Previous-pitch support: retain a short run if every observation matches an
  independently long run in the preceding 300 ms within 600 cents. Rescued short
  runs cannot recursively support other short runs. A bidirectional 150 ms
  variant and a support-plus-0.25 rescue variant were also evaluated.
- Candidate-period correlation: mean-centered normalized correlation between a
  32 ms signal segment and a displaced copy at the proposed period, including
  fractional lags and ±5% tolerance. Thresholds 0.2, 0.4 and 0.6 were evaluated.
  This measures the specific candidate instead of finding any period, but does
  not distinguish a periodic machine from a voice.

The temporal rules need buffering; running them directly on an unfinished history
and repainting earlier classifications would cause flicker. Six observations with
20 ms maximum gaps can require up to 100 ms of future observations. The hybrid
and past-support variants can be finalized with that bounded delay plus existing
analysis scheduling. This is a design bound, NOT a measured end-to-end browser
latency. Bidirectional support needs up to 250 ms and offers no compelling gain.

## Results

Retention denominators: 14,889 raw estimates for far-field clips; 353 for clean
speech; 6,930 for all ESC-50 clips including other human sounds. These are
**retention rates, not annotated speech recall, false-alarm rates or accuracy**.

| Approach | Both excursions removed? | Noisy speech retained | Clean speech retained | ESC-50 estimates retained |
| --- | --- | --- | --- | --- |
| Hard periodicity 0.35 | Yes | 55.0% | 78.8% | 45.2% |
| Four-frame run | No | 98.4% | 94.6% | 93.0% |
| Six-frame run | Yes | 93.4% | 86.7% | 85.6% |
| Eight-frame run | Yes | 85.8% | 85.0% | 78.9% |
| Six-frame hybrid, rescue 0.15 | Yes | 93.5% | 88.4% | 85.9% |
| Six-frame hybrid, rescue 0.25 | Yes | 94.0% | 91.2% | 86.7% |
| Six-frame hybrid, rescue 0.35 | Yes | **96.1%** | **94.9%** | 88.7% |
| Previous-pitch support | Yes | 95.5% | 89.2% | 89.9% |
| Bidirectional support | Yes | 95.6% | 86.7% | 89.6% |
| Past support + rescue 0.25 | Yes | 96.0% | 92.6% | 90.7% |
| Correlation 0.4 | No | 98.9% | 98.0% | 97.4% |
| Correlation 0.6 | No | 71.9% | 89.0% | 75.7% |

The hybrid removes all eight raw spike estimates and both associated chart groups.
Clean speech changes from 51 voiced groups to 49: exactly the two targeted groups
are removed. Some retained group frequencies can change. Noisy-speech groups fall
2,208 → 2,081 (94.2% retained); another 61 retained groups change by over 50 cents.
Do not infer that these changes are improvements without reference pitches.

Hybrid retention by session: S02 6,094 / 6,403 (95.2%); S09 8,217 / 8,486 (96.8%).
The parameters were examined on these same clips, so neither session is a held-out
evaluation and those counts do not establish generalization.

## Failure cases and sensitivity

The hybrid retains estimates in 89 of the 90 previously nonempty speech clips.
Aggregate retention conceals losses: one noisy clip with 31 estimates retains 17
(54.8%), and its nine voiced groups fall to three. Another retains 42 / 63 estimates
and nine of sixteen groups. These could contain errors or genuine brief speech;
there are no time-aligned voiced/pitch annotations to decide. The report includes
these worst cases, not just the successful clean control.

The vacuum control keeps all 488 estimates with the hybrid, just as before.
Sustained horns and other periodic nonvoice sounds can also survive. This is a
brief-excursion filter, not a general voice/noise gate.

A clean-control sensitivity check keeps raw estimates fixed and shifts the acoustic
periodicity window by −10, −5, 0, +5 and +10 ms. All three hybrid rescue thresholds
remove both excursions at all five offsets. Hybrid-0.35 clean retention ranges
323–340 / 353. This does not simulate a shifted detector grid or validate arbitrary
microphone preprocessing and clock errors.

Synthetic regression checks cover sustained 60–1000 Hz periodicity/correlation,
short weak events, short strongly periodic notes rescued by the hybrid, real gaps,
abrupt jumps, glides, support without chains, silence/DC/noise, invalid inputs and
stable classification after bounded confirmation. Pure high notes are not rejected
by a frequency ceiling. Brief, noisy genuine notes can still be rejected.

## Reproduce and inspect

```
node tests/pitch-comparison/temporal-filters.test.cjs
node tests/pitch-comparison/compare-voicing.cjs
node tests/pitch-comparison/check-voicing-sensitivity.cjs
node tests/pitch-comparison/report-voicing.cjs
```

Requires the previous full-corpus JSON, original local source files, FFmpeg, and
Node. Results: `outputs/pitch-comparison/voicing-comparison/results.json`,
`sensitivity.json`, and `report.html`. The report uses production grouping and
path geometry with an expanded 50–1200 Hz axis to show the excursions; it is not
a screenshot of a modified application. It includes audio and baseline/hard-gate/
hybrid charts for clean speech, the worst noisy clips and the vacuum control.

## Recommendation

The six-frame hybrid with 0.35 rescue is the best candidate tested here for removing
these two excursions while preserving existing speech estimates. Candidate-specific
correlation alone does not solve them. Neither result warrants enabling a default:
first mark voiced regions in the worst rejected clips and add independent short,
breathy, quiet and high-pitched speech. Then, if it holds up, implement a buffered
streaming version and measure its additional delay through the existing browser
harness. Keep a detector change (such as filtered AC) separate from post-filtering
so its contribution can be measured independently.
