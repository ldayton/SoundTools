# Songalong piano fingering prototype

The opt-in **Show fingerings** checkbox supports Melody and Add bass notes. It
remembers the display preference globally. Chord arrangements are deliberately
unannotated, with the checkbox disabled. Numbers are suggestions; circles mark
changes of position in the proposed plan, including thumb crossings. They do not
claim to observe the player's actual fingers (MIDI supplies notes, not fingers).

The original TypeScript planner uses dynamic programming over (finger, thumb
anchor) states across each complete visible voice, across wrapped systems. Its
conservative five-finger reach model uses white-key units with black-key offsets.
It minimizes position changes, displacement and stretching, discourages thumb on
black keys without forbidding it, and distinguishes nearby thumb crossings from
large relocations. Rests and longer notes reduce relocation cost. Tied
continuations retain finger and anchor; no silent substitutions are generated.

This is a beginner-oriented heuristic, not an implementation of a published
anatomical model or a guarantee of the best fingering for an individual hand.
The five-finger model can suggest more shifts than a player who uses extensions.
It does not model pedal, advanced finger substitution, chord fingering or
coordination/collisions between the two hands. Teacher overrides/hand-size
profiles are not implemented.

Annotations are SVG overlays beside noteheads after engraving, with no new
staff rows or changed viewBox/system dimensions. RH is above, LH below. Circles
sit slightly to the side to avoid stems. Tied continuations are not renumbered.
The plan uses actual sounding pitches after transposition and retains written
note names in tooltips. Only engraving changes; audio and grading do not use the
finger numbers.

References consulted (no reference code copied):

- [MIT 6.006 piano-fingering dynamic programming lecture](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2008/2ca17b35ce6a91d78745e876a1bdf1f7_lec22.pdf)
- [PianoPlayer: movement-based look-ahead, hand-size dependence and limitations](https://github.com/marcomusy/pianoplayer#how-the-algorithm-works)
- [Piano Adventures: circled fingers for position changes](https://pianoadventures.com.au/browse/libraries/libraries-pretime-to-bigtime/)
- [Essential Dictionary of Music Notation, keyboard fingerings pp. 68–70](https://musescore.org/sites/musescore.org/files/2022-02/EssentialDictionaryOfMusicNotation_0.pdf)

Validation: conventional RH/LH C-major scales; stationary five-finger phrases;
leaps versus crossings; tied notes; deterministic transpositions; browser checks
for both hands, supported arrangements, persistence, transposition, mobile width
and identical system heights with annotations on/off. A catalogue audit covers
22 hymns × two arrangements × three transpositions (198 voices, 9,525 notes).
These checks cover consistency of the model, not a teacher's artistic assessment.
