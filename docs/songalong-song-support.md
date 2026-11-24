# SongAlong arrangement support

The standard is musical completeness, playable instrument parts, and the same
shared controls. Instrumental pieces do not need an invented vocal edition.
This table is checked against the production registry by `song-support.test.ts`.

| Song | Guitar | Piano | Voice + Piano | Progressive piano stages | Source / musical contract |
| --- | --- | --- | --- | --- | --- |
| In Christ Alone | Dedicated, capo 2 | Dedicated | Teacher choir + organ | — | Supplied teacher score in D; printed rhythm, interlude and ending |
| Amazing Grace | Dedicated, no capo | Dedicated | Voice + source piano harmony | — | Open Hymnal source; existing instrumental pitches and phrasing preserved |
| I'll Fly Away | Dedicated, no capo | Dedicated | Voice + source keyboard harmony | — | Supplied tab-music melody, ornaments, verse/chorus and fermata |
| Jesus Loves Me | Dedicated, capo 3 | Dedicated | Voice + source piano harmony | — | Source melody and complete refrain; E-flat sounding key |
| O Come, All Ye Faithful | Dedicated, no capo | Dedicated | Voice + source piano harmony | — | Open Hymnal melody, pickup, rest, refrain and final partial measure |
| Blessed Assurance | Dedicated, capo 2 | Dedicated | Voice + source piano harmony | Four | Open Hymnal D, 9/8, three-eighth pickup and six-eighth ending |
| Silent Night | Dedicated, capo 1 | Dedicated | Voice + source piano harmony | Four | Open Hymnal B-flat, 3/4, complete final measure and dotted figures |
| Joy to the World | Dedicated, capo 2 | Dedicated | Voice + source piano harmony | Four | Open Hymnal D, 2/4, nineteen complete measures |
| 1st Fingerstyle Blues | Supplied fingerstyle score | Dedicated adaptation | Not applicable | — | Supplied GuitarNick score; swing, repeat, turnaround and final E7 |

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

The four progressive piano stages remain intentional practice choices for the
three newly arranged hymns: melody, bass, simple chords and broken chords.
Their saved settings and shared generic workflow coverage remain supported.

For the seven new vocal editions, `voicePianoAbc` gives the source melody a
separate vocal staff while preserving every source accompaniment voice. It
retains the source's pitches, durations, repeats and ending. The chord labels
are the instrumental edition's editorial harmonic guide, transposed from capo
shapes to sounding names; they do not replace the source harmony. A change
under a held vocal note is attached to an accompaniment attack at its actual
time, rather than moving the chord or splitting the music. The sung track uses
the existing normalized choir samples; the other tracks use piano. In Christ
Alone retains its separately authored choir/organ source and organ routing.

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
  independent muting without clock changes.
- Every registry entry owns its required Nightly edition browser witness. New
  shared checks cover 320, 390, 768 and 1440 px, fingerings, tab, clipping,
  chord diagrams and independent vocal staff visibility/playback controls.
- Existing catalog, key, stanza, playback, offline and account tests remain owners
  of their shared contracts. The support table is not a claim of human teacher
  approval; the new arrangements remain editorial practice adaptations.
