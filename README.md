# Soundglow

A mobile-friendly microphone spectrogram. Praat's signal processing runs locally
in WebAssembly inside a persistent Web Worker; audio is never uploaded.

## Run locally

```sh
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765 and allow microphone access, or choose **Example** to
hear the bundled 30-second English recording and watch its spectrogram. HTTPS
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
Pending PCM is bounded to 500 ms and output to 200 frames; slow devices drop
old input and preserve a timestamp gap instead of accumulating unbounded delay.
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
original notices. The bundled English recording is a public-domain excerpt of
Peter Yearsley's LibriVox reading of *Alice's Adventures in Wonderland*. Details
are in [audio credits](dist/audio/CREDITS.txt).

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
peak levels in one-second buckets (default five), with a selectable decay per
frame, using float arithmetic. Timing can follow audio frame time or processing
wall time. Audio time gives reproducible replay independent of processing speed;
wall time matches the original app's bucket expiry, including elapsed pauses.
Historical frames keep their original normalization. Dynamic range is
available for fixed and visible-history colour levels; held-peak levels use a
relative 0–1 scale. These are display measures, not calibrated acoustic SPL.

`tests/voice-settings.cjs` compares 24 original Voice Tools binary-derived DSP
fixtures plus six independent original polyphase speech/noise/impulse fixtures
at 24/44.1/48 kHz into 8/16 kHz. Integer-ratio resampling matches within 0.001 dB;
fractional 44.1 kHz native phase accumulation/wrap rounding leaves differences
bounded in the fixtures by 0.7 dB in weak bins above -72 dB and 0.12 dB above
-52 dB. This does not establish complete iPhone parity: platform capture
processing, normalization scheduling and overlay algorithms can differ. All
computation remains local.

### Named custom presets

Use the pencil beside Preset and enter a name to store the current
display and formant settings in this browser's local storage. Named presets appear directly in the dropdown alongside the built-in presets.
Choose Create or Rename beside the name field to confirm; Enter also works. Selecting one restores its settings; the last selected
preset is restored on reload. Changing settings while a named custom preset is selected updates that preset
in local storage. Built-in presets stay unchanged; modifying one creates
Unnamed Preset*. Failed writes leave the changes unnamed and preserve the stored copy.
Editing an existing name renames that preset; the pencil also exposes Delete.
The * character is reserved for the unsaved indicator and is not allowed in names. Built-in presets
cannot be renamed or deleted. Deleting the selected custom preset immediately applies Praat and persists that selection. Names must be unique (ignoring case); built-in names are reserved. Storage failures
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
