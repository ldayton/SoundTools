# Roots Reggae backing

Reggae retains its established one-drop drum arrangement and diatonic two-bar
chord changes. The updated performance gives each instrument its own role:

- Guitar: compact upper-string triads on beats 2 and 4, with a rapid upstroke,
  short gate and 18 ms damped release. No generic legato-strum adaptation.
- Bass: a repeating two-bar syncopated root/fifth/third hook, deliberate gaps,
  and one additional short chord tone in Active sections. The Breathe section
  drops back to one bass attack in alternating bars.
- Organ: quiet, low 8-foot tonewheel pulses on the eighth-note upbeats. The
  shared tonewheel engine uses a separate Reggae registration with less drive
  and chorus, and slow rotary motion. Gospel's registrations and defaults stay
  unchanged.
- Mix: darker bass, high-passed guitar, little room, and restrained maracas.
  No new controls or downloaded sample banks.

The note material stays inside the selected major or natural-minor scale.
Recorded guitar and bass attacks come from the existing approved palette;
there is no organ sample dependency. Reggae buffer IDs are independent, so
shortened attack buffers cannot replace another style's sustained recordings.
The maximum retained guitar/bass audio includes each longest gate and release
at the minimum supported 50 BPM.

## Musical references

- Matt Jenson, Berklee, [Bubblin'](https://www.berklee.edu/berklee-today/spring-2015/The-Woodshed-Bubblin):
  low 8-foot Hammond bubble on the upbeats, with the right hand/guitar skank on
  beats 2 and 4; the low pulse should support rather than dominate the groove.
- Fender, [Reggae playlist](https://www.fender.com/articles/fender-performances/fender-play-live-reggae-playlist):
  syncopation, string muting and complementary bass/guitar grooves.

These are stylistic references. The generated arrangements and tonewheel model
are original; no recording, preset or third-party plugin was copied.

## Verification

`backing-reggae.test.ts` checks all major/natural-minor keys, Steady/Active,
50/78/180 BPM, native attack coverage, guitar placement and gates, organ
registration, bass density, breathing space and loop bounds. Frozen references
continue to protect Funk, Soul, Blues and Rock from unrelated changes.

`apps/notewise/tests/reggae.browser.ts` exercises real desktop and mobile UI,
actual browser audio renders, pause/resume, loop seeking, rapid key changes and
Reggae/Gospel/Funk palette switching. Live test audio is muted. Optional
`REGGAE_AB=1` exports eight-bar C major/minor, Steady/Active A/B renders against
an isolated e435e09 source snapshot. Both versions use their own player, sampler
and mix graph, at 78 BPM. WAV packaging uses constant loudness-matching gain,
without added mastering compression or limiting.
