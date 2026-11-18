# Backing-track variation exploration

Branch: `explore/backing-track-variation`.
Starting point: `b599a0d` on local `main`, including the shipped backing-track player.

## Musical constraints

- Blues and rock only. Drums lead; bass and supporting guitar stay 12 dB below
  their initial sampled balance. No lead guitar, melody, or additional keyboard part.
- Keep the harmony sparse and open. The scales exercise owns tonic and quality.
- Tempo stays stable. Transpose only pitched instruments.
- Preserve the approved fixed arrangements as the comparison baseline.
- Use FOSS code and openly licensed recordings/performance data. No sfizz or
  additional software installation for this exploration.

## Experiments, in order

1. **Playback realism:** choke open hats on closing strokes; give bass a deliberate
   monophonic release policy. Check neutral major/minor harmony: the current blues
   guitar includes a flattened seventh, which conflicts with a major scale's seventh.
2. **Curated rhythm vocabulary:** inspect human-played rock grooves and fills from
   GMD, plus its small blues/shuffle subset. Translate Roland note mappings and
   pedal CC4 into our recorded articulations. Keep compatible phrases together.
3. **Seeded phrase planner:** choose establishing, continuing, answering and
   transitioning roles before choosing notes. Use weighted, compatible patterns.
   Allow quiet phrase endings; avoid compulsory fills every four/eight bars.
4. **Coordinated parts:** bass follows selected kick accents; guitar and bass
   simplify when drums fill. Introduce rests as well as additional notes.
5. **Performance:** use recorded accents and timing relationships; avoid independent
   random jitter. Keep composition, expression and sample-alternate random streams
   separate, with an explicit generator version.
6. **Listening comparison:** Steady, Evolving and Active versions of both styles,
   with fixed seeds and matched loudness. Compare short excerpts and several-minute
   performances for groove, distraction, predictability and fatigue before changing UI.

## Research data already available

`work/backing-research/groove-v1.0.0-midionly.zip` is the original MIDI-only GMD
archive. Its SHA-256 was checked against the official published value:
`651cbc524ffb891be1a3e46d89dc82a1cecb09a57c748c7b45b844c4841dcc1e`.

The archive and `groove-dataset-audit.json` are ignored research inputs, not
production assets. The audit counted files from the supplied metadata:

| Genre | Files | Beat-labelled | Fill-labelled |
| --- | ---: | ---: | ---: |
| Rock | 341 | 211 | 130 |
| Blues/shuffle | 4 | 4 | 0 |

Of the rock files, 334 are in 4/4. Zero separately labelled blues fills does not
mean that the long blues performances contain no fills. Curate and listen before
using any material. GMD is CC BY 4.0 and requires attribution; the existing sample
recordings remain CC0. Preserve source file identities and credit any adaptations.

## Research basis

- [Groove MIDI Dataset and CC BY license](https://magenta.withgoogle.com/datasets/groove)
- [Learning to Groove with Inverse Sequence Transformations](https://arxiv.org/abs/1905.06118)
- [Does it Swing?](https://arxiv.org/abs/1904.03442): exaggerated deviations reduced
  swing ratings; quantization retained the underlying swing subdivision.
- [Downbeat delays in jazz](https://www.nature.com/articles/s42005-022-00995-z):
  particular soloist/rhythm-section timing relationships can help swing. This is
  not a universal timing prescription for our backing tracks.
- [Correlated microtiming](https://arxiv.org/abs/1710.05608): human fluctuations are
  structured across timescales, rather than independent per-hit timing noise.
- [Syncopation, movement and pleasure](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0094446):
  moderate syncopation scored highest in the studied drum breaks; not evidence of
  an optimal complexity for learning scales.
- [Coherent drum accompaniment with fills](https://arxiv.org/html/2209.00291v1):
  distinguish basic groove, fill location and fill content.
- [MMA synchronized/weighted pattern selection](https://www.mellowood.ca/mma/online-docs/html/ref/node5.html)
- [Sonic Pi seeded randomness](https://sonic-pi.net/tutorial-04.html)

## Acceptance checks

- Same seed/settings/generator version reproduce the same musical decisions.
- Changing key/tempo preserves the chosen groove's identity.
- Every generated bar has correct duration; loop boundaries preserve timing/tails.
- Drummer limb use and cymbal choking remain physically plausible.
- No uncontrolled density or volume growth over long playback.
- Bass/guitar cooperate with fills and remain subordinate in the mix.
- Preserve existing pause/navigation, offline playback and committed-key behavior.

The exploration branch now integrates the approved sustained-guitar Steady and
Active performances into the scale sidebar. Four event arrangements retain the
64/72-bar story, four-chord harmony and approved -12 dB string balance. Count-ins
and final resolution hits are excluded; the final eight bars return gradually to
the opening gain, while sample tails continue across the sample-accurate wrap.

Backing and metronome use one AudioContext and scheduling clock. The metronome
has an independent enable control, saved tempo and time signature. Downbeat is
optional: off means equal clicks and no meter; on accents the chosen independent
meter, or the backing track’s 4/4 meter while synced. Signature numbers use a
stacked fraction with direct entry and step controls, beside the Downbeat checkbox.
The widgets share sidebar typography and control/button widths. Sound and
performance attribution is in Settings. When backing plays, clicks
follow its quarter-note phase and BPM, and metronome tempo editing is disabled.
Starting backing joins the next existing independent click, avoiding a double
click. Pausing backing restores the saved independent BPM at the current beat
fraction. Turning off clicks never pauses backing. Visibility changes, leaving
the exercise and disposal stop both; neither starts automatically on returning.

The backing tempo slider is removed; both widgets step by 2 BPM. Direct numeric
entry remains available. Build, arrangement integrity tests and browser checks
cover phase synchronization, independent-tempo restoration, long loop wraps,
persistence and desktop/mobile controls. Regenerate the pack with
`scripts/build-backing-stories.py --renderer <render_realistic.py> --stories
<backing-track-sustain>`, using the existing Python audio environment and local
CC0 sample libraries; no sampler application or software installation is needed.
