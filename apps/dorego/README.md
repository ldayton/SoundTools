# DoReGo

A local vocal exercise studio. Build a warm-up, follow the guide notes, and export MIDI or an MP4 with synchronized sound and keyboard visuals.

## Run

Requires Node.js 22.12+ and npm. Video export also requires FFmpeg and the Playwright Chromium browser.

```sh
cd ~/source/DoReGo
npm ci
npm run setup:browser
# macOS, if FFmpeg is not already installed:
brew install ffmpeg
npm run dev
```

Open **http://127.0.0.1:4317**. The server binds to loopback only. Set `PORT` to change the port, or `FFMPEG_PATH` to use a specific FFmpeg executable.

For a production build:

```sh
npm run build
npm start
```

No account, API key, microphone access, or hosted service is required. CC BY 4.0 bitKlavier Grand Steinway D recordings are bundled locally in public/samples/bitklavier. Dependencies and Chromium need to be downloaded once during setup. Your latest exercise lives in this browser's local storage; exported video files temporarily live on this computer.

## Practice

- Eight exercises: **Arpeggio & Scale** (default: E3–E5, 150 BPM), **Octave Arpeggio**, **Rossini Scale**, **Five-Note Scale**, **Pentatonic Sequence (Threes)**, **Major Scale**, **Fifth Glide**, and **Octave Glide**. Phrase shape and movement between rounds are separate controls. Rossini keeps its fixed phrase; Major Scale stays on its selected key.
- Choose your lowest/highest vocal notes, phrase contour, and round progression. Major Scale instead uses a single Key selector for the starting note, including its octave; the other exercises move by semitone through your range.
- Click anywhere on a desktop note field to open a note grid organized by octave; typing is disabled. Enter or Space also opens the picker. Mobile uses snapping swipe wheels. Arrow keys move by semitone and Page Up/Down by octave.
- Transpose the key and range together with the minus/plus buttons.
- Adjust tempo (60–240 BPM), rounds, inter-round rests, count-in, and volume. Pitched phrases use the sampled bitKlavier Steinway Grand with fixed natural articulation. Glides use sustained VSCO cello recordings, with the usual piano chord introduction. All beats are quarter-note beats. The default count-in is two bars of 4/4 (eight beats), displayed as two labeled four-beat groups with the active beat highlighted and each downbeat accented.
- Piano samples warm up automatically before playback. A “Loading...” indicator appears immediately while preparing; Play becomes available as soon as the selected exercise is ready; failed loads offer a retry.
- Exercise, range, tempo, direction, and other preferences are saved automatically in browser local storage and restored on return. New users start with Arpeggio & Scale E3–E5 at 150 BPM.
- Tempo −/+ buttons step by 5 BPM. Repeats count additional passes (None means one pass); repeats and rest use stacked arrows on desktop and None–4 dropdowns on mobile.
- Volume is independent beneath tempo and can change during playback with a short gain ramp. Count-in clicks stop when the exercise begins.
- Play/pause, scrub, restart, and fullscreen. Space toggles playback, R restarts, F toggles fullscreen when a form control is not focused. Tempo is independent: change it at any time with the slider, numeric field, or −/+ buttons. Playback keeps the current round and beat, including through count-ins, rests, and cello glides. Volume also changes live without restarting, in its own row below tempo. Other exercise edits reset playback.

On phones, the practice canvas uses a taller layout with larger keys. The keyboard focuses on the vocal phrase, keeps key sizes fixed for the whole exercise, and slides between rounds. Intro chords remain audible but are not visualized on mobile. Desktop and exported video retain the wide layout.

Note names stay visible for the full rhythmic slot. The highlighted key follows the sounding duration, so detached notes have a short unlit gap. Repeated notes get a fresh progress bar. No pitch detection or singing assessment is implemented.

## Exports

Exports are CLI-only; the practice UI has no export controls.

```sh
npm run export -- midi --output exercise.mid
# With the local server running:
npm run export -- video --output exercise.mp4
# Optional partial ExerciseSpec JSON and video quality:
npm run export -- video --spec exercise.json --height 1080 --output exercise.mp4
```

