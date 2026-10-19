# Minimal local pitch comparison

This is a small supervised investigation harness, not a new application subsystem.
Production app code is unchanged. `manifest.json` pins 12 exploratory recordings,
original-file hashes, source/licence information, fixed display settings and optional
interval annotations. It deliberately includes prior disagreements; do not treat it
as an unbiased held-out benchmark. Real whistles, quiet voice and humming remain
missing from this initial selection.

## Fast Soundglow regression

The ordinary browser suite runs the synthetic silence/200 Hz smoke test through
production PraatStream, worker and workspace drawing. Core tests cover annotated
interval metrics and the capture helper's preflight/stale-run safeguards. No audio
corpus or native app is needed for these build checks.

For the selected local corpus, install FFmpeg and retain the original research files
at the paths in the manifest, then run:

```sh
npm run test:pitch-comparison
```

Preparation verifies original checksums, decodes to mono 48 kHz float PCM and hashes
that PCM. Replay stores actual rendered pitch observations, settings and screenshots
under `outputs/pitch-comparison/replay/`. It replaces only the test-page transport and
clock; production analysis and workspace drawing are reused. It is not a microphone,
AudioWorklet or latency test. Sources are not downloaded or packaged into the app;
ESC-50 research recordings include non-commercial licence terms.

## Supervised comparison against Voice Tools (Mac)

1. Prepare with `node tests/pitch-comparison/prepare.cjs`. A new run ID invalidates
   old captures; stale start/status files are removed. Existing results remain on
   disk for inspection. Copy a completed output directory before starting a new run
   if it should be preserved.
2. With BlackHole 2ch already installed and at 48 kHz, compile and start playback:

   ```sh
   swiftc tests/pitch-comparison/feed.swift -o outputs/pitch-comparison/feed
   outputs/pitch-comparison/feed outputs/pitch-comparison --wait
   ```

   The helper resolves devices by name rather than hard-coded IDs, verifies the
   default input, and waits before playing. It restores the previous input at normal
   exit or Ctrl-C/SIGTERM. Speaker output is never changed. SIGKILL/crashes cannot
   guarantee cleanup; verify the original input afterward.
3. Open Voice Tools' live Pitch view; confirm 50–500 Hz and ten-second history.
   Open the local Soundglow app, select Pitch / Voice Tools, choose BlackHole and
   start microphone capture. Close its sidebar. Use the recorded native window size
   **1051 × 820** and browser viewport **1051 × 900**, DPR 1. The image scorer rejects
   a different native size; do not silently reuse its coordinates.
4. Use the documented computer-use/native and browser APIs to obtain the two app
   bindings. `capture.mjs` uses those bindings rather than starting a second UI
   automation system. In that computer-use session:

   ```js
   const fs = await import('node:fs/promises');
   const {createCapture} = await import('/absolute/repo/tests/pitch-comparison/capture.mjs');
   const capture = await createCapture({nativeApp, tab, fs,
     folder: '/absolute/repo/outputs/pitch-comparison', nativeSettingsConfirmed: true});
   ```

5. Start the clock by creating `outputs/pitch-comparison/start.flag`. Call
   `await capture.capture(4)` in batches, without long gaps, until all 12 are saved.
   The first English speech recording is the positive control. Stop the run if it
   is not visibly working in both apps. Captures more than one second late, clock discontinuities, stale clock files, wrong routes, or oversized screenshot timing brackets are invalid. Fresh clock samples bracket each screenshot; the clock is rechecked even after its target is reached. Native screenshots are taken at clip end +250 ms, browser at +550 ms,
   accounting only for Soundglow's nominal 300 ms delay. This is **not calibrated
   end-to-end latency**, and exact timing/pixel parity must not be inferred.
6. Score and generate the HTML report. Pillow is needed only for this local image
   inspection, not for app/build dependencies:

   ```sh
   python-with-pillow tests/pitch-comparison/score-images.py
   node tests/pitch-comparison/report.cjs
   ```

   Open `http://localhost:8765/outputs/pitch-comparison/report.html` with the local
   repository server running. It includes paired screenshots, playable recordings,
   provenance, timings, and optional annotation metrics. Readiness checks plus the
   image scorer require a successful positive control; absent/late captures mark
   the report invalid. Score saturation thresholds are descriptive image measures,
   not detector ground truth. Visually review differences.
