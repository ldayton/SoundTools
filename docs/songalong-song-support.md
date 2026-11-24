# SongAlong arrangement support

The standard is musical completeness, playable instrument parts, and the same
shared controls. Instrumental pieces do not need an invented vocal edition.
This table is checked against the production registry by `song-support.test.ts`.

| Song | Guitar | Piano | Voice + Piano | Guitar + Voice | Source / musical contract |
| --- | --- | --- | --- | --- | --- |
| The Old Rugged Cross | Dedicated reference, engine-selected capo | Dedicated | Voice + complete source SATB in playable hand spans | Vocal line + engine-voiced guitar accompaniment | Supplied Timeless Truths B-flat 6/8 score; four verses, shared refrain, answering parts, diminished passing harmonies and verse-dependent articulation |
| In Christ Alone | Dedicated, capo 2 | Dedicated | Teacher choir + organ | Vocal line + guitar chord accompaniment | Teacher melody/rhythm/interlude in D; organ harmony follows teacher chord suggestions |
| Are You Washed in the Blood? | Dedicated, capo 1 | Dedicated | Voice + complete source SATB harmony | Vocal line + guitar chord accompaniment | Hoffman/Kravchuk A-flat score; four verses, refrain pickup, lower-voice echoes and D-natural secondary dominant |
| Fairest Lord Jesus | Dedicated reference, engine-selected capo | Dedicated | Voice + complete source SATB in playable hand spans | Vocal line + engine-voiced guitar accompaniment | Hymnary.org/Willis E-flat score; all four verses, fifteen full bars, tied opening phrase and chromatic secondary dominants |
| In the Sweet By and By | Dedicated reference, engine-selected capo | Dedicated | Voice + source chord-staff harmony in playable hand spans | Vocal line + engine-voiced guitar accompaniment | Bennett/Webster, Kravchuk F-major setting; three verses, refrain responses and final quarter rest |
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

Dedicated guitar scores support all twelve keys. The engine considers every capo
from 0–11, ranks physically proven positions, and selects the best by default.
The table's capo numbers describe internal reference arrangements, not privileged
recommendations. Reference arrangements get neither selection priority nor a
reserved shortlist slot. Solo guitar preserves the exact melody and held bass;
Guitar + Voice uses independently playable chord grips while retaining harmonic
changes, rhythm, rests and single-note instrumental fills. Explicit numeric user
choices survive reloads and instrument switches when physically valid, even if
outside the recommended shortlist. Changing key returns to automatic selection.
The score heading, diagrams, MIDI grading and continuous/stanza audio use the same
capo. A capo selector appears only when multiple playable settings exist; a
fixed capo stays visible in the score heading. The Original key option and per-song source-key defaults are unchanged.

All scores use the shared content-based system fitter, which reserves annotation
space before fingerings are enabled so toggling them does not move measures.
They share the staff Show/Play table,
transposition, stanza alignment, note highlighting and playback engine. The
desktop on-screen piano and its toolbar toggle are available for every instrument;
switching instruments preserves the keyboard visibility preference and toolbar geometry. Vocal
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

## Are You Washed in the Blood?

The supplied Michael Kravchuk A-flat SATB score is the single transcription
reference. `are-you-washed-in-the-blood.abc` records the source URL and supplied
PDF SHA-256. All four voices, four verses, lower-voice refrain echoes, rests and
accidentals are retained. Voice + Piano separates the singer from the complete
source accompaniment. Guitar + Voice keeps the singer at concert pitch.

Piano and fingerstyle Guitar use the same complete melody and explicit reviewed
harmonic changes in `are-you-washed-in-the-blood.ts`. Piano's separate LH chords
fit within a fifth. Guitar uses G-family shapes with capo 1; its melody sounds
an octave below the singer. Root G and open A bass substitutions keep the low
melody's D string free. The secondary dominant remains Bb7/F in the vocal
score, with its D-natural, and A7/E relative to the guitar capo. The one-beat
pickup and three-beat ending form a 64-quarter-beat pass. The refrain starts on
the last beat of measure 8; it is engraved once and played in every selected
verse. 80 BPM is an adjustable practice default, not a printed marking.

`are-you-washed-in-the-blood-editions.test.ts` independently specifies every
printed SATB pitch, duration and rest, the four lyric rows and common refrain.
It also owns instrumental melody/passages, piano spans, simultaneous guitar
strings/fingers and four-verse continuous playback. Existing registry-wide tests
own twelve-key/capo support, choir routing, staff muting and account state.
The required Nightly edition browser witness checks all four score combinations
at desktop, tablet and phone widths, including all four selected verses.

## In the Sweet By and By

The Bennett/Webster hymn is transcribed from the supplied Kravchuk F-major PDF
(SHA256 `51ec4eda3d61abee2ec9db465e141ed3595942a3849cf5618cfb18673afd7b2b`).
Both printed chord staves, three verses, refrain answering rhythms and final
quarter rest are retained in the archive. Voice + Piano extracts an independent
vocal line and compacts oversized source hand spans without changing pitch
classes, attacks or durations. The one-beat pickup plus sixteen complete bars
makes a 65-beat pass; three selected verses last 195 beats.

Piano and guitar are practice adaptations. The internal guitar reference uses
D-family shapes at capo 3 in the printed F key; the engine chooses the capo for
the selected score. The source contains no capo instruction. Piano chords fit a
fifth; the fingerstyle guitar keeps held notes on distinct strings and ends on a
root-position tonic, followed by the written rest. The adjustable 80 BPM practice
default is not a tempo marking in the print.

