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
without the root to keep the hand compact. Guitar is a singing accompaniment
in standard tuning, no capo, using G (320003), C (x32010), D7 (xx0212) and Em
(022000); it is not a solo melody arrangement. Both editions reduce the source's
inner passing voices and inversions while retaining its Em/C and dominant
changes. Each verse lasts 48 quarter-note beats, with a one-beat pickup and a
two-beat final bar. All three source verses and credits are retained.

Instrument selection is separate from notation/tab display and hand practice.
`test:editions` checks these controls and engraving in desktop and mobile sizes;
`TEST_BROWSER=webkit npm run test:editions --workspace=songalong` exercises WebKit.
The Amazing Grace unit tests independently verify melody, chord voicings,
harmonic rhythm, verse duration, lyrics, and passages beginning or ending on ties.
