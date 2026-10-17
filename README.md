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
