# Pocket Funk and Mellow Soul

These two arrangements share the existing native recordings and sampler but
have separate performances, instruments, mix profiles and buffer identities.
The persistent style IDs stay `funk` and `soul`; existing saved choices continue
to work. The selector labels are Pocket Funk and Mellow Soul.

## Pocket Funk

- Short upper-string chord accents on a sixteenth-note grid, alternating full
  triads and dyads. Quiet sections use two accents; the main pocket uses three;
  Active allows four, leaving room for drum fills.
- Low-level muted strokes between accents. These use the existing recorded
  palm-muted guitar attacks, high-pass filtering and a short gate to emphasize
  pick noise; they are not claimed to be a separate sampled dead-strum library.
- A repeating root/third/fifth bass hook. Quiet sections have two attacks,
  Steady main sections three, and Active at most four including one quiet ghost
  attack. Short gates leave more than half the bar open.
- Existing backbeats and kick patterns, with a quiet extra snare ghost in Active
  phrases. A dry mix supports definition rather than long ringing chords.

## Mellow Soul

- The existing softer electric-piano velocity layer, with high/low tone shaping
  and subtle shared stereo modulation. All notes in a chord share one modulation
  phase; each note does not restart its own effect.
- Smooth seventh-chord inversions, leaving the root to the bass. Steady holds
  the chord with a deliberate gap before the next change. Active uses shorter
  calls and upper-voice answers.
- Sparse clean-guitar dyads reply between the piano phrases. The guitar never
  doubles every keyboard chord, and has a different tone and gate from Funk.
- Rounded finger bass: two attacks in Steady, at most three in Active. Laid-back
  backbeats and restrained room preserve the warm character.

Both styles use only pitches from the selected major or natural-minor scale.
No dominant alterations or chromatic approaches are silently introduced. The
recordings, compact guitar grips and sample alternate takes were already in the
app; no new sample bank or runtime dependency was added.

## Shared audio handling

`backing-band-sounds.ts` centralizes per-instrument filter profiles, retained
buffer limits and the shared electric-piano modulation. The effect rack is
replaced when the audio context or style changes and disposed with the player.
Reggae uses the same processing facility with its existing tone/gate settings;
other styles retain their approved audio paths.

Style-prefixed sample IDs prevent shortened Funk or Reggae buffers from being
reused as long notes in Soul or another style. Retained buffers cover the longest
gate plus release at 50 BPM. Soul electric-piano holds also respect the actual
six-second recording length.

The two groove bands share only the drummer, section dynamics and playable-grip
foundation. Unused generic bass/guitar performances have been removed from that
foundation; each style now owns its actual instrument performance.

## References

- [Pickup Music: Funk guitar for beginners](https://www.pickupmusic.com/blog/funk-guitar-for-beginners):
  sixteenth subdivisions, dynamics and muting as ensemble rhythm.
- [Fender: R&B / Soul](https://www.fender.com/articles/songs/r-and-b-soul-path):
  rhythm guitar and the range of soul approaches, rather than treating the genre
  as only held keyboard chords.
- [Rhodes MK8](https://rhodesmusic.com/rhodes-mk8/): tone shaping and stereo
  modulation as electric-piano sound-design references. The app reuses its
  existing FluidR3 recordings; it does not contain Rhodes recordings or software.

## Verification and comparisons

Unit checks cover both modes, all major/minor keys, slow/preferred/fast tempos,
native sample coverage, playable guitar notes, physical gate/buffer bounds,
chord color, bass density and intentional spaces. Frozen references protect
48 existing Folk/Country/Gospel/Reggae arrangements, alongside the pre-existing
Blues/Rock fixtures.

`pocket-styles.browser.ts` checks real desktop and mobile controls, saved style,
actual PCM and isolated instrument stems, stereo-to-mono behavior, global volume,
phase through tempo/loop edits, pause/resume, rapid key and palette changes, and
effect cleanup. Live test audio is muted. Target layouts are 1680 x 1050 DPR2
(MacBook Air) and 393 x 852 DPR3 (iPhone 14 Pro); these are browser emulations.

Optional `POCKET_AB=1` renders each version through its own player and mix:
C major/natural minor, Steady/Active, source bars 9-16, 104 BPM Funk and 84 BPM
Soul. A uses the e435e09 source snapshot; B is the local revision. Exported WAVs
are 48 kHz stereo 24-bit PCM, matched with constant gain and true-peak headroom.
There is no added mastering compression or limiting.
