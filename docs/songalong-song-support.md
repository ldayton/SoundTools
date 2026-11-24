# SongAlong arrangement support

The standard is musical completeness, playable instrument parts, and the same
shared controls. Instrumental pieces do not need an invented vocal edition.
This table is checked against the production registry by `song-support.test.ts`.

| Song | Guitar | Piano | Voice + Piano | Guitar + Voice | Source / musical contract |
| --- | --- | --- | --- | --- | --- |
| In Christ Alone | Dedicated, capo 2 | Dedicated | Teacher choir + organ | Vocal line + guitar chord accompaniment | Teacher melody/rhythm/interlude in D; organ harmony follows teacher chord suggestions |
| Amazing Grace | Dedicated, no capo | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Open Hymnal source; existing instrumental pitches and phrasing preserved |
| I'll Fly Away | Dedicated, no capo | Dedicated | Voice + source keyboard harmony | Vocal line + guitar chord accompaniment | Supplied tab-music melody, ornaments, verse/chorus and fermata |
| Jesus Loves Me | Dedicated, capo 3 | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Source melody and complete refrain; E-flat sounding key |
| O Come, All Ye Faithful | Dedicated, no capo | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Open Hymnal melody, pickup, rest, refrain and final partial measure |
| Blessed Assurance | Dedicated, capo 2 | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Open Hymnal D, 9/8, three-eighth pickup and six-eighth ending |
| Silent Night | Dedicated, capo 1 | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Open Hymnal B-flat, 3/4, complete final measure and dotted figures |
| Joy to the World | Dedicated, capo 2 | Dedicated | Voice + source piano harmony | Vocal line + guitar chord accompaniment | Open Hymnal D, 2/4, nineteen complete measures |
| 1st Fingerstyle Blues | Supplied fingerstyle score | Dedicated adaptation | Not applicable | Not applicable | Supplied GuitarNick score; swing, repeat, turnaround and final E7 |

## Shared implementation

The three new instrumental editions use `instrumentHymnAbc`, the existing
edition registry, capo-aware playback/tab, chord diagrams and preview player.
Their explicit harmonic changes and bass choices are in
`standard-hymn-editions.ts`; piano melody fingerings reuse the phrase planner.
Piano chords fit within a fifth. Guitar finger suggestions reserve the held bass
finger when assigning melody fingers. Guitar bass choices use separate strings from
the melody, including low open-string inversions where a root bass would collide.
The original 80 BPM starting preference is retained for these three songs;
it is adjustable and is not represented as an original source marking.

Guitar and Piano are mutually exclusive instruments, with an independent Voice
toggle. Hymns offer four distinct scores: instrumental Guitar, instrumental Piano,
Guitar + Voice, and Piano + Voice. Fingerstyle Blues offers the two instrumental
scores. There is no secondary arrangement menu. See [score combinations](songalong-score-combinations.md). The Melody, Bass, Simple Chords and Broken Chords stages,
including their automatic accompaniment generators, have been retired.

Legacy stage links and saved choices map to Piano; Melody retains right-hand
practice. Tempo, key, selected verses and other compatible preferences survive.
The catalogue revision 4 migration drops incompatible stage checkpoints and
keeps existing Piano/Guitar/Voice + Piano checkpoints. Instrument-specific hand
practice, guitar display choices and independent staff Show/Play remain.

For the seven new vocal editions, `voicePianoAbc` gives the source melody a
separate vocal staff while preserving every source accompaniment voice. It
retains the source's pitches, durations, repeats and ending. The chord labels
use sounding names. Blessed Assurance and Joy to the World have reviewed
source-piano corrections where the instrumental edition deliberately reharmonizes
the source. Their chord previews therefore describe the written harmony. A change
under a held vocal note is attached to an accompaniment attack at its actual
time, rather than moving the chord or splitting the music. The sung track uses
the existing normalized choir samples; the other tracks use piano. In Christ
Alone retains its choir/organ instrumentation and archival transcription. Its
performed organ bass and inner accompaniment follow the teacher's chord guide,
including B minor and D/F-sharp; choir, doubled melody and melodic interlude
remain intact. Harmonic changes split sustained accompaniment where necessary.

Silent Night and Joy to the World end on root-position guitar tonic chords.
The low melody supplies the root, with the remaining chord tones on separate
upper strings, preserving the written melody without an artificial octave leap.

Dedicated guitar scores support all twelve keys by moving the capo within frets
0–11 while retaining reviewed chord shapes, fingerings and relative tab. The
score heading, diagrams, MIDI grading and continuous/stanza audio use the same
capo. The Original key option and per-song source-key defaults are unchanged.

All scores use the shared content-based system fitter, which reserves annotation
space before fingerings are enabled so toggling them does not move measures.
They share the staff Show/Play table,
transposition, stanza alignment, note highlighting and playback engine. Vocal
chords reuse the piano diagram with low-to-high octave-qualified labels and
the normalized chord-then-breakdown preview. Dominant/minor seventh symbols
retain their seventh in the keyboard example.

## Verification owners

- Existing edition goldens continue to freeze the six prior instrumental editions.
- The three new edition unit files independently specify opening/closing pitches,
  attack counts, bar counts and durations, and compare complete/passaged melody
  timelines. They check guitar string occupancy and compact separate piano hands.
- `voice-piano.test.ts` checks all seven new vocal scores: source melody, all
  accompaniment voices, duration, supported chord labels, choir routing and
  independent muting without clock changes. `musical-harmony.test.ts` independently
  specifies corrected vocal harmonies, teacher basses/voicings and root-position
  guitar cadences. It also checks the capo and continuous playback contract for
  every dedicated edition; the existing guitar browser witness checks every
  registry entry and transposed MIDI grading for I'll Fly Away.
- Every registry entry owns its required Nightly edition browser witness. New
  shared checks cover 320, 390, 768 and 1440 px, fingerings, tab, clipping,
  chord diagrams and independent vocal staff visibility/playback controls.
- Existing catalog, key, stanza, playback, offline and account tests remain owners
  of their shared contracts. The support table is not a claim of human teacher
  approval; the new arrangements remain editorial practice adaptations.

## Retired coverage

The former generic stage contracts have been migrated to actual Piano scores.
`hymn-hands.test.ts` now compares independently selected authored hands across
whole and sliced scores, including repeats, and verifies legacy stage requests
resolve to Piano. The old single-note bass generator and generated guitar lesson
assertions were retired with those renderers; the existing per-song edition
units remain the musical, fingering, capo, chord and passage goldens. Guitar
legacy URL coverage stays in `guitar.test.ts` and the existing browser witness.

Generic workflow fixtures in `test-fixtures/hymns.ts` select by real score
capabilities. Recovery checks use an actual sustained piano chord, and a separate
capability fixture supplies written piano ties. The melodic fingering catalog
still checks source melodies under transposition; authored LH chord fingerings
are owned by the edition tests. This removes dependence on the retired staged
accompaniment without reducing MIDI recovery, hand-scope or tie coverage.
