# Roots Rock and Shuffle Blues

The original `rock` and `blues` settings now select Roots Rock and Shuffle Blues.
Their established recorded drum performances, harmony, section dynamics and loop
lengths remain the foundation. The original performance pipeline is retained as
an explicit, frozen A/B reference; the app dispatcher uses the new performances.

## Roots Rock

Low/middle-string guitar grips replace the generic upper-register sustained
comping. Quiet and settling passages use recorded palm-muted attacks and clipped
root/fifth shells. Ride-driven choruses open into fuller triads and longer gates.
Active allows occasional upstroke replies and one short bass answer in selected
bars; it does not turn the backing into continuous eighth-note bass.

A shared guitar amp path high-passes rumble, applies gentle oversampled soft
saturation to the complete chord, then low-passes the result for cabinet-like
rounding. Recorded clean/muted attacks remain distinct. This is an original
browser processing model, not a sampled amplifier or an external plugin.

## Shuffle Blues

The rhythm guitar explicitly plays the long/short triplet subdivision, with
longer downstrokes and short damped upstrokes. Root/fifth dyads occasionally move
to a sixth only when that note belongs to the selected scale and is playable in
the current grip. Active leaves space for short upper-string answers before the
recorded drummer's fill bars.

The rhythm and answer guitar have separate registrations, gates and mild amp
settings. Bass remains sparse. Minor-key practice never silently receives a
raised sixth or chromatic blue note; the selected major or natural-minor pool is
still the contract for the practice backing.

## Shared implementation and bounds

- Low guitar grips use real tuning, frets 0-12, bounded stretches and native
  recordings. Native sample loading includes the lower register down to MIDI 44.
- `backing-band-sounds.ts` owns gate-compatible buffer limits, filters and amp
  saturation. Instrument-specific sample IDs isolate recordings across styles.
- The source drums and their natural tails are retained. Pitched gates remain
  inside the circular arrangement and never outlast their retained buffers at
  the minimum supported tempo.
- Existing Folk, Country, Gospel, Reggae, Funk and Soul musical performances are
  protected by frozen references. The shared sample and effects lifecycle is
  tested during rapid key/style changes and pause/resume.

## References

- [Andy Guitar: Blues Shuffle & Triplets](https://www.andyguitar.co.uk/videos/strumming-pattern-10-blues-shuffle?context=course&courseSlug=strumming-course)
- [Fender: Blues Shuffle Basics](https://www.fender.com/play/courses/blues-shuffle-rhythm/lessons/blues-shuffle-basics)
- [Pickup Music: Blues Learning Pathway](https://www.pickupmusic.com/guitar/guitar-classes/blues-bootcamp)

The arrangements are original generated performances, not transcriptions of a
song or a copied lesson. Recordings reuse the existing licensed app banks.

## Validation and previews

Unit checks cover both modes, all 24 major/minor keys, slow/preferred/fast tempos,
scale membership, sample coverage, playable grips, physical gates, shuffled
placement, quiet/full contrast, replies, bass density and loop bounds.

The browser checks cover actual audio and isolated instrument stems, global
volume, mono, phase through tempo/loop edits, palette cancellation and effect
cleanup. Desktop and phone targets are 1680 x 1050 DPR2 and 393 x 852 DPR3. Live
audio stays muted during tests; exported WAVs use OfflineAudioContext.

The Rock A/B includes eight bars of settling palm-muted playing followed by
eight bars of open chorus. Blues includes a complete twelve-bar progression.
Both versions use their own sampler and mix. C major/minor, Steady/Active,
100 BPM Rock and 90 BPM Blues. WAVs are loudness matched by constant gain, with
true-peak headroom and no added mastering compressor or limiter.

## Cross-style level balance

Fixed post-limiter trims bring the settled section to approximately -24 LUFS.
Calibration used both major/minor and Steady/Active for every style, including
both Folk patterns (36 excerpts). Full Active takes in both scale qualities
were also rendered to check peak headroom. Trims use the median of the four
excerpts and a conservative peak bound with an extra interpolation margin.

There is no automatic gain riding: phrase dynamics, the lift from Steady to
Active, and each instrument's internal balance remain intact. App volume remains
independent. Pattern changes apply the appropriate picking/strumming trim without
resetting the transport or reloading the sample bank. The original reference
profile remains at unity for legacy comparisons.

`Balanced-style-tour.wav` contains short examples at the actual app mix levels,
with no per-clip loudness matching. Its text index and validation data identify
each style and its starting time. The separate Rock/Blues A/B packs are loudness
matched specifically for judging the changed performance and tone.