Without a spec file, exports use Arpeggio & Scale E3–E5 at 150 BPM. Use `--url` for a different local server URL. Ctrl+C cancels a video export.

**MIDI** exports directly to the requested file without a running server. It contains guide notes, tempo, and percussion-channel count-in/metronome clicks when enabled. A timed all-notes-off controller preserves the final slot. Guide volume/timbre and visual preferences are preview/video settings; MIDI uses a standard piano program and fixed guide-note velocity for downstream editing.

**Video** is rendered locally at 720p or 1080p, 30 fps, as H.264/AAC MP4. It includes the same count-in, note sequence, rests, guide sound, and visual settings as practice. Audio is rendered offline and gets an 0.8-second release tail. Each image is computed directly from `frameIndex / fps`, so exporting does not depend on recording real-time playback or keeping a tab foregrounded.

One video renders at a time. The CLI reports progress and saves the completed MP4 to the requested output path. The server removes temporary exports after one hour.

Browser visuals update on animation frames. Exported visuals are quantized to video frames; sound is scheduled on the audio timeline. Bluetooth or other output-device latency can affect perceived live synchronization.

## Architecture

`src/music.ts` validates the exercise and generates one immutable-by-convention sequence in quarter-note beats. Each note has a MIDI pitch, onset, sounding duration, rhythmic slot, repetition, and ID. Display spelling is separate from pitch.

- `stateAt(exercise, seconds)` computes count-in, current note, upcoming notes, rest, and completion at any time.
- `src/render.ts` draws that state to Canvas without wall-clock reads, accumulated animation state, or random effects. The practice UI and headless export use the same function.
- `src/audio.ts` uses Tone.js and an explicit AudioContext epoch. Live playback schedules one second ahead at 100 ms intervals in a playback-latency context. Pause/resume retains the position within a piano sample; stopping fades out over 20 ms. Native buffer sources handle piano envelopes, stop times, and cleanup on the audio clock. Output timestamps align the live display with the device clock where supported. A final limiter protects loud chord sums. Offline audio uses the same scheduling function and encodes PCM WAV.
- `src/midi.ts` converts beats to the MIDI library's PPQ and writes a file with Tonejs/Midi.
- `server/exporter.ts` runs an isolated Playwright page, renders WAV, streams exact-time Canvas frames to FFmpeg while honoring stream backpressure, checks the encoder exit status, and cleans up temporary audio. The browser page never needs to access arbitrary files or URLs.
- `server/index.ts` supplies the local API, input validation, loopback binding, host/origin checks, and Vite development middleware or built static assets.

The first version uses fixed tempo per exercise. Changing tempo rebuilds all consumers. It does not yet implement tempo ramps, arbitrary MIDI import.

## Verify

```sh
npm test
npm run build
# Start the app in another terminal, then:
npm run test:e2e
```

The model tests cover all keys and patterns, boundary states, range constraints, invalid inputs, MIDI timing, and clicks. End-to-end tests cover desktop/mobile layout, playback and pause/resume, saved exercise, transposition, MIDI download, rendering the same frame after out-of-order seeks, a real MP4 export with audible audio, expected guide pitches at their scheduled times, an encoded video frame compared with the shared renderer, export cancellation, concurrent-export rejection, and cross-origin protection. They require Chromium, FFmpeg, and ffprobe, and save screenshots and output files under ignored `work/`. Use `TEST_URL` to test another local port.

All runtime dependency versions are pinned by `package-lock.json`. The app does not copy source from the reference visualizer projects. Its dependencies retain their respective licenses.

### Generated exercises

**Within each round** controls the phrase, with a small preview of its actual contour. Arpeggio & Scale, Octave Arpeggio, Five-Note Scale and Pentatonic Sequence (Threes) offer **Rising first** and **Falling first**; these phrases already return to their starting note. Glides offer **Up**, **Down** (eight beats each, no return), or **Up & back** (fourteen beats). Rossini has a fixed contour, so this control is hidden.

