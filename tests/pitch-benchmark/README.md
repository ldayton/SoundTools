Current status: see [GATE-TRIAL.md](GATE-TRIAL.md). The optional neural gate failed matched quiet-speech acceptance and remains disabled by default. Historical detector comparisons below are frozen research results.

# Speech pitch benchmark

This is the replacement evaluation contract, not another detector tweak. The app remains unchanged. `plan.json` records corpus scope, algorithm shortlist, known training contamination and remaining work.

## Common data contract

An input manifest has `timingVerified: true`, `timing: {hop: 0.01, tolerance: 0.0081, transitionMask: 0.03}`, and `clips`. Every clip requires `id`, `corpus`, `speaker`, `split`, `sampleRate`, `pcm`, `pcmSha256`, `reference`, `referenceSha256`. PCM is mono float32 little endian. Reference files are JSON arrays of `{time, hz, exclude?}`. Time is seconds from the audio start; zero Hz means unvoiced. Predictions use the same `{time,hz}` contract. Missing output counts as unvoiced. No fitted per-algorithm offsets, clipping to a convenient speech range, or silent frame deletion.

Do not set `timingVerified` until the reference first centre and hop have been independently established. Our older pilot's offset sensitivity is not a substitute. Excluded/transition frames are counted explicitly. The scorer reports octave errors within 100 cents of twice/half the reference; other gross errors still reduce pitch F1. Reference frames must use the declared regular hop for duration accounting.

Run `npm run test:pitch-benchmark` for deterministic scoring checks. Run `npm run benchmark:pitch -- manifest.json outputs/pitch-benchmark/results.json` for current app raw/filtered/corroborated modes. This first adapter measures detector output at fixed confidence, **not** complete product output, stock Praat defaults, or real-time latency. It hashes its inputs and production artifacts. Results and audio belong in ignored `outputs/`, never in the distributable app.

## Next execution stages

1. `python3 tests/pitch-benchmark/prepare-ptdb.py` inventories all 4,720 official utterances; `--per-speaker N` acquires N non-shared si utterances per speaker with microphone, laryngograph and reference hashes in a local lockfile. First acquisition establishes pins; subsequent runs verify them. Then verify timing against laryngograph, and create speaker-disjoint partitions before examining scores. Keep the 16 old pilot utterances in development/regression, not a fresh locked test.
2. Pin AVID speech/EGG packages; derive and audit references on varied speakers, soft endings, irregular phonation and high speech. Verify model training manifests before claiming independent evaluation.
3. Add stock Praat, SwiftF0 and REAPER adapters producing the common prediction contract. Store model/source hashes, confidence rules, context and lookahead alongside outputs. Do not hide a full-file decoder behind a streaming label.
4. Run broad scoring, aggregate by speaker with bootstrap intervals, and inspect a fixed selection of disagreements blind. Report independent and training-overlap corpora separately. Count unique utterances/speakers separately from synthetic variants.
5. Bring only two finalists to bounded streaming and actual phones. Include analysis window, model future context, decoding and drawing delay in end-to-end latency. Decide using agreed tolerances; do not start another cycle of private-clip threshold tuning.

No automatic winner is selected by this scaffold. Corpus preparation and external adapters are intentionally marked pending rather than treated as completed evidence.

## External adapters

Use an isolated Python3.12 environment with `requirements.txt`. `swift-adapter.py input.f32 output.json --rate 48000` exports SwiftF0 confidence at its documented0.5threshold, model hashes and native16ms timestamps. `praat-adapter.py input.wav output.json` invokes the installed Praat app with explicit stock settings, hashes the binary/script and exports both native clocks. Both are offline outputs; they are not latency-equivalent to the app. `score.cjs reference.json predictions.json timing-contract.json` accepts independent outputs once the clock contract is verified. Choose nearest-frame tolerance to cover native hops (e.g.8.1ms for16ms outputs); do not adjust it per observed accuracy.

`reaper-adapter.py input.wav output.json` uses a locally compiled upstream REAPER CLI (default path under ignored outputs), preserves EST timestamps and maps its unvoiced frames to0. Its source commit and binary hash are recorded. Build with CMake; this checkout required `-DCMAKE_POLICY_VERSION_MINIMUM=3.5` with CMake4.

