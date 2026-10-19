# Praat pitch drawing preset

Inspected local Praat source commit `8007903e7` on 2026-10-19.

## Source findings

- `fon/Pitch.cpp:679`: `Pitch_drawInside` delegates to `Sampled_drawInside`.
- `fon/Pitch.cpp:139`: the selected candidate's frequency is undefined when it is
  not voiced according to the Pitch object's ceiling. Drawing adds no confidence
  threshold beyond the analysis result's voiced/unvoiced decision.
- `fon/Sampled.cpp:780`: curve drawing joins consecutive defined frames with
  straight polyline segments. It does not apply smoothing, corner rounding or
  an octave-jump filter. Unvoiced frames break the line. Ends of defined stretches
  extend horizontally by half a frame, including isolated voiced frames.
  Neighboring samples supply interpolation at the viewport boundaries.
- `fon/Sampled.cpp:755`: speckle drawing places a dot at each defined sample inside
  the selected frequency range.
- `foned/SoundAnalysisArea.cpp:2668`: editor Automatic mode draws a curve unless
  the frame interval exceeds half the analysis-window duration. Dots appear when
  undersampled or when fewer than 101 sample positions are visible. Both can appear
  for a short, sufficiently sampled view. The editor paints a cyan width-3 pass
  followed by a blue width-1 pass.
- `foned/SoundAnalysisArea_prefs.h:44`: current filtered-autocorrelation editor
  defaults are a 50 Hz floor, 800 Hz top, logarithmic Hertz, and Automatic drawing.

## Implementation and limits

The Praat preset selects the shared logarithmic axis, Automatic mode, no extra
smoothing/grouping/jump filter, no extra confidence threshold, an 800 Hz voicing
ceiling, half-frame stretch extensions, outline width 3/core width 1, and no
reference bands. Existing Soundglow trace colors remain; this is not a screenshot
palette match. Speckle physical sizing is approximated in browser pixels.

The production feature stream supplies measurements every 10 ms. Automatic's
sampling criterion uses its actual interval and 3 periods at the analysis floor
of 50 Hz. Our 3–30 second history range normally selects a curve without dots;
coarsening grouping can select speckles instead. Marker choices are disabled when
Automatic or Speckles controls their visibility.

This is a drawing preset, not an implementation of modern Praat's full editor
analysis defaults: Soundglow's existing streaming Praat analysis still runs with
its own configuration. Applying a display ceiling cannot retroactively change
which candidate the detector selected. Window-end caps may use available future
analysis context; the existing live display delay is unchanged.

Tests cover exact log coordinates, Automatic decision boundaries, half-frame
coordinates, unvoiced and ceiling rejection, no extra display-stage octave
filtering, naming collisions, persistence, and real English playback without
restarting capture. These tests exercise source-derived rules; they do not assert
native/editor pixel equality.
