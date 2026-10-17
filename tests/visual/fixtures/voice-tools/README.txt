Voice Tools full-speech regression oracle

These are independent, frozen measurements from the installed Voice Tools
2.0.186 DevExtras.Common.Audio.dll executed with Apple Accelerate on macOS.
No proprietary executable or DLL is checked in. manifest.json records its hash,
input/output hashes, frame geometry and palette provenance.

speech.f32.gz is the SAME 48 kHz mono float32 input used in the manual comparison:
Soundglow's original checked-in 24 kHz English fixture resampled ONCE with ffmpeg,
including right context. That resampling is not rerun during tests. The displayed
interval is 0–10 s; frames beyond 10 s supply rendering context. The speech is
Peter Yearsley's public-domain LibriVox recording; see dist/audio/CREDITS.txt.

reference.json.gz contains original-library shifted-dB spectra, normalized
spectra, held maxima, frame timestamps and PROCESSING wall-clock timestamps
(converted from .NET UTC seconds to Unix milliseconds), plus an independent
Matplotlib 3.10.7 Plasma RGB8 palette (CC0). The same processing-clock trace is
injected at the production acceptFrames boundary. This isolates clock semantics
from test runtime, scheduling and run-start phase. The renderer itself runs at
60 deterministic ticks/s, using real production worker, stream, preset controls,
normalization and rendering functions.

The expected canvas is reconstructed independently from original normalized
spectra using the recovered 4 kHz ERB axis, +1 bucket offset, held 16 ms frames
and fixed Plasma palette. It does not call Soundglow's axis or color helpers.
The tests check numeric FFT levels, wall-clock holds, frame count/time, and
rendered RGBA palette indices. No screenshot golden is derived from Soundglow.
Each run attaches native-reference/actual/difference panels and metrics, which
GitHub Actions already uploads with its normal verification artifacts.

Run npm run test:voice (desktop and mobile Retina), or npm test / npm run build.
Synthetic mutations verify that changing resampling, clock or axis triggers the
relevant comparison guard. Existing 44.1 kHz synthetic tests remain separate;
this particular oracle fixes a 48 kHz input to retain the measured strict match.
It is not an actual iPhone app screenshot and excludes microphone/OS processing,
pitch overlays and real-time scheduling. Device screen parity is not established.

Reference maintenance
Do not update these files from Soundglow output or with --update-snapshots.
A change to the native oracle requires a fresh original-library capture and a
review of the measured differences. capture/ contains the original .NET 10
reflection harness used for this capture. On macOS with that app installed:
  dotnet build tests/visual/fixtures/voice-tools/capture
  dotnet run --no-build --project tests/visual/fixtures/voice-tools/capture -- \
    tests/visual/generated/voice-speech.f32 /tmp/voice-native realtime \
    > /tmp/voice-native.json
Use the documented DLL hash/version (or explicitly review a new version).
The final argument paces original normalization over wall time. Capture output
also includes resampled PCM and filter configuration. Independently review the
first 631 native frames, convert clockTimes from .NET seconds to Unix milliseconds
by subtracting 62135596800 before multiplying by 1000, retain the source PCM and
independent Plasma palette, then repack and explicitly revise manifest hashes.
The test preparer only verifies/decompresses assets and cannot approve or
regenerate an oracle. The DLL is required only for reference recapture, not CI.