**Between rounds** independently chooses **Rising**, **Falling**, or **Rising then falling**, with diagonal contour icons, one semitone at a time. The starting-note preview reflects the actual practice targets, including phrases that start high. The same phrase, rhythm and starting chords are retained throughout the sweep. The turnaround key is played once; a one-key range plays one round per repeat and hides the between-round controls while remembering the selection. Rossini supports all three progressions while keeping its fixed melody.

**Pentatonic Sequence (Threes)** climbs in four overlapping groups of three major pentatonic notes,
then descends stepwise home: C4–D4–E4 | D4–E4–G4 | E4–G4–A4 | G4–A4–C5–A4–G4–E4–D4–C4.
The first eleven notes each last one beat. The return, including the top C5, uses
**long–short–long–short–short–long**: C5 (2), A4 (1), G4 (2), E4 (1), D4 (1), C4 (2).
**Falling first** mirrors this shape and rhythm in pitch, descending in groups of three
before climbing stepwise back to its starting note. Under More options, repeat the
**Highest note** (or **Lowest note**) and/or **Home note on return** for four strikes each;
the fourth strike retains the two-beat hold. It uses the usual starting-note chords and
independent between-round progression, and requires a range of at least one octave.

**Major Scale** uses Key as its starting note and generates one octave **Up**, **Down**, or **Up then down**. It repeats on that key, so range and between-round progression controls are hidden.

Preferences are saved automatically. Legacy descending selections become falling-first phrases with lower round progression; legacy combined selections become rising-first phrases with higher-then-lower progression. CLI JSON can specify `direction` for phrase orientation and `progression` (`up`, `down`, `both`) independently. Omitting `progression` retains the old coupled CLI behavior for compatibility. For glide phrases and Major Scale, `direction: "both"` means up and back; other vocal patterns use `both` only for progression. Existing saved upward glides migrate to Up & back, preserving their sound.

## bitKlavier Grand

Piano exercises and starting cues use bitKlavier Grand Piano Bar (Steinway D). Older saved sound choices are automatically migrated to bitKlavier. Main sustained recordings retain all 16 velocity layers and stereo 44.1 kHz / 16-bit resolution, losslessly converted to FLAC. Only the samples needed by an exercise load into memory. The browser adaptation uses nearest sampled pitches, equal velocity zones, and an envelope release; it does not implement the original instrument's pedal, sympathetic resonance, or release samples. Playback and video export use the same adaptation.

Source and full credits: https://bitklavier.com/the-bitklavier-grand/ . Recorded by Andres Villalta, played by Matt Wang, produced by Dan Trueman. Licensed CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Attribution and transformation details are bundled in `public/samples/bitklavier/NOTICE.txt` and linked from Help.

Rebuild the assets with `python3 scripts/setup-bitklavier.py` (requires FFmpeg; downloads the approximately 1 GB source archive into ignored `work/`).

Regenerate the checked-in web variants with `python3 scripts/prepare-web-samples.py` (requires FFmpeg). These retain the original stereo sample rate, bit depth, and exact PCM prefix. The web directory is versioned; bump it in the script, loader, and asset tests whenever recordings or preparation change, so browser caches cannot serve old variants. HTTP caching handles encoded files; decoded buffers live only for the current page session.

### Cello glides

Fifth Glide and Octave Glide use CC0 VSCO 2 Community Edition cello-section recordings. Each round begins with the usual six-beat piano chord introduction (when starting chords are enabled), then a continuous slide. Up & back takes fourteen beats: hold two, rise four, hold two, return four, hold two. Up and Down take eight beats: hold two, slide four, hold two. Rounds move by semitone in the selected progression while keeping the complete glide inside the chosen vocal range. Up glides start low and finish high; Down glides start high and finish low. Up & back returns to its starting note. Round progression is independent of glide shape: Higher then lower repeats the selected glide through the range and back, without repeating the turnaround key. The starting-chord option works as it does for the other vocal exercises.

One sustained recording, chosen nearest the glide's pitch midpoint, plays throughout the phrase with smooth audio-clock pitch automation. Samples load only when needed; crossfaded sustain loops support slower tempos, and pause/seek resumes at the correct pitch and sample position. The keyboard follows the sounding pitch with a moving marker; Current/Next still show round targets. Video uses the same cello playback; MIDI exports a separate cello track with pitch bends and a declared octave bend range.

