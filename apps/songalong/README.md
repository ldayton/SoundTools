# SongAlong

Piano hymn practice and playback. Uses NoteWise's shared React/Mantine application
shell with a teal theme. Includes melody/bass arrangements, independent visible
and practising hands, MIDI, passage selection/looping, tempo/count-in, and offline
use. Start with `npm run dev --workspace=songalong` from the repository root.

Hymnal sources and credits are in `hymns/`. Rebuild the library with
`npm run import:hymns --workspace=songalong`; runtime music remains in the shared
practice package. No source music or audio uploads are sent to diagnostics.

Build: `npm run build --workspace=songalong`. Logic: `npm test --workspace=songalong`.
Browser checks: `test:hymn-keys`, `test:hymn-playback`, `test:sight`, `test:offline`,
and `test:diagnostics`. These use their own preview servers. For `test:split`,
build both NoteWise and SongAlong first.

Amazing Grace offers Piano and Guitar editions. Piano retains the imported
Excell melody, including its pickup, ornaments, slurs and five-beat ties, with
held left-hand chords spanning no more than a fifth. The D7 shell uses F♯–A–C
without the root to keep the hand compact. Guitar carries the complete melody
one octave below Piano in first position, with no capo. G–B and E–B dyads,
C basses and the F♯–C shell of D7 support the melody without string conflicts;
all fretted notes lie within frets 1–3. Chord symbols retain the reviewed harmony.
Full G (320003), C (x32010), D7 (xx0212) and Em (022000) shapes remain available
for chord-accompaniment practice. Both editions reduce inner passing voices
and inversions while retaining the source's Em/C and dominant
changes. Each verse lasts 48 quarter-note beats, with a one-beat pickup and a
two-beat final bar. All three source verses and credits are retained.

Instrument selection is separate from notation/tab or chords-only display and
practice-part selection. Guitar practice offers Full fingerstyle, Melody, and
Chord accompaniment independently of the visible score. A hold dash in the
chords-only chart represents a tied continuation.
`test:editions` checks these controls and engraving in desktop and mobile sizes;
`TEST_BROWSER=webkit npm run test:editions --workspace=songalong` exercises WebKit.
The Amazing Grace unit tests independently verify melody, chord voicings,
harmonic rhythm, verse duration, lyrics, and passages beginning or ending on ties.

In Christ Alone's Guitar edition is a two-voice fingerstyle setting with the
complete source melody in conventional octave-transposing notation, capo 2.
C/E and G/D bass dyads, single F basses, and Am/E support the melody. The bass
rests on the high C–B leap in bar 10 so the hand can shift to position VII;
position III and I indications guide the return. Chord symbols retain the
original C/F/G/Am harmonic rhythm. The full fingerstyle setting is distinct
from the optional full-shape chord accompaniment used for strumming practice.

Notation, rhythmic tablature, combined notation/tab, and a compact chords-only
lyric chart are display choices of the same Guitar edition. They do not alter
playback or practice selection. Wait-for-me practice independently selects
Full fingerstyle, Melody, or Chord accompaniment. The third verse retains its
shorter ending. Tests compare the melody against Piano, check simultaneous
string/fret feasibility, section pitches, capo playback, both endings, and
independent display/practice persistence.

I'll Fly Away now offers Piano and Guitar only, using the existing reviewed
lesson progression: C/F/G7, with V7 on “fly” in bars 7 and 15 and tonic held at
the first endings. Both melodies sound one octave below the imported source
(G3–G4), preserving all 53 attacks, slurs, the chromatic D♯ neighbor, the written
rest, internal tie, and final fermata. Short notes are beamed by quarter-note
beat. The verse starts at bar 1 and the shared chorus at bar 9; all three verses
use the same 16-bar, 64-beat form. Playback uses the written fermata duration.

Piano uses C–E dyads, lower F triads and a rootless B–D–F G7 voicing. Omitting
the C chord's fifth avoids a key shared by the two hands; all left-hand voicings
fit within a fifth. Guitar stays in first position without a capo, reaching fret
4 for D♯. C–E dyads, F basses and B–F G7 shells support the melody; bar 13 uses
only C bass to free the middle finger for A. Full C, small F and G7 strums remain
available as independent chord-accompaniment practice. The optional lesson strum
pattern accompanies the chords-only display. Notation, tab, combined notation/tab
and the chord chart all represent the same Guitar arrangement; changing display
does not change the practice part. Fermatas remain visible in tab and chord view.
