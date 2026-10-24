# Soundglow

A mobile-friendly microphone spectrogram. Praat's signal processing runs locally
in WebAssembly inside a persistent Web Worker; audio is never uploaded.

## Run locally

```sh
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765 and allow microphone access, or choose **Example** to
hear the bundled 38-second Alice Waters interview and watch its spectrogram. HTTPS
or localhost and an AudioWorklet-capable browser are required. Settings control
frequency ceiling/scale, history, dynamic range, brightness and analysis window.
The repository also works at a URL prefix such as `/Soundglow/` or `/dist/`.

## Audio pipeline

Both microphone and example feed the same AudioWorklet. It downmixes to mono and
transfers 100 ms PCM packets to the UI, which passes overlapping blocks to the
Praat worker. The worklet performs no FFT and outputs silence; only the example's
separate monitor connection plays audio. Praat uses Gaussian windows (5/15/25/40
ms effective duration), a 5 ms hop and its own power normalization. Each block
contains 100 ms plus one effective window of context on each side. Duplicate
right-boundary frames are excluded. Praat centres its frame grid in each finite
block; fixed-length blocks preserve its phase across the stream. Settings changes,
seek and discontinuities reset the grid and reject stale results.

The UI consumes timestamped frames with a 300 ms scheduling buffer, applies Praat’s reference power conversion and 6 dB/octave pre-emphasis,
autoscales to the visible history’s peak over a 70 dB range, and interpolates
for the existing smooth Canvas display. This is not a calibrated SPL meter.
The buffer is intentional latency, not measured microphone-to-screen latency.
Pending PCM has a two-second hard bound and output retains three seconds of frames.
Queued audio is processed in groups of up to four original 100 ms blocks per worker
delivery. Sustained overload still drops old input with a visible timestamp gap.
Pause freezes the display (and suspends example playback); microphone audio during
pause is discarded. Stop/home dispose the worker, graph and microphone tracks.

## Praat package and rebuilding

`dist/vendor/praat/` contains the release build, loader, worker/client, manifest,
license notices and downloadable **source.tar.gz**. The engine is lazy-loaded
once, served from this app's origin and pinned by manifest asset hashes. No
external CDN or runtime GitHub request is needed. The source archive contains
all compiled translation units, headers, and adapter/build/test sources, including
local changes. It omits unrelated Praat applications, models, website and media.

To rebuild it, extract `source.tar.gz`, activate Emscripten 6.0.12 and run:

```sh
cd praat
python3 wasm/build.py --profile release
WASM_BUILD_DIR=build-release node wasm/test.cjs
```

To import a new local engine build from the separate fork:

```sh
python3 scripts/vendor-praat.py /path/to/praat-checkout
```

Build the checkout's release profile first. The vendor script verifies asset
hashes and packages source. Commit reviewed engine updates with Soundglow rather
than silently tracking a moving branch. See the included `wasm/README.md` in the
source archive for build profiles, loader design and benchmark limitations.

## Verify

```sh
node --check dist/app.js
node --check dist/pcm-worklet.js
node tests/spectrum.cjs
node tests/praat.cjs
```

UI tests cover transport/view combinations, interpolation, capture fallback and
cleanup. Real WASM tests process the complete English recording in bounded
blocks, compare overlapping analysis against continuous Praat analysis on matching
frame grids, check twelve sample-rate/window combinations, continuous timestamps,
and rejection of stale seek results. Browser testing additionally checks the
actual AudioWorklet/worker path, audible example routing, pause/resume, seek,
settings changes and home cleanup. Real phone performance remains to be tested.

## License and audio credits

Soundglow is **GPL-3.0-or-later**, matching the Praat spectrogram code. See
[LICENSE](LICENSE) and [NOTICE](NOTICE); third-party components retain their
original notices. The app example is a BBC interview excerpt with Alice Waters,
licensed CC BY 3.0. The earlier public-domain LibriVox recording remains an
unchanged regression fixture. Details are in [audio credits](dist/audio/CREDITS.txt).

All work here is local until explicitly published. The existing `.openai/hosting.json`
identifies the older Sites deployment and is unnecessary for static hosting.

## Visual defaults

Defaults follow Praat’s `foned/SoundAnalysisArea_prefs.h`: linear 0–5000 Hz,
5 ms Gaussian window, 70 dB dynamic range, autoscaling on, 6 dB/octave
pre-emphasis, and no dynamic compression. Brightness offset defaults to zero.
The palette remains Soundglow’s blue/pink/yellow. Display power conversion
mirrors `fon/Spectrogram.cpp`; this numerical reference does not calibrate a mic.
Autoscaling uses the visible scrolling history and recolours existing columns
when its peak changes. Live analysis retains a fixed 5 ms hop for continuous
block alignment; Praat instead derives its hop from the selected view’s duration
and 1500 time steps. Requested frequency spacing follows Praat’s ceiling/500.

Screenshot comparison with native Praat (same English recording and a matched
10-second interval) verified the major formant bands, bursts and pauses. Display
columns now interpolate between timestamped analysis frames using the audio
clock, so a frame between UI refreshes is not simply discarded. Native-file
24 kHz versus browser-playback 44.1 kHz resampling and the fixed live hop still
produce fine texture differences. This is visual agreement, not pixel equality.

For a controlled comparison that removes resampling and hop differences, see
[the native/WASM visual test](tests/visual/README.md). It replays identical
24 kHz PCM at a 5 ms hop, asserts a matching frame origin, and checks all
426000 displayed power cells against native Praat before comparing images.

## Build verification

```sh
npm ci
npx playwright install chromium
npm run build
```

This static app's build gate verifies packaged engine hashes, core behavior,
426000 native-reference power values, and approved desktop/mobile canvas PNGs.
GitHub Actions runs it before Pages deployment and uploads diagnostic reports and
image differences on failure. Native Praat is only required when deliberately
updating the checked-in reference; routine builds use frozen fixtures.
See [regression test policy](tests/visual/README.md) for tolerances and updates.

The scrolling clock stops at the newest completed analysis frame during delayed
delivery and catches up at original timestamps when results arrive. Regression
tests deliver 100 ms PCM independently of rendering and hold selected worker
replies for up to 350 ms; their finished image must match the normal reference.
Real English playback also runs through the AudioWorklet at desktop, mobile
Retina and wide Retina sizes, checking progression and missing frame batches.

Autoscale repaints use a 256 KiB packed RGBA lookup table instead of interpolating
three colour channels for every screen pixel. `tests/display.cjs` compares the
result against the original interpolation across clipping, brightness and range
settings, allowing at most one byte of channel difference. The approved visual
baselines remain unchanged.

## Local Chrome fake microphone

```sh
node scripts/chrome-fake-mic.cjs --seconds 70 --keep-open
```

With local Soundglow running on port 8765, this launches installed Google Chrome
in a separate test profile and feeds the English WAV through Chrome’s fake
`getUserMedia` microphone (looping by default). It clicks the microphone button,
checks the device is fake, and records packet envelopes, frame delivery, plot
lag, render/full-repaint durations, long tasks and screenshots in
`test-results/chrome-mic/`. It does not open
the physical microphone or change the regular Chrome profile. Close the test
window to end a `--keep-open` session. Optional `--url`, `--audio`, `--profile`
and `--output` arguments select local test resources. Add `--cpu-profile` to save
a Chrome renderer CPU profile alongside the report. This is an interactive
investigation command, separate from the headless build checks.

The looping WAV capture flags are documented in
[Chromium’s media switches](https://chromium.googlesource.com/chromium/src/+/main/media/base/media_switches.cc).

## Releases, caching and updates

`npm run build` verifies the app and writes the deployable `site/` directory.
HTML refers to immutable, content-addressed UI, engine and recording URLs. UI
changes reuse unchanged WASM and audio downloads. The source preview in `dist/`
does not register a service worker; test production caching using packaged files
served at `/Soundglow/` on localhost.

The packaged app caches a complete release, checking every downloaded file's
SHA-256 before selecting it. Navigation checks a fresh release manifest; offline
or incomplete deployments fall back to the last complete cached release. Once
cached, the English example and processing engine also work offline.

Open tabs check for updates every minute while visible and on focus, reconnection
or returning to the tab (checks are throttled to 15 seconds). A fully downloaded
new release shows **Update available** in the toolbar. Clicking it reloads into
the new release and ends the current audio session. Background downloads and
service-worker activation never reload the app or interrupt capture. Other live
tabs keep their own release; obsolete browser caches are removed after those
tabs close, with a ten-minute navigation grace period.

Deployment retains at least three previous releases and all releases from the
last 24 hours, using the prior successful build artifact. This keeps briefly
stale entry HTML usable while GitHub Pages caches settle. A first visit still
uses the host's HTML caching policy; existing pre-service-worker tabs need one
reload to acquire the update feature. Browser storage eviction can remove offline
availability; caching failures do not prevent normal online microphone use.

`npm run test:updates` exercises actual packaged releases behind ten-minute HTTP
cache headers: active fake-microphone capture across updates, two-tab isolation,
worker activation, WASM reuse, rejected missing/corrupt assets, offline reload
and English speech, and cache cleanup. It runs as part of `npm run build` before
GitHub Pages deploys the exact verified artifact.

## Optional speech overlays

Settings include formant markers or connected F1–F3 tracks. These start off. Pre-emphasis defaults to the existing
6 dB/octave; quiet-frame boost defaults to zero. With these defaults, the approved
spectrogram reference images and numerical analysis are unchanged.

The same Praat WASM worker computes Burg formants (five candidates, 25 ms window,
50 Hz pre-emphasis, adjustable 5000/5500/6000 Hz ceiling), autocorrelation pitch
(75–600 Hz), and intensity (75 Hz minimum pitch, mean pressure subtracted).
Optional features use a 10 ms grid with at least 50 ms of surrounding context.
The existing spectrogram retains its 5 ms hop. Analysis runs only for enabled
overlays; formant display also calculates pitch and intensity to gate unreliable
measurements. These measurements are estimates, not a calibrated SPL reading.

Tracks connect adjacent acceptable estimates rather than running Praat's offline
whole-selection Viterbi tracking command. Voicing, relative intensity and formant
bandwidth gate the points; gaps over 25 ms and jumps over 0.22 octaves break lines.
This deliberately leaves gaps instead of inventing continuity through consonants.


Tests exercise real Praat tone/silence measurements, gating and continuity, and
English playback with settings enabled/disabled on desktop and Retina mobile.
The vendored source archive includes the extended C ABI and all new dependencies.

## Display presets

**Soundglow** is the default for new sessions: 25 ms Gaussian window, 5 kHz
ceiling, expanded-low-frequency Voice scale, six seconds of history, 50 dB
dynamic range, 10 dB background suppression and 3 dB/octave pre-emphasis.
Fixed 100 dB colour levels keep brightness stable; quiet-frame boost and
formant overlays start off. These are the same shared controls as every other
preset, with no special processing path. Existing saved selections are restored.
An older custom preset named Soundglow is preserved as Soundglow (custom).

Presets are collections of the same editable settings. **Voice Tools** selects an
ERB axis, 4 kHz ceiling, 64 ms periodic Hann window, 8 kHz analysis, 2× FFT padding,
16 ms frame spacing, DC removal, amplitude levels, balanced compatible Kaiser
polyphase resampling, wall-clock held-peak normalization, full
Plasma palette, frequency buckets and held frames. Frequency and frame
interpolation, resampling quality, normalization timing, peak memory and decay can
be adjusted independently. Changing the
ceiling alone cannot exceed the selected analysis sample rate's Nyquist limit.

The original **Praat** preset keeps Gaussian power-density analysis, device sample
rate, 5 ms spacing, the existing palette, smooth interpolation and visible-history
autoscaling. Its native numerical and visual references remain unchanged.

The additional generic frame-analysis ABI uses Praat's existing FFT and offers
either its sinc resampler or a compatible Kaiser polyphase filter; no second FFT
library is loaded. Filter quality controls the transition band, coefficient
count and phase resolution. Balanced uses 94% roll-off, up to 256 taps and 2,048
phases. Streaming retains aligned FIR context across batches and clears it on
source changes, seek and discontinuities. `engine/frame-analysis.h` is the
reviewable source for the added ABI. Its generated copy and the unchanged base
adapter are included in `dist/vendor/praat/source.tar.gz`. To rebuild from the
archive, use the earlier build instructions. To update from a separate checkout,
copy this header to `wasm/frame-analysis.h` and include it after the existing array
adapter in `wasm/spectrogram.cpp` before rebuilding; the vendor script verifies
that the header matches. The original Gaussian entry point stays available.

Amplitude levels use a shifted/clipped decibel scale and held-peak mode remembers
peak levels in one-second buckets (default five), with selectable elapsed-time decay
using float arithmetic. Timing can follow audio frame time or processing
wall time. Audio time gives reproducible replay independent of processing speed;
wall time follows elapsed processing time. Timestamped buckets expire after
the configured number of seconds, including skipped seconds; backwards clock
changes reset the hold. Decay uses elapsed time with a 16 ms reference interval.
Historical frames keep their original normalization. Dynamic range is
available for fixed and visible-history colour levels; held-peak levels use a
relative 0–1 scale. These are display measures, not calibrated acoustic SPL.

`tests/voice-settings.cjs` checks 24 input fixtures against an independent
corrected direct DFT, plus constant-input DC rejection and amplitude invariance
across FFT padding. Six original speech/noise/impulse inputs check streaming
against continuous resampled analysis at 24/44.1/48 kHz into 8/16 kHz.
DC subtraction uses the actual window samples and leaves FFT padding zero;
amplitude normalization uses the window length rather than the padded FFT size.
These intentionally correct quirks of the original Voice Tools implementation.
All computation remains local.

### Named custom presets

Use the pencil beside Preset and enter a name to store the current
display and formant settings in this browser's local storage. Named presets appear directly in the dropdown alongside the built-in presets.
Choose Create or Rename beside the name field to confirm; Enter also works. Selecting one restores its settings; the last selected
preset is restored on reload. Changing settings while a named custom preset is selected updates that preset
in local storage. Built-in presets stay unchanged; modifying one creates
Unnamed Preset*. Failed writes leave the changes unnamed and preserve the stored copy.
Editing an existing name renames that preset; the pencil also exposes Delete.
The * character is reserved for the unsaved indicator and is not allowed in names. Built-in presets
cannot be renamed or deleted. Deleting the selected custom preset immediately applies Soundglow and persists that selection. Names must be unique (ignoring case); built-in names are reserved. Storage failures
are reported and leave the entered name available to retry. Older named presets inherit the new analysis controls’ previous defaults while
retaining their existing values. Invalid stored entries are ignored. Presets are local to the browser and site origin, not synced or uploaded.
Microphone selection and playback position are not included.

Preset management uses a native modal dialog (a bottom sheet on mobile), opened
from the pencil beside the standalone selector. Naming, validation messages,
and deletion do not insert content into the settings list. Cancel and Escape
discard naming edits and return focus; leaving Settings also closes the dialog.
Brief out-of-dialog feedback is a fixed overlay. Controls are grouped by purpose
(Spectrogram, Appearance, Formants); Microphone and example playback are separate.
Browser tests compare control positions across create/delete and exercise dialog
focus, cancellation and browser Back. The interaction follows the
[W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
and uses [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
for occasional preset management.

### Measuring performance on phones

In Settings, expand **Developer settings** and enable **Measure performance**, select the configuration to test,
return to the spectrogram and start the microphone (or **Play an Example**).
Run for at least five minutes, then return to Settings and **Export report**.
Use **Reset measurements** before each configuration. Reports remain on the
user's device and contain no audio; exporting creates a JSON download without
sending it anywhere. Collection is off by default and is not saved in presets.

For physical microphone access on a phone, serve the local build through a trusted
HTTPS origin reachable from the phone; plain HTTP on a LAN IP does not provide
the secure context required by getUserMedia. The Mac localhost URL is not a
phone-accessible address. No deployment is required for the instrumentation.

For a representative matrix, use real iPhone Safari and midrange Android Chrome,
both presets, formants off/on, and normal/battery-saving modes. Record the phone
model, OS/browser version, battery mode and duration alongside each JSON file;
viewport emulation on a Mac is not evidence of phone performance. Compare early
and late portions with separate resets to investigate thermal degradation.
Repeat background/foreground and pause/resume checks. Use a repeatable recording
through a speaker for physical-microphone comparisons; the Example button tests
the real worklet/worker pipeline but bypasses microphone hardware.

The report contains render callback cost and cadence, plotted age relative to
AudioContext time, plot advance intervals, capture packet delivery age, actual
per-batch worker timings and round trips, queued PCM duration, and counters for
stalls over 100 ms, discontinuities, discarded frames and backlog resets. A stall
counter is one event per uninterrupted stall, not one event per callback. Frame
metrics exclude Settings, hidden/paused periods and the first two seconds after
those transitions. Batch timings include startup and engine loading. Changing
settings does not automatically reset the session: reset explicitly so the
reported current configuration describes the whole measurement.

Percentiles retain the latest 18,000 values per metric; lifetime counts, means
and maxima remain available. Animation callback cadence does not establish that
a frame reached the display. Plotted age excludes microphone hardware latency,
physical display latency and output-device latency; it is not a measured
mouth-to-screen delay. An OS-imposed 30 Hz cadence is not itself a failure.
Use Safari/Chrome rendering traces and real-device observation for presentation
issues; desktop CPU throttling cannot reproduce mobile GPUs or thermal limits.

`npm run build` runs deterministic instrumentation tests (including injected
stalls and bounded storage), live English-playback lag checks for both presets
and formants, and a looping fake Chrome microphone test across the 30-second
recording boundary with pause/resume. The live checks reject p95 plotted age
at or above 650 ms, any sampled age at or above 1500 ms, plot-advance intervals
at or above one second, and unexpected steady-state capture/analysis losses.
Capture gaps during the two-second warmup remain in lifetime counters and
timestamped events (tagged `warmup`); they do not fail the steady-capture gate.
The report retains the latest 256 event details. These are loose
CI regression limits, not validated human-perception targets or a mobile
performance certification. Browser test attachments include JSON reports.

### Voice Tools full-speech regression

`npm run test:voice` replays the controlled 48 kHz English speech comparison on
both desktop and mobile Retina using the production worker, stream, preset
settings, frame consumer and renderer. It also runs automatically with `npm test`
and `npm run build`, including GitHub Actions. The hash-pinned reference contains
original Voice Tools input and processing-clock traces;
CI requires neither the native app nor .NET.

An independent JavaScript FIR/FFT and timestamped normalization reference applies
the corrected DC removal and window-length amplitude scaling. The checks require
spectral error below 0.001 dB for reference bins above -72 dB,
held-maximum error below 0.001 dB, continuous frame timestamps, and at
least 99.99% of rendered plot pixels within one discrete palette step. Expected
pixels are reconstructed independently using the ERB/bucket mapping and
Plasma palette. Tests deliberately change the filter, clock and scale to verify
that the respective guards reject regressions. Reports include numerical metrics
and independent-reference / production-render / difference images.

The frozen original capture is never regenerated by the build or screenshot-update
command. Corrected expected spectra and pixels are computed from its pinned PCM
by the independent JavaScript reference during test preparation.
See `tests/visual/fixtures/voice-tools/README.txt` for provenance and the explicit
original-library recapture procedure. This protects the controlled DSP/display
comparison; it does not establish actual iPhone capture or screen parity.


### Conversational example recording

The app's Example button plays the full 38-second Alice Waters interview excerpt
from BBC Radio 4's The Food Programme, released under CC BY 3.0. Credits and the
source/license links are in `dist/audio/CREDITS.txt` and the speech controls.
`audio/alice-waters.m4a` is mono AAC-LC at 128 kbps, retaining the original sample
rate and complete excerpt, with fast-start metadata. Reproduce it from the linked
original FLAC with `ffmpeg -i original.flac -map_metadata -1 -ac 1 -c:a aac -b:a 128k -movflags +faststart alice-waters.m4a`.
The earlier LibriVox `speech-english.wav` stays unchanged as an independent
regression fixture; numerical/visual oracles are not regenerated for this change.

### Optional voice-feedback capabilities (programmatic API)

Formant overlay settings expose **Formant smoothing** (Off / Light / Strong)
and **Hide uncertain formants** (On / Off). All built-in presets default to
Light (25 ms time constant) and filtering On; Strong uses 60 ms. Formants remain
off initially in Soundglow. These options redraw the existing overlay without
clearing the spectrogram or restarting capture, and are saved in custom presets.
Older saved presets acquire the new defaults without losing their settings.

`window.soundglowAnalysis` also exposes opt-in building blocks. The other
capabilities remain programmatic, with no additional views or automatic analysis.
Recording/replay is not included.

- `new FormantTracker({smoothingSeconds: .03})` consumes existing Praat feature
  rows with `push(row, {referenceIntensity: visiblePeakDb})`. It returns raw and
  smoothed F1–F3, segment continuity, rejection reasons and heuristic quality.
  Quality is not a calibrated probability. Pitch/strength, relative intensity
  and bandwidth gate estimates. Invalid frames, gaps, jumps and backwards time
  break continuity; no stale values or interpolated gaps are emitted. The
  caller supplies the rolling intensity reference. Smoothing is causal in log
  frequency with elapsed-time weighting; the time constant trades flicker for
  lag and defaults to zero in the programmatic API. `filterUncertain: false`
  bypasses pitch/strength, intensity and bandwidth gates, while still rejecting
  nonfinite/out-of-range frequencies and breaking lines across gaps and jumps.
  This does not solve formant identity tracking.
- `new VowelTargets()` stores user-defined `{id, vowel, language, centreHz,
  halfWidthHz}` entries. `relativeTarget({baselineHz, shiftSemitones, ...target})`
  constructs a baseline-relative target. `compare(id, trackedFrame,
  {vowel, language, nowSeconds, maxAgeSeconds: .1})` returns frequency deviation
  and band edges only when the
  context matches and F2 is available. A finite current time is required; missing,
  future or expired frame timestamps reject feedback, and results retain the
  measurement timestamp and age. All times must use the same seconds-based clock.
  Call comparisons on each feedback update. For a delayed overlay, use its
  plotted audio time, or explicitly budget pipeline delay in `maxAgeSeconds`
  when checking against capture time. There are no built-in gender thresholds,
  success scores or rewards. `save(localStorage)` / `VowelTargets.load(localStorage)`
  persist independently of presets; storage/validation errors are explicit.
- `spectralSlice(frame, {firstFrequency, frequencyStep})` takes an owned copy of
  a raw linear-power frame. `bandEnergy(slice, [{fromHz, toHz}, ...])` integrates
  the requested bands with partial-bin overlap. Non-finite/empty geometry,
  uncovered bands and numerical overflow are rejected rather than returning
  zero or NaN. Coverage is the frequency-bin cells, clipped at zero Hz.
  Compare only matched analysis
  units/settings: this is not calibrated SPL, femininity or a vocal-weight score.
- `createClient()` creates a separate lazy worker. `await client.lpc({pcm,
  sampleRate, ceiling: 5500, windowSeconds: .025, order: 10, bins: 512,
  preEmphasisHz: 50})` returns a genuine Praat Burg all-pole envelope,
  coefficients (positive predictor convention, the negation of native LPC
  denominator coefficients), mean prediction-error gain, geometry and timings.
  Dispose the client when finished.
  Input is mono Float32 PCM, at most one second; the entire requested Gaussian
  window must fit. The effective 25 ms window uses 50 ms of context, centered in
  the supplied block. Praat resamples to twice the ceiling, applies pre-emphasis,
  removes the frame mean, applies its LPC Gaussian window and estimates
  coefficients using its existing `VECburg` routine. Frame alignment follows
  native Praat sampling coordinates. The sampled
  response is gain divided by the squared all-pole denominator, in relative
  power units; it is neither the raw spectrum nor calibrated power density.
  Silence yields a zero envelope. Peak picking or confident formant labels are
  deliberately not inferred from this envelope.

All these functions are also importable from `dist/voice-feedback.js` in Node
(except the browser client factory). `engine/voice-analysis.h` contains the
optional C ABI, included with exact engine sources in the GPL source archive.
To vendor a fresh checkout, copy both engine headers into `wasm/`, include them
in the adapter, carry the updated worker protocol/client and rebuild first.
The browser test runs the real worker against the interview audio and verifies
that the homepage and preset remain unchanged. Core tests cover a known AR(2)
resonance, silence, invalid requests, smoothing at different hop sizes, gaps,
identity jumps, targets, storage failures and spectral ownership/energy.


#### Analysis regression references

`tests/lpc-native.cjs` checks pinned **native Praat** LPC coefficients, gain and
all 513 envelope bins for six speech, multi-resonance and noise inputs at
24/44.1/48 kHz, including the default order 10, order 14, pre-emphasis off/50/100 Hz
and 15/25/40 ms windows. Native LPC/Spectrum output is captured independently
of the WASM adapter. The fixture records native executable/version and PCM
hashes; the test verifies the checked-in fixture hash and never regenerates it.
Mean gain divides native summed gain by frame length; native Spectrum FFT
scaling is undone explicitly. See `tests/fixtures/lpc-native.txt` for recapture.
The build also extracts and runs the processor protocol test from the shipped
GPL source archive, checks that it matches the packaged processor, and verifies
that disposal releases both spectrum and LPC resources exactly once.

### Settings consistency

`dist/settings-state.js` owns an independent registry of preset settings, allowed
values, defaults and update effects. Presets are validated against this registry;
the registry is never inferred from one preset. Its immutable state snapshot is
the source for controls, worker requests, overlays and the preset footer.
`updateSettings` handles individual edits and full preset application through the
same transition. Overlay-only edits redraw without restarting analysis; colour
edits repaint retained history. Normalization, axis and history edits reproject
retained spectra without resetting analysis. DSP changes rebuild buffered PCM
in cancellable background jobs on the same serialized worker, prioritizing live
requests, then replace history and the processing cursor together.
Microphone selection, transport, route/layout and developer diagnostics remain
outside preset state. Built-in edits become Unnamed Preset*, whereas edits to a
named custom preset update that preset. Failed storage writes leave an unsaved
configuration visibly unnamed. Existing stored presets are validated/migrated
before use.

`tests/settings-state.cjs` independently checks HTML control coverage, preset
completeness, validation and transition effects. Browser sequences check every
available control against state/preset/footer consistency, saved preset lifecycle,
playing/paused changes, actual worker request options and nondestructive DSP handovers.
`assertSettingsConsistent()` is available for browser test/debug assertions.
The update tests also verify that every packaged page script/style is present in
the immutable release manifest, including optional formant APIs.


### Playback continuity

Source spectra are retained by timestamp and frequency geometry, independently
of canvas size. Retention covers up to 31 seconds with a 32 MiB spectral-power
budget; dense FFTs can shorten that interval. Canvas rows are derived caches,
never resize inputs. Sidebar animation temporarily scales the existing canvas;
the final size is rendered from spectra. Display changes preserve the displayed
endpoint, including while paused. Speech pause preserves queued analysis.

The stream retains up to approximately 32 seconds / 24 MiB of mono PCM in memory.
Analysis changes replay those packets in 100 ms jobs with the requested settings,
while old live analysis continues. One worker serializes both; queued live work
has priority. A revision cancels stale jobs, and a generation rejects old live
replies after the atomic handover. Replay output is bounded to 32 MiB and an
update that cannot complete within 15 seconds is rejected while the active
analysis remains usable. Failed updates restore the committed analysis controls
as an unnamed configuration. Stop, seek, source changes and capture discontinuity
cancel outstanding rebuilds. Audio is neither persisted nor uploaded.

`tests/handover.cjs` checks real WASM replay/fresh equality, cursor continuity,
stale requests, concurrent input, worker serialization and error recovery.
`tests/visual/continuity.spec.cjs` exercises the English recording, animated
sidebar round trips, frozen settings changes and rapid DSP updates; the rebuilt
speech spectra must exactly match fresh analysis. Performance reports distinguish
rebuild work from live delivery and include retained PCM/spectrum byte counts.
These automated desktop/mobile viewport checks do not establish real-phone CPU
headroom; that still needs measurements on physical devices.


The continuity suite also runs a Retina sidebar/display test with 4x Chromium CPU
throttling at a landscape-phone viewport of 844x390 CSS pixels (`slow-retina`).
Normal desktop continuity coverage retains the 1280x900 Retina workload. It preserves the zero-reset and exact paused-pixel
assertions. Full canvas readback/hashing happens only while paused so the test
itself does not stall live capture. The renderer caches dB levels independently
of canvas dimensions and frequency positions independently of audio frames;
normalization changes invalidate level caches, while mapping/resize invalidates
row/position caches. Native/independent rendering oracles still check the result.
Diagnostics Reset is asserted in its actual click event; sampling is then checked
to resume, rather than incorrectly requiring measurements to remain empty.

Worker request tests keep a history of observed configurations: old live requests
and new replay requests legitimately interleave until a configuration commits.
Assertions check a matching immutable observation and the committed settings,
not a mutable "last request" slot. A second constrained-CPU project (`slow-desktop-retina`) retains the original
1280x900 Retina workload. Continuity tests attach diagnostics so a processing
reset can be distinguished from capture-packet loss around pause/resume.

Speech pause suspends the audio context but still accepts packets already posted
by its worklet, preventing a missing packet on resume. Paused microphone input
is deliberately discarded. Retired input ports are ignored before reading any
context state, including late messages after Stop. The frozen-view regression
compares only source frames up to the displayed endpoint: queued analysis is
allowed to finish without changing that view.

Short UI-delivery bursts are buffered for catch-up: crossing 0.5 seconds emits
`backlogHighWater`, while a hard two-second PCM limit still triggers a bounded
reset for sustained overload. The output queue retains three seconds of frames
so catch-up does not discard results before the renderer can consume them.
Existing lag assertions are unchanged. A blocked-worker regression verifies
continuous frame timestamps through an eight-packet burst, and a separate test
still requires overload resets beyond the hard bound.

Worker catch-up groups up to four unchanged analysis blocks in one message, rather
than analyzing a longer finite sound (which can change Praat’s frame phase). A
real WASM regression checks exact frame-power equality and matching timestamps
against normal single-block deliveries. The shipped GPL source archive includes
the updated processor and worker.

History commits share cached source dB levels and exact peak values with live
painting. Frequency corrections are cached separately (16 geometries maximum).
Background rebuild replies prepare these levels one analysis block at a time,
so the atomic commit does not repeat logarithms across the full retained history.
Pre-emphasis, spectral units and frequency geometry form the cache key; raw power
remains unchanged. Cache entries follow the lifetime of retained power buffers.
Performance reports include `historyCommitMs` and `historyProjectionMs` to isolate
these operations from normal animation callbacks. The full-retention regression
checks that no source-level cache misses occur inside either settings commit,
then confirms continuous playback; native/WASM numerical tests still apply.

Chrome may advance `currentFrame` across a few worklet callbacks on resume.
The capture worklet represents clock gaps of at most one 100 ms packet as
explicit zero samples, preserving timestamps without inventing a signal. Reports
record `captureClockPadding` with the exact padded sample count and duration.
Larger jumps discard partial capture and remain discontinuities; explicit seek
and microphone-resume resets also clear the gap tracker. A deterministic worklet
regression reproduces the three-quantum jump observed in CI at all supported test
rates, compares every sample and timestamp, and verifies the long-gap bound.

## Feature workspace

View tabs sit outside the shared transport toolbar on desktop and mobile.
Desktop transport actions preserve the settings sidebar; on mobile, they return
to the chart because settings replaces it. Home explicitly leaves settings.
Settings separates audio input, conditional example playback and the active view.
Spectrogram analysis and advanced colour controls use initially collapsed sections;
these remain part of spectrogram presets. Each view keeps its own settings scroll
position during tab switching. Pitch band limits are editable; chart labels and
band-name inputs are omitted.

Spectrogram and Pitch share microphone capture, example playback, pause/resume,
seeking and diagnostic controls. Switching tabs preserves the transport and audio
clock. Spectrogram presets retain their existing storage and settings. Pitch has
its own validated `soundglow-workspace-v1` state: 50–450 Hz display, 10 seconds of
history, optional causal smoothing and three editable reference bands (85–145,
145–175 and 175–275 Hz). Pitch preferences do not edit spectrogram presets.

`feature-state.js` owns feature validation and pitch display gating.
`workspace.js` consumes the public `soundglowSession` interface for capture
notifications, bounded retained PCM and serialized worker requests. Pitch starts
lazily on first use, processes the original audio through Praat's pitch analysis,
and retains 31 seconds of scalar measurements. It does not open another microphone
or own a second WASM instance. Analysis is queued through the existing persistent
worker. The spectrogram continues in the background in this first implementation;
this keeps switching immediate and its frozen/history behavior unchanged.
Silence, uncertain measurements, missing frames and octave jumps break the trace.
Band shading uses editable references, rather than deriving a classification.
All feature assets are included in the versioned offline shell.

Pitch presets include Soundglow, Voice Tools and Praat, plus named local presets with
automatic edits, rename and delete. Built-in edits become Unnamed Preset*; deleting
a named pitch preset returns to Soundglow. Trace settings are shared renderer
parameters, not preset-specific code. See [pitch drawing evidence and limitations](docs/pitch-voice-tools.md)
for the original-library oracle, audio probes and remaining detector differences.

The [Praat pitch drawing notes](docs/pitch-praat.md) document the inspected native
source, automatic curve/speckle rules, logarithmic display and half-frame caps.

### Browser debug reports

Bounded local reports and optional, explicitly enabled Sentry reporting are shared
with DoReGo through `@ldayton/browser-diagnostics`. See [setup, privacy and tests](docs-diagnostics.md)
and the [shared package release workflow](../../packages/browser-diagnostics/README.md).
No remote collection is configured by default.

## Shared offline workers

`../../packages/browser-offline` is the canonical workspace source for
`@ldayton/browser-offline`, consumed by Soundglow and DoReGo.
Both builders inline the same runtime into `sw.js`; no runtime CDN, registry,
or sibling checkout is needed. Both build fingerprints include runtime source.

| Contract | Shared core | App adapters |
| --- | --- | --- |
| Complete releases | Complete-file checks, staged writes, deadlines, atomic batches or per-file SHA-256 | Manifest schemas and validation; commit metadata last |
| Concurrent updates | Deduplicate/serialize preparations; drain failed writes before retry or cleanup | Release discovery and explicit update messages |
| Active tabs | Scope filtering, protect unknown clients, ten-minute grace | Cache names, retained releases/sound banks, metadata formats |
| Navigation | Try current release, skip invalid fallbacks, remember selected release | Fallback ordering and document consistency checks |
| Activation | Install preparation before skipWaiting; claim requests without reloading documents | Soundglow immutable assets; DoReGo installation inventory refresh |

Soundglow's adapter is `scripts/service-worker.cjs`. It retains immutable release,
engine and media URLs, SHA-256 validation, explicit update preparation and shared
asset eviction. DoReGo retains its separate interface/sound caches and optional
133-file sound download. Existing metadata, cache prefixes and messages are unchanged.

Edit shared source in this monorepo, run root `npm test`, and commit both adapters
and shared code together. Root `npm ci` installs all workspaces. No package archive
synchronization or separate checkout is needed.

For migration testing, `LEGACY_WORKER_SOURCE=/absolute/path/to/previous-worker.cjs
npm run test:updates` uses the old generator for the first fixture, then exercises
the new worker during real microphone processing and offline example playback.