Source: https://versilian-studios.com/vsco-community/ and https://github.com/sgossner/VSCO-2-CE . The thirteen quiet sustained-vibrato recordings are losslessly converted to FLAC using the publisher's SFZ pitch mapping. License and adaptation details are in `public/samples/vsco-cello/NOTICE.txt` and linked from Help. These are digitally bent sustained ensemble recordings, rather than recorded portamento transitions.

`npm run test:glides` checks desktop/mobile controls, persistence, pause/resume inside a glide, and browser-rendered audio at 60 BPM, including held pitch accuracy, sustained output through looping, headroom, and silent release.

### Audio reliability checks

`npm run test:audio` instruments live browser playback of a wide-range bitKlavier exercise at full volume. It checks bounded source count, sample tail memory retention, native scheduling through a 400 ms main-thread stall, non-silent output without clipping, and silent cleanup after pause. A shared queue limits combined piano/cello fetch-and-decode jobs to four, including overlapping exercise preparations. Changing exercises aborts obsolete fetches and discards queued work while preserving shared recordings; an already-running decode keeps its slot until it finishes. Live practice prepares for 60 BPM (including pitch shift and release), so tempo changes need no loading. Versioned two- and five-second lossless piano variants cover fixed web timing; longer custom CLI notes and other velocity layers fall back to full originals. Longer cached variants also cover shorter notes. Unused decoded piano buffers are evicted above 128 MiB. An exercise that itself needs more than that budget keeps its required samples. Cello normalization and loop preparation operate in place, avoiding a second full PCM buffer. Original recordings remain unchanged. Tests cannot certify the absence of glitches at physical speakers or external audio devices.

`npm run test:tempo` checks live tempo changes during count-in, piano notes, and cello glides, verifies that sounding sources continue and beat position is retained, and checks paused changes, slider/buttons/typing, and persistence. The player uses a beat clock with tempo history for output-latency alignment, cancels only future scheduled voices, and retimes active note releases and glide curves on the audio clock. Practice has no wall-time duration cap when slowing down; CLI/video generation retains its ten-minute limit.

`npm run test:lifecycle` injects controlled faults into real browser playback: audio suspension and recovery, page restoration and freeze events, a delayed obsolete startup rejection, an audio clock stuck while reporting running, a 1.9-second scheduling stall, context closure, rapid play/pause, and completion with animation callbacks disabled. The player owns playback state and completion; drawing only observes it. Healthy hidden playback continues. Interrupted or frozen sessions preserve their place and require Resume; missed scheduling coverage pauses at the last safe checkpoint instead of skipping the exercise. Old startup results cannot alter a newer session. A closed context is recreated on the next start. These checks simulate lifecycle conditions; actual mobile screen locks, incoming calls, and OS sleep still need device testing.

### Desktop and cross-browser checks

Run `npm run setup:browsers` once, then `npm run build:pages && npm run test:browsers`. The matrix runs the desktop, Pages, lifecycle, and offline suites sequentially in Chromium, Firefox, and WebKit and writes `work/browser-results.json`. Use `TEST_BROWSERS=firefox,webkit` for a subset, or `TEST_BROWSER=webkit npm run test:desktop` for one suite. Do not rebuild the static files while these tests run.

The desktop suite checks real piano/cello PCM, rapid play/pause and voice cleanup, live tempo/volume, pointer seeking, viewport changes, tab changes, exercise/range replacement, persisted preferences, and stale failed sample loads with retry. Headless tab changes do not prove native window visibility behavior. For an agent-assisted native check, run `HEADED=1 NATIVE_WINDOW_TEST=1 npm run test:desktop` in an interactive terminal, minimize/restore/zoom the dedicated test browser at its checkpoint, then press Enter; the suite verifies continued progress and saves a screenshot. Lifecycle fault tests remain simulated; WebKit coverage uses Playwright's WebKit build rather than the installed Safari app. Firefox's simulated reconnect can omit the online event for a document opened offline; the offline test explicitly delivers that signal, and focus-based recovery was checked separately. On macOS the Firefox harness isolates test-process app data to avoid the protected-profile launch issue without changing browser permissions.

