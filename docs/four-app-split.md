# Four-app split

- DoReGo: singing warm-ups (`apps/dorego`).
- NoteWise: theory, notes, piano/guitar recognition, patterns, rhythm (`apps/notewise`).
- SongAlong: piano hymn follow-me and playback (`apps/songalong`).
- Soundglow: spectrogram and pitch (`apps/soundglow`).

SongAlong retains the former Note by Note shell, sidebar/options layout and
controls. Teal accents, sea-glass surfaces and a piano/melody mark distinguish it
from NoteWise's violet identity. Their common implementation is in
`packages/music-practice`; ordinary shared controls remain in `packages/ui`.
The split preserves musical matching, sample audio, ties, hand selection,
transposition/range limits, passage selection/loops and offline update behavior.

No browser-state migration is provided. The existing Note by Note Vercel project
serves NoteWise from `apps/notewise`; SongAlong uses its own project rooted at
`apps/songalong`. Both allow workspace source access outside their app root.
SongAlong has a separate Sentry project and production upload credential.
DoReGo and Soundglow project roots stay the same.

Local commands, validation and deployment scripts are described in the root
README and app READMEs. App navigation is intentionally disjoint: NoteWise cannot
open hymns and SongAlong cannot open theory/flashcard routes. Each has its own
writer lock, IndexedDB database, diagnostics app ID, offline cache and manifest.

NoteWise and SongAlong keep fundamental selection, keyboard connection and volume
in the left navigation. The right options panel contains settings scoped to the
current exercise or hymn. Each remembers its own choices; volume and the keyboard
connection remain app-wide. On mobile the same global controls live in the
navigation drawer, with keyboard details expanding inline.

## Configured Vercel addresses

| App | Address |
| --- | --- |
| DoReGo | https://dorego-soundtools.vercel.app |
| NoteWise | https://notewise-soundtools.vercel.app |
| SongAlong | https://songalong-soundtools.vercel.app |
| Soundglow | https://soundglow-soundtools.vercel.app |

All four projects deploy from the repository's main branch. SongAlong uses Vite,
Node 24 and workspace-source access. Existing production addresses remain
available as well.
