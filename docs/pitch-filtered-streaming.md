# Raw versus filtered autocorrelation under matched streaming conditions

Local experiment, 2026-10-19. App, presets, and the existing dirty Praat checkout
are unchanged. Research build and recordings are kept under ignored `outputs/`.

## Result

Filtered autocorrelation is **not a demonstrated replacement** for the current
pitch detector in our short-block streaming configuration. It eliminates several
legacy false high tracks and recovers some weak voicing, but introduces other
excursions and gives lower agreement with the simultaneous headset comparison
channels in a new continuous meeting corpus. This is a tradeoff, not a universal
accuracy verdict or proof that raw AC is always better.

## New recordings and provenance

Downloaded the original AMI Meeting Corpus channels for ES2004a, IS1009a and
TS3003a from the [University of Edinburgh's official mirror](https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/).
AMI's [official download page](https://groups.inf.ed.ac.uk/ami/download/) states
that the signals are CC BY 4.0. Attribution: AMI Consortium / University of
Edinburgh, AMI Meeting Corpus. Originals, source URLs, source hashes, durations
and channel information are retained in `continuous-sources/sources.json`; pinned
excerpt metadata is in `tests/pitch-comparison/continuous-manifest.json`.

Selections were fixed before comparing detectors:

| Meeting | Original source intervals | Channels |
| --- | --- | --- |
| ES2004a | 60–90, 180–210, 360–390 s | Array1-01 and Mix-Headset |
| IS1009a | 90–120, 240–270, 420–450 s | Array1-01 and Mix-Headset |
| TS3003a | 60–90, 180–210, 300–330 s | Array1-01 and Mix-Headset |

Nine continuous passages, **270 seconds of distinct meeting time**, with separate
simultaneous distant and headset channels (18 channel excerpts, NOT 540 seconds
of independent speech). These include room/background sounds and overlapping
speakers, not artificially mixed noise. They are a three-meeting pilot, not a
broad sample of street, vehicle or phone conditions. Headset mix is a better
comparison channel in some regions, not a clean ground-truth fundamental.

Each excerpt is an unpadded exact 30-second source cut, resampled to mono 48 kHz
PCM16 identically for every arm, with no denoising, normalization, looping or
synthetic noise. Both WAV and float-PCM hashes are pinned. A bounded test for exact
repetitions at offsets from 0.25 to 2 seconds finds none in the new excerpts;
long-delay normalized correlation is also low (far-channel maxima 0.028–0.221).
This supports the original continuous provenance rather than proving the absence
of every conceivable repeated segment. The previous looped clips are used only
as legacy regression examples, not as new independent corpus evidence.

## Controlled streaming comparison

A test-only builder copies the adapter into `outputs/`, replaces only the pitch
call with an explicit mode switch, and links the same cached Praat objects with
the pinned Emscripten 6.0.12 release flags. It edits neither the fork nor app assets.
Its manifest records bridge, object, toolchain, production and generated-asset
hashes. It passes through the unchanged production processor and PraatStream.

| Parameter | Raw / current | Filtered, matched path settings | Filtered, stricter path settings |
| --- | --- | --- | --- |
| Pitch floor / top | 50 / 1200 Hz | Same | Same |
| Pitch hop | 10 ms | Same | Same |
| Input / advance / retained margin | 200 / 100 / 50 ms | Same | Same |
| Gaussian attenuation at top | None | 0.03 | 0.03 |
| Silence / voicing threshold | 0.03 / 0.45 | Same | 0.09 / 0.50 |
| Octave cost | 0.01 | Same | 0.055 |
| Octave jump / voiced-unvoiced cost | 0.35 / 0.14 | Same | Same |
| Maximum candidates / accuracy | 15 / normal | Same | Same |
| Display strength threshold | 0.45 | Same | Same |
| Display grouping | Voice Tools parameters | Same | Same |
| Hybrid post-filter | Off | Off | Off |

The stricter arm uses Praat's recommended filtered-AC path parameters while
holding the pitch range at 50–1200 Hz; it is deliberately NOT the complete native
800 Hz preset. Lowering the ceiling would confound the comparison by excluding
some target excursions by definition.

For every input, all modes assert identical PCM request hashes, lengths, context,
frame counts and timestamps. The research raw mode asserts bit-for-bit equality
of **all feature rows** with the shipped raw WASM, covering the clean control,
eight audited legacy clips and all 18 new channel excerpts (27 inputs). This
controls for dirty checkout/source/build drift as well as stream geometry.
Known silence / 200 Hz / 60 Hz / 1000 Hz tests pass. 128-sample capture packets
and 100 ms replay packets produce identical requests and rows in each mode.

This is matched streaming DSP and production grouping, NOT a microphone routing,
browser repaint or physical-phone test. All arms have the same audio lookahead;
processing time is still a separate measurement.

## Original excursions and legacy cases

| Method | Original two grouped excursions | Other grouped values above 400 Hz in the clean control |
| --- | --- | --- |
| Raw | 869.7 Hz at 0.95 s; 747.9 Hz at 2.15 s | None |
| Filtered, matched | Both absent at those times | 726.0 Hz at 2.65 s; 588.0 Hz at 3.95 s |
| Filtered, stricter | Both absent at those times | 726.0 Hz at 2.65 s; 596.3 Hz at 3.95 s |

Thus inspecting only the two original moments would incorrectly declare success.
The new high excursions are visible in the complete control plot. Reference pitch
labels remain absent, so the table describes estimates rather than exact error
rates.

In legacy 0011, filtered matched mode expands accepted raw estimates from 5 to 84,
including all five weak-voicing estimates that the hybrid blanked. In 0041 it
expands 138 to 267, preserving all 27 estimates previously rejected by the hybrid.
In 0085 it avoids the persistent 1.1 kHz raw track. Those are encouraging cases,
but cannot substitute for the new continuous evaluation.

## Paired-channel comparison and its limits

Far/headset time offsets were estimated from band-passed audio cross-correlation,
independently of pitch scores. Stable pairs have median delays about 1.9–7.4 ms.
ES2004a 180–210 s has unstable alignment and is excluded from paired scores,
though retained in detector comparisons. Eight passage pairs remain.

The comparison reference consists only of headset frames where raw AC and filtered
matched AC both have strength >=0.6 and agree within 50 cents. We compare each
far-channel detector to the nearest aligned reference frame, with no pitch
interpolation. There are 10,016 such frames at the measured alignment.

This is **cross-channel agreement, NOT annotated accuracy or speech recall**.
The headset mix can contain multiple speakers, shared algorithms can agree on
errors, and this selection favors regions where both methods already agree.
Distant microphones can emphasize a different speaker from the headset mixture.
Consequently an individual disagreement is not automatically a detector mistake.
Frame observations are correlated, not independent statistical trials.

| Method | Within 50 cents of headset reference | Unvoiced at reference frames |
| --- | --- | --- |
| Raw | 6181 / 10016 = **61.7%** | 2119 = 21.2% |
| Filtered, matched | 5893 / 10016 = **58.8%** | 2307 = 23.0% |
| Filtered, stricter | 5244 / 10016 = **52.4%** | 3892 = 38.9% |

Shifting alignment by ±5 ms leaves the ordering unchanged: raw agreement
61.47–61.71%, filtered matched 58.51–58.84%, stricter 52.12–52.36%.
Per-passage results are available in the report; results were not limited to the
best examples. On the nine far-channel passages, >500 Hz chart groups decrease
509 → 20 / 13 with filtering. That is a dramatic display change, but those 509
values are NOT 509 labelled pitch errors. The lower paired agreement and extra
unvoiced time prevent interpreting a cleaner trace as an unqualified improvement.

## Cost and tests

On this Mac in sequential Node/WASM offline replay, median per-request DSP time
(spectrogram plus features, already-loaded module) was about 4.4 ms raw and 5.4 ms
filtered. P95 was about 6 ms for all arms. Each request processes 100 ms of new
audio plus context. These timings exclude worker transport, initialization,
rendering and device capture, and are not phone performance or end-to-end latency.

Focused tests pass for mode validation, raw parity, stream packetization,
silence/known low and high notes, and existing grouping/capture/interval metrics.
The experiment itself validates source/PCM hashes and identical requests and
observations geometry. Audio excerpts and charts remain local.

## Reproduce

Requires existing cached Praat release objects and the pinned SDK, FFmpeg, Node,
and the local Python research environment with NumPy, SciPy and Matplotlib.

```
source /path/to/emsdk/emsdk_env.sh
python3 tests/pitch-comparison/build-filtered.py /path/to/praat-wasm
python3 tests/pitch-comparison/download-continuous.py
python3 tests/pitch-comparison/prepare-continuous.py
node tests/pitch-comparison/matched-stream.test.cjs
node tests/pitch-comparison/compare-filtered-stream.cjs
python tests/pitch-comparison/audit-continuous.py
node tests/pitch-comparison/score-filtered-pairs.cjs
python tests/pitch-comparison/report-filtered-stream.py
```

Also requires prior legacy control/audit inputs; the script verifies their hashes.
`continuous-manifest.json` pins the original sources and selections. Data and
research artifacts are not shipped in the app or added to ordinary CI.

## Recommendation

Keep the production detector unchanged. Filtering has real local benefits, but
the matched-context experiment does not establish an overall improvement and
shows why whole-recording reference plots were insufficient. The next defensible
step is to review disagreements on individual-speaker headset channels or obtain
reference pitch labels, then test a tracker with cross-block candidate continuity.
Do not tune another global gate against these same two spikes or report the paired
proxy as validated speech accuracy.
