# Scale-practice tonic harmony A/B

Approved for scale practice after A/B listening. The reference generator remains available for comparisons.

A is the current genre engine. B applies a pitch-only harmonic profile after the approved performance passes. Every event retains its onset, duration, velocity, level, articulation, instrument, string and release parameters. Drums and percussion are identical. No bass attacks are added. The genre mix, effects and render gains are unchanged.

The scales host now passes all six scale identities separately to the player. Other hosts and the reference generator retain their existing behavior unless a scale profile is supplied.

B uses a tonic pedal: clear tonic triads at phrase openings/returns, tonic sixth/seventh color in bar five and suspended color in bar seven. Bass entries establish the tonic, with fifths retained for movement. Pitched notes are confined to the selected scale; blues passing tones are intentionally not sustained in accompaniment. Pentatonic and blues therefore share a chord bed within each major/minor family. Guitar pitches remain within the assigned string's open-to-19th-fret range.

Render with `tsx scripts/render-scale-harmony-ab.mts OUTPUT_DIRECTORY`. Six matched pairs: A major, A minor, both pentatonics and both blues scales; Roots Rock for major-family and Shuffle Blues for minor-family, Active feel, 90 BPM. Excerpts use bars 9–24 with two bars of warmup and a two-second effects tail. Stereo 48 kHz 16-bit WAV, no per-file normalization.

Validation: 54 backing/metronome unit tests; NoteWise production build; WAV duration, channel/rate, peak, level and event-count checks. New invariance test spans eight genres, six scales, two feels and five keys (480 arrangements). All six A/B pairs differ by less than 0.2 dB RMS, with no clipping.
