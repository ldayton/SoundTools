# Voice Tools pitch drawing investigation

Local investigation, 2026-10-19. No proprietary assemblies or recovered code are
redistributed. The reference fixture records the installed audio library's SHA-256.

## Evidence and scope

The installed Voice Tools application was opened on this Mac. Its pitch settings
show a 50–500 Hz default range. Recovered method calls and constants in its installed
`ChartPitchView` and `ChartBaseView` establish:

- `Pitch_Snapshots` has 100 ms buckets, with timestamps at bucket centers.
- The collection uses consolidation mode 2: after the first bucket, choose the
  measurement closest to the immediately preceding populated bucket. If that bucket
  is absent, average the measurements. This is not exponential pitch smoothing.
- Valid observations are joined across up to 800 ms, with an additional one-screen-
  pixel allowance in the original renderer. No octave-jump break is applied here.
- The chart uses a polyline with Skia corner rounding of 20 physical pixels, a
  2-display-unit stroke and 5-display-unit marker diameter. Points are drawn for
  each populated bucket. Original colors are red and blue.

Corner rounding follows the geometry described by Skia's public implementation:
https://github.com/google/skia/blob/main/src/effects/SkCornerPathEffect.cpp
It trims up to half each neighboring segment and joins with a quadratic curve;
it is not a cubic spline, and it does not introduce overshoot.

`tests/fixtures/voice-tools-pitch.json` contains original-library grouping results
for five directly specified pitch sequences and six audio-derived sequences.
The audio probes cover steady harmonics, steps, glide, vibrato, silence gaps and
8 seconds of the existing Alice Waters example (see `dist/audio/CREDITS.txt`).
Praat supplies the same voiced pitch observations to both implementations. The
original installed `TimeBasedFloatSamples.AddSample` supplies expected results;
Soundglow does not generate those expected values.

These are drawing/data-grouping comparisons, not pitch-detector equivalence.
Voice Tools uses a YIN detector; Soundglow continues using Praat. Identical audio
can therefore produce different voiced samples before grouping, including different
octave or unvoiced/consonant errors. Matching the line geometry does not remove
those detector differences.

## Live-input limitation

The native window stayed blank during attempts with the Teams virtual microphone,
including after restart and duplex routing. The loopback driver itself returned
nonzero input for both synthetic audio and speech. Thus a microphone-to-screen
match in Voice Tools has NOT been established. The temporary input/output routes
were restored. An offline attempt at the original detector also returned no voiced
frames, so it is not used as evidence or included in the regression oracle.

## Preset implementation

Both Soundglow and Voice Tools are parameter collections of the same renderer.
Advanced trace controls expose grouping size/method, gaps, jumps, corner radius,
line width and marker size/visibility. Voice Tools has no dedicated drawing path.
Soundglow retains its existing settings and high-contrast colors; the Voice Tools
preset also keeps those colors and omits the removed chart labels.

Differences remaining: Praat detection, palette/background, chart margins, strict
800 ms gap threshold (the native renderer adds a one-pixel allowance), and default
Soundglow axis labeling. This is a close geometry match, not a pixel-parity claim.

## Reproduce the independent grouping capture

Requires the installed Mac app, Node, FFmpeg and .NET 10. From the repository root:

```sh
node scripts/pitch-probes.cjs /tmp/soundglow-pitch-inputs.json
dotnet run --project scripts/voice-tools-pitch-reference -- \
  /tmp/soundglow-pitch-inputs.json > /tmp/voice-tools-pitch.json
node tests/pitch-presets.cjs
```

The first command measures deterministic audio through Soundglow's actual Praat
stream. The second invokes the installed original grouping library. Fixture updates
require reviewing the output and library hash; ordinary builds never regenerate it.
The build runs fixture comparisons without requiring Voice Tools or .NET.
