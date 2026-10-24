# Clean speech pitch excursions

Local investigation, 2026-10-19. Production code and presets are unchanged.

## Reproduce

After preparing/running the pitch comparison corpus and retaining its audited PCM:

```
node tests/pitch-comparison/investigate-clean.cjs
```

Requires FFmpeg and the local `outputs/pitch-comparison/audit-v2/case-00.f32`
and `.wav`, plus `outputs/pitch-comparison/replay/case-00.json`. The script verifies
that the PCM hash matches the browser replay and asserts every reproduced grouped
pitch matches that replay within 0.01 Hz. It uses the shipped release WASM and actual
PraatStream and FeatureState grouping. Results go under
`outputs/pitch-comparison/detector-investigation/`. These are local research
artifacts, not a new build requirement or a bundled recording.

## Confirmed cause in Soundglow

Eight accepted raw estimates form two 100 ms buckets:

| Group time | Raw times | Raw pitch | Raw strength | Grouped pitch |
| --- | --- | --- | --- | --- |
| 0.95 s | 0.97–0.99 s | 868.5–871.2 Hz | 0.489–0.635 | 869.7 Hz |
| 2.15 s | 2.13–2.17 s | 737.1–763.7 Hz | 0.480–0.619 | 747.9 Hz |

The grouped time is the bucket center, not the exact raw estimate time. These are
not spline overshoots or screen-capture timing errors. Both high groups are already
in browser replay observations. Short bursts surrounded by unvoiced frames pass
our 0.45 strength threshold. After an empty bucket, continuity grouping averages
accepted estimates, rather than selecting the nearest to an earlier voiced bucket.
The 800 ms bridge policy connects both high groups to nearby speech; the renderer
clips the peaks above its 500 Hz display ceiling but connecting strokes remain.

The wrapper calls Praat's **raw autocorrelation** `Sound_to_Pitch` convenience
function, with its default 0.45 voicing threshold, not the newer filtered method.
The extra UI strength threshold also defaults to 0.45; it is not a calibrated
probability that a sample is human speech.

## Controlled variations

| Variation | Result |
| --- | --- |
| Production 50–1200 Hz range | Both excursions reproduced exactly |
| 60–900 Hz (native Voice Tools search range) | Both remain, about 869 and 753 Hz |
| 0.5 s analysis context | Both remain; second can move higher |
| 1 s analysis context | Both grouped values reproduce the production values |
| 75–600 Hz search range | Neither high excursion remains; excludes those pitches by design |
| UI confidence 0.65 | Neither remains; accepted below-400 Hz raw estimates also drop 345 → 308 |
| UI confidence 0.70 | Neither remains; accepted below-400 Hz raw estimates drop 345 → 296 |
| Display voicing ceiling 600 Hz | Neither remains; explicitly discards higher notes |
| Disable bridging | Same two high dots remain, neither connects to adjacent groups |
| Disable grouping | All eight high raw observations remain |

Counts refer to this eight-second sample and are not accuracy scores. A longer
context experiment is not full-recording Praat analysis: the wrapper accepts at
most one second. It is enough to show that these events survive substantially more
context. No change here establishes a generally better threshold or range.

## Why native Voice Tools can differ

Installed code inspection confirms a different pipeline: a recent-voice gate
(two-second timeout), DC removal, a zero-crossing-rate gate (<0.2), then YIN with
60–900 Hz bounds and a 0.15 threshold. Native paired captures already show that the
large excursions are absent. However, we have not instrumented its live internal
buffers and intermediate gate decisions, so the exact rejecting stage is unproven.

As an independent acoustic check, the diagnostic computes a standard YIN-style
cumulative normalized squared-difference measure on 64 ms, 16 kHz DC-centered
windows, comparing 512 samples at lags 18–266. This is NOT the installed detector,
its windowing/preprocessing, or an exact implementation match. At all eight raw
spike times, no lag reaches 0.15 (minimum measures 0.364–1.385). Nearby control
windows at 0.50 and 1.10 seconds do reach it (0.110 and 0.030). This supports poor
sustained periodicity as an explanation for YIN rejecting these events. Corresponding
ZCR values are below 0.2 in this diagnostic; simply adding that gate would not
remove them here. Native preprocessing could change those values.

Do not call them proven octave errors: no independently annotated fundamental
exists for these short events. The evidence supports brief weakly periodic events
being accepted by raw autocorrelation and then emphasized by bridge drawing.

## Next decision

Test a periodicity/voicing check across the pinned corpus, including retention of
quiet/breathy speech and true high notes, before changing defaults. Raising the
strength threshold, lowering the ceiling, and turning bridges off are useful
ablations, not a demonstrated detector match. Keep drawing and detector changes
separate so apparent visual improvements cannot hide speech rejection.