7. Stop Soundglow microphone capture, leave native live capture, restore temporary
   viewport/app choices, and verify system input/output selections.

Retry only a failed case (a speech control is included automatically):

```sh
PITCH_COMPARISON_OUT=outputs/pitch-comparison/retry node tests/pitch-comparison/prepare.cjs case-04
```

Repeat playback/capture into that folder, then run `node tests/pitch-comparison/merge.cjs`.
The merge checks matching PCM hashes and valid capture timing, preserves the original
capture metadata, and replaces the failed pair. Re-run scoring/report generation.

## Interpretation

The report measures **visible dots/curves in the clip's chart region**, in both apps.
It avoids the earlier comparison of Soundglow raw observations with native drawing.
A lone dot counts; a blank screenshot is labelled "None captured", not "no voice".
Chart clipping, renderer connections and capture latency affect these results.

Annotations use `{start, end, label: 'voiced'|'nonvoice'|'unknown', hz?: number}`.
They must be sorted, non-overlapping, finite and within the clip. Only explicit
labels are scored. Empty annotations yield null accuracy/recall metrics; missing
observations on annotated voiced time count as misses. Observation values are held
until the next timestamp; each value is held for at most 150 ms (configurable), including the final value, so missing data cannot become a sustained pitch. These metrics describe sampled observations, not line segments interpolated by the renderer. Pitch accuracy uses
50-cent tolerance and does not forgive octave errors. Do not fabricate reference
F0 from either app. Latency scoring and automatic native F0 extraction are deferred.

## Historical first comparison (superseded by the audit)

Local outputs are in `outputs/pitch-comparison/report.html`. All 12 pairs are valid
after retrying the late rain capture. Both speech controls showed traces.

- Both showed traces for cleaner speech, one distant-speech clip, horn, knocking
  and train; both were blank for rain and one distant-speech clip.
- Only Soundglow showed output for the other distant-speech clip, wind and vacuum.
- Only Voice Tools showed output for dog and typing in this run (some isolated dots).
- The cleaner-speech screenshots show similar contour stretches but substantial
  extra high-frequency excursions in Soundglow. A "visible in both" result does
  not establish contour agreement or correctness.

The selection is small and targeted. These results motivate further investigation,
not an immediate change to the pitch gate. App behavior remains unchanged.


## Correctness audit and repeated comparison

The first capture implementation recorded a pre-screenshot time only and could
accept a stale clock once its target was reached. Its binary three-pixel scoring
also overstated the certainty of isolated markers. Do not use that report for firm
noise-rejection conclusions. Original files are retained for provenance.

The audited run is `outputs/pitch-comparison/audit-v2/report.html`:

- `clockVersion: 2` is required for scoring. Both screenshots have fresh source-clock
  brackets including a 40 ms publication/buffer allowance. Per-capture clock span
  was 112–197 ms; observed chart-clock drift stayed below 90 ms. No captures were late.
- The feeder checks the active default input continuously and publishes explicit
  ready/running/completed phases. Capture rejects stale, reversed, completed or
  non-advancing clocks. Settings, active Pitch tab and DPR are rechecked per clip.
- Scoring evaluates both bracket bounds with ±1 second alignment shifts and 3/6/12
  pixel thresholds. Any change of classification becomes `sensitive`, not a firm
  visible/blank difference. Cyan boxes show nominal scored regions, excluding
  earlier clips still visible at the left of the full chart. The sensitivity sweep
  is a tested range, not calibrated native/browser end-to-end latency.
- Six of twelve pairs have stable visibility classifications across that sweep:
  shared visible cases 00, 01, 09; shared empty cases 03, 04; and a difference at 02
  (native empty, Soundglow visible). The other six contain a sensitive result.
- Large extra Soundglow excursions on the cleaner-speech control reproduced on
  visual inspection. This demonstrates a real display difference, not which app's
  pitch is correct or which internal gate is responsible.

Run local image-scoring regressions with a Python environment containing Pillow:
`python-with-pillow tests/pitch-comparison/scoring.test.py`. They cover prior-clip
exclusion, background colors, weak dots, alignment edges and stable interior signal.
Do not retag old captures as clock version 2: they must be repeated.