`in-the-sweet-by-and-by-editions.test.ts` independently specifies every source
notehead, onset, duration and rest, three lyric underlays, the common refrain,
instrumental melody/passages, physical string/finger occupancy and full-form
playback for all four editions. Its required Nightly browser witness covers all
four combinations at 320, 390, 768 and 1440 px. Registry tests retain twelve-key,
harmony, staff muting and account coverage.

Capo policy is owned by `guitar-capo.test.ts` (unprivileged ranking, explicit
preferences, physical feasibility, all-key harmony/rhythm/fills and persistence)
and the existing guitar/capo browser witnesses (automatic selection, key changes,
manual overrides, diagrams, MIDI and reloads). Fixed-capo presentation uses a real
single-option solo score; revoiced vocal scores now offer multiple alternatives.
The shared picker rule remains the same for both combinations.

The legacy-link browser witness retains its explicit capo-2 shape/MIDI contract.
Its duplicate manual picker roundtrip is owned by `guitar-capo.browser.ts`, which
also verifies the engine default, changed tab, diagrams and persistence.

## Fairest Lord Jesus

The public-domain Hymnary.org score (Richard Storrs Willis setting) owns the
transcription and all four printed verse underlays. Its fifteen complete 4/4
measures last 60 quarter beats, with no pickup, common refrain or appended Amen;
four selected verses last 240 beats. The archived third-measure tie is
verse-dependent in the playable lead: verses 1–3 rearticulate “Rul-er”/“Fair-er”
as two quarters, while verse 4 sustains “Lord”. The active-verse notation,
practice onsets and per-verse playback agree; accompaniment remains intact. This is
the printed Fairest Lord Jesus underlay, including the fourth Beautiful Savior
verse, rather than a renamed edition of the different Beautiful Savior text.

The archive retains every SATB note and accidental. Voice + Piano gives the
soprano an independent vocal staff and compacts oversized hand spans while
retaining pitch classes and rhythm. Piano and guitar are practice adaptations:
piano chords fit a fifth, minor/seventh colours remain audible, and the guitar
ends on a root-position tonic. A low fifth bass and upper chord tones avoid the
relative-minor root colliding with the melody on the A string. Its C-family,
capo-3 guitar reference does not override runtime engine recommendations.
The adjustable 80 BPM starting tempo is not printed in the source.

`fairest-lord-jesus-editions.test.ts` owns independent pitch/rhythm/tie goldens for
all four printed voices, the four complete underlays, chromatic chord colours,
passages, string/finger occupancy and four-edition stanza playback. The required
Nightly edition witness covers all four score combinations at 320, 390, 768 and
1440 px, including the offline bundled transcription. Existing registry-wide
checks own all-key capo, harmony, hand spans, muting, scheduling and persistence.

Downloaded public-domain prints use the explicit `public-domain-score` source
category. The importer requires a source URL, provenance, a transcription marker
and a public-domain declaration. The original transcription remains available
from About this song, using the same local/offline mechanism as supplied prints.

The per-edition real-audio sustain witness explicitly selects the reference capo
whose string assignments it models. Automatic recommendation and manual override
wiring remain owned by the dedicated capo browser witness.

## The Old Rugged Cross

The supplied Timeless Truths score owns the B-flat melody, four SATB parts and
four verses. Its twenty printed measures include four one-eighth pickups and
their complementary five-eighth endings: 48 quarter beats per complete
verse/refrain, 192 for all four verses. No ending or extra rest is appended.
The publisher's MusicXML confirms that these are intentional partial measures,
with hidden end barlines after measures 5 and 15. The archived ABC and complete
Voice + Piano score retain those hidden bars; they are not invented full bars
or extra rests at printed system breaks.
The accompaniment's five-eighth durations are engraved as tied dotted quarters
and quarters, preserving one attack rather than inventing a five-eighth glyph.

The source retains the chromatic E-natural, C-sharp and F-sharp, lower-part
refrain answers and complete underlay. Source melody has 84 written noteheads
and 76 tied attacks. Playable underlay articulation yields 77, 77, 76 and 77
lead attacks in verses 1–4: “Has a”, “For a” and “Where His” rearticulate the
corresponding held pitches. Shared refrain lyrics occupy one engraved row.

The piano adaptation keeps diminished colours audible with left-hand chords
within a fifth. Guitar uses a G-family/capo-3 reference with low dominant thirds
and open-string support where the melody supplies the bass; runtime capo
selection remains engine-owned. All simultaneous notes occupy separate strings,
the reference grips are playable, and the final tonic includes its third.
The adjustable 80 quarter-note BPM starting value is editorial.
Source and playable beaming retain the printed three-eighth groups. The shared
beaming helper uses dotted-quarter groups in compound meters, including 9/8,
while preserving ordinary quarter beats; its independent owner is
`packages/music-practice/tests/score-melody.test.ts`.
Source piano chord previews name the passing harmonies C-sharp diminished
seventh over B-flat and F-sharp diminished seventh over E-flat, retaining the
print's spelling rather than replacing E-natural with an enharmonic F-flat.

`the-old-rugged-cross-editions.test.ts` owns independently read pitch, duration,
tie and accidental goldens for all printed parts, complete verse/refrain
underlays, per-verse articulation, physical guitar grips, piano colours and the
whole/sliced form. The automatically required Nightly edition file covers all
four instrument/voice combinations at 320, 390, 768 and 1440 px in both engines.
Existing registry owners retain capo, audio scheduling, offline and shared
control coverage; no new lane or tier is introduced.
The edition's all-key vocal-guitar witness checks every selected grip through
the final transposition/rendering pipeline. Ranked chords are written after
transposition, so an ABC rewrite cannot lose natural cancellations between
different octaves. `piano-chord.test.ts` independently owns diminished intervals,
seventh spelling and slash-bass ordering; the edition browser exercises its
actual piano preview on desktop and phone.
