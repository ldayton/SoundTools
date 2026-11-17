# Local piano sound trial

Run from the repository root:

```sh
npm run trial:piano --workspace=dorego
```

Open http://127.0.0.1:4365/. This is a separate local tool, not part of the shipped app,
offline downloads, or production sample bank. It does not change saved app settings.
FFmpeg is required (`brew install ffmpeg`). Generated files live in ignored `work/piano-trial/`.

Compare original stereo, averaged mono, and each channel separately on six recorded notes,
using the melody or starting-chord velocity layer. The latter plays a single sample from
the layer used by starting chords, not a chord. The optional three-note phrase shifts
that same sample by −1, 0, +1 semitones, like the production sampler's nearest-note mapping.

All files remain 44.1 kHz, 16-bit FLAC. Channel extraction preserves the original PCM;
averaging is quantized once with triangular dither. No normalization, EQ, denoising or
resampling is baked into the files. Loudness matching uses whole-clip RMS, with common
peak headroom across comparisons. This approximates equal loudness; it is not a perceptual
loudness standard. Matching can be disabled to reveal cancellation's natural level loss.
The player uses identical attack/release envelopes for every variant and stops when hidden.

Use your usual output devices and comfortable volume. Compare D♯5 and F♯6 against C4.
Listen for buzz during the steady part separately from a click when starting or stopping.
This trial tests channel treatment; it does not reproduce the full production mixer or
prove a cause for a device-specific artifact. Original stereo recordings remain untouched.

Checks (prepare first):

```sh
npm run prepare:piano-trial --workspace=dorego
npm run test:piano-trial --workspace=dorego
```

Checks verify source hashes, exact channel extraction, summed PCM, output format and duration,
matching/headroom, browser playback, cancellation of a pending load, retry after failure,
mute, pitch-shifted phrases, decoding at both common device rates and narrow/wide layouts.
Browser test output is muted independently of the computer's volume setting.

Recordings and adaptations: see generated NOTICE.txt; bitKlavier Grand, CC BY 4.0.