## GitHub Pages

The public site is https://ldayton.github.io/DoReGo/ . `.github/workflows/deploy.yml` tests, builds, and deploys each push to `main`; it can also be run manually from Actions. Repository Settings → Pages must use GitHub Actions as the source. Failed checks prevent deployment.

`npm run build:pages` produces `dist-pages/` with the `/DoReGo/` base path. `npm run test:pages` starts a static preview and verifies piano playback, sample paths, defaults, credits, and the absence of export controls. Install the Playwright Chromium browser first with `npm run setup:browser`. The Pages site supports practice. MIDI and video exports are CLI-only; video requires the local FFmpeg rendering server. `npm run build` and `npm start` continue to run the full local app.

## Offline practice

In a production build, click **Download for offline use** below the exercise builder while connected. The download saves all 133 web piano/cello recordings (about 33 MB), along with the interface. Once the status says **Available offline**, the app can reopen and play any exercise without a connection. If files are missing while disconnected, the download button is disabled and the status says “Internet required to download”; reconnecting enables it again. Browser installation / Add to Home Screen is optional. Preferences remain in local storage.

Downloads use two concurrent requests, preserve completed files on cancellation or interruption, and verify the cached interface and every recording before reporting readiness. Playback also saves fetched web recordings for later reuse. The original 401 MB piano bank and CLI export services are excluded. No audio decoding is performed by the download itself. Storage persistence is requested after a successful download but is browser-controlled; clearing website data or browser eviction removes offline availability. Offline availability is rechecked when returning to the app; missing sound files bring back the download button.

The build generates a service worker and sound inventory under the configured base path. Interface versions are cached together; sound caches are keyed by the recording contents and reused across interface-only updates. Online navigation/refresh revalidates a small inventory, prepares the entire new interface before serving it, and falls back to a complete saved version if the network or deployment fails. Workers activate immediately without reloading documents or touching audio. Each open tab keeps its own interface and sound-cache version; caches still used by live tabs are retained, with a ten-minute grace period for pending navigations. A changed sound bank requires another offline download. The worker only manages DoReGo caches, not other projects on the GitHub Pages origin.

Offline registration is disabled in `npm run dev` to avoid stale development builds. Test the production build with `npm run build && npm start`; after rebuilding an already installed version, refresh to load the new interface; other open tabs can continue their exercises. `npm run build:pages && npm run test:offline` verifies cancelled/interrupted downloads, resuming, single-tab refresh into a new JavaScript version while another tab keeps playing, failed-deployment fallback, disconnected reopening, all seven exercises at both range extremes and 60 BPM, and missing-file detection/repair. Phone screen locking and audio interruptions remain separate from offline storage and require real-device testing.

### Browser debug reports

The collapsed Debug reports section exports bounded technical reports locally.
Configured production builds automatically collect technical diagnostics with Sentry. Audio and recordings are excluded. See [diagnostics setup and shared code](DIAGNOSTICS.md).

### Shared offline runtime

Both apps embed the same `@ldayton/browser-offline` workspace package in their
workers. Its canonical source is `../../packages/browser-offline`; dependencies
are installed with `npm ci` at the monorepo root. Shared-runtime changes contribute
to the interface fingerprint, so runtime fixes create a new interface generation.

The core owns deadlines, complete-file checks, serialized/deduplicated preparation,
live-client protection, navigation fallback and worker lifecycle. This app's
`scripts/offline-worker.ts` retains sound-cache policy, manifest validation and HTML
consistency checks. Installation still refreshes its inventory from the deployment;
it does not assume a cache populated by an older worker is sufficient. Existing
cache names, client records and `using-cache` messages remain compatible.

Edit shared source in the monorepo, run root `npm test`, and commit both adapters
and the shared implementation together. No package archives or sync step is needed.

`LEGACY_WORKER_PATH=/absolute/path/to/previous-sw.js npm run test:offline` tests an
actual previous worker's cache and live tabs migrating to the shared-runtime worker.
The normal test also waits for controller replacement in both tabs before testing
failure fallback, rather than accepting the old worker's active state.
