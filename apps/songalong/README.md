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