`aggregate.cjs` aggregates scores and bootstraps by corpus/speaker, with a deterministic seed. Call it separately for each algorithm, split and independent/training-overlap condition; never pool those into one winner ranking. It requires at least two speakers for intervals.

## Initial local verification

- Official server inventory:4,718available microphone utterances versus4,720documented; F08has234instead of236. The discrepancy is recorded rather than hidden.
- Acquired400utterances,20per speaker across20speakers, with microphone/laryngograph/reference hashes. These are unscored research inputs; reference timing remains unverified.
- Exported120current-app detector outputs on an initial40utterance smoke set (three methods each).
- SwiftF0, stock Praat raw/filtered and REAPER adapters each ran on real audio and their exported timestamps/pitches passed the common validation.
- No new accuracy ranking, independent neural evaluation, or phone performance claim follows from these smoke tests.

## Completed broader run (20 October2026)

See `outputs/pitch-benchmark/report.html` for results and limitations. The run covers400PTDB originals/20speakers,64AVID raw paired excerpts/8additional speakers,40moderate-noise derivatives/20originals and3noise-only controls. Those numbers are not additive independent sample counts. The app remains frozen atcdf3adb.

Timing: `audit-timing.py` uses only development-speaker laryngograph data; `prepare-reference.py` implements the nominal16ms origin from the original extraction script and Snack documentation. `summarize.cjs` also reports0/32ms sensitivity rather than fitting offsets per detector. Clock choice materially affects results.

External screen: `compare-external.py` runs the pinned Swift model and stock Praat/REAPER adapters, with four bounded workers; REAPER must be a Release build. `summarize.cjs` checks PCM/reference/prediction hashes and reports by split and condition, with speaker bootstrap intervals. The neural training-overlap warning still applies.

Independent data: `prepare-avid-paired.py` acquires bounded120second raw stereo prefixes plus locator snippets for8new speakers. Raw prefixes have local SHA pins, not full-archive CRC validation; locator snippets have ZIP CRC validation. `align-avid.py` locates excerpts by microphone waveform correlation and crops microphone/EGG from identical raw sample positions. This guarantees their shared clock even where repository2 processing prevents sample-identical snippets. The0.4coarse locator-correlation floor is a matching sanity check, not a voicing threshold; per-frame processed-snippet agreement is recorded as a diagnostic, not used to discard raw EGG anchors. `egg-reference.py` yields conservative EGG-derived voiced anchors and explicitly marks all other frames unknown. It cannot measure false voicing or prove high-speech preservation.

Streaming: `stream-app.cjs` and `stream-swift.py` record actual audio availability separately from CPU time. `BENCH_PAD=1` for app or `--pad .5` for Swift supplies identical half-second silence context before/after and maps results back to the full original clip. This corrected startup/end losses in the first short-snippet comparison. `summarize-stream.cjs ... 0` scores the entire padded original; its default0.35edge exclusion is for the older unpadded steady-state diagnostic only. `build-stock-stream.py` creates a research-only filtered Praat bridge with standard scoring settings,10ms hop,50–800Hz range; no production assets are modified.

Noise: `prepare-moderate-noise.py` uses the20fixed original utterances (one per speaker),2fixed SNRs and3pinned environmental noise recordings. `score-common-gate.cjs` gives all detectors the same shipped libfvad gate, with causal availability checks. It does not include the product's50ms temporal confirmation or drawing. `report.py` renders fixed speaker/task examples and the evidence tables.

Validation: `npm run test:core`; isolated research runtime: `python egg-reference.test.py`; Swift streaming asserts native-clock and accepted-pitch parity with its full-file inference (within1cent). Current tests do not establish physical phone behavior.

Decision from this run: no wholesale detector replacement. Standard filtered Praat reduces gross pitch errors but admits more pitched noise; Swift adds delay without a decisive independent win. Keep production unchanged. Missing evidence: complete independent voicing labels, real-device continuous recordings, genuine high speech above400Hz, and actual iPhone/Android performance.
