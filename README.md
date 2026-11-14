# SoundTools

Four independent apps in one npm workspace:

| App | Purpose | Directory |
| --- | --- | --- |
| DoReGo | Singing warm-ups | `apps/dorego` |
| NoteWise | Music theory, note recognition, guitar and rhythm | `apps/notewise` |
| SongAlong | Piano hymn practice and playback | `apps/songalong` |
| Soundglow | Spectrogram and pitch analysis | `apps/soundglow` |

Use Node 24. At the repository root run `npm ci`, then `npm run build:shared`.
Start NoteWise with `npm run dev --workspace=notewise` (port 4320) and SongAlong
with `npm run dev --workspace=songalong` (port 4321). Each has its own build,
HTML, manifest, icons, offline cache, diagnostics identity, and saved practice.
There is no migration of the former Note by Note browser data.

`packages/music-practice` holds the shared React/Mantine shell, music components,
MIDI, piano audio, persistence, and offline tooling. Its separate entry points
include only each app's activities. SongAlong uses the same layout and controls
as NoteWise, with a teal theme and its own mark. `packages/ui` holds controls also
used by DoReGo. The two apps share implementation, not application state.

Soundglow's `dist` directory is authored source, not disposable build output.
Its generated static site is `site`. Generated browser support assets come from
`packages/browser-diagnostics` and `packages/browser-offline`.

## Validation

Run `npm test --workspace=notewise` and `npm test --workspace=songalong` for logic
checks. Build both apps, then `npm run test:split --workspace=songalong` for the
cross-app shell and route contract. Browser suites accept `TEST_BROWSER=chromium`,
`firefox`, or `webkit`. Hymn tests live with SongAlong; theory/reading/guitar tests
live with NoteWise. GitHub CI has a separate three-browser job for each.

`npm run build:dorego`, `build:notewise`, `build:songalong`, and `build:soundglow`
prepare Vercel outputs. Each project's root must match its directory under `apps`
and allow source access outside that root. The existing Note by Note Vercel
project serves NoteWise from `apps/notewise`; SongAlong has its own project
rooted at `apps/songalong`. All four deploy from main.
Configure separate Sentry projects/DSNs and upload credentials; never reuse a
DSN under a different app identity. Diagnostic sharing remains opt-in.

The shared release publisher verifies retained immutable assets and strips source
maps after optional Sentry upload. Set `RETAIN_FROM_ORIGIN` only after an app's
first verified production release. Each app preserves its own offline/update
behavior and cached startup.

## History

Original DoReGo and Soundglow commits remain unchanged. `npm run verify:history`
checks their original tips are still ancestors; see `scripts/history.json`.
This split uses ordinary file moves and preserves repository history.

NoteWise and SongAlong keep fundamental selection, keyboard connection and volume
in the left navigation. The right options panel contains settings scoped to the
current exercise or hymn. Each remembers its own choices; volume and the keyboard
connection remain app-wide. On mobile the same global controls live in the
navigation drawer, with keyboard details expanding inline.
