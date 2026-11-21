# Shared music practice

`@ldayton/music-practice/notewise` boots the theory/reading application;
`@ldayton/music-practice/songalong` boots the hymn application. Each runs under a
build-time app profile. The common React/Mantine shell, responsive options,
settings, piano, MIDI, notation engines, audio, offline runtime, and persistence
are shared source. No app imports another app's implementation.

The catalog contains typed music/activity metadata; its app projection owns
navigation and route visibility. Browser activity factories are separate, so
SongAlong never imports the NoteWise activity loader and NoteWise never imports
the hymn controller/library. The build emits separate HTML, assets, manifests,
cache names, diagnostics releases, writer locks, databases and consent state.

Vite configuration and offline build tooling live here; each app's config calls
`practiceConfig` with its identity. Applications retain their own public branding,
host configuration, entry point and browser suites. Common model tests live in
`tests`; hymn tests and original source credits live with SongAlong. MIDI fixtures
and the real-SDK privacy/app-boundary checks are shared test support.

The obsolete mixed-app workspace scenario is replaced by the current navigation,
piano, notation, hymn, passage and app-split suites. Cross-app navigation is no
longer an in-app route: unsupported routes show a recovery link to that app's
own practice page. Existing browser data is intentionally not migrated.

NoteWise and SongAlong keep fundamental selection, keyboard connection and volume
in the left navigation. The right options panel contains settings scoped to the
current exercise or hymn. Each remembers its own choices; volume and the keyboard
connection remain app-wide. On mobile the same global controls live in the
navigation drawer, with keyboard details expanding inline.

NoteWise's `ActivityHost` owns entry, exit, interruptions and input eligibility for
both flashcard and live activities. The flashcard adapter retains its session
owner and letter/fret grading; live controllers retain their performance grading.
`FeedbackAdvance` cancels work both before and after a pending save resolves, so
leaving an activity or losing focus cannot advance a suspended question.

SongAlong's screen coordinates existing score, passage and matching engines.
`HymnProgress` owns per-hymn preferences and content-checked checkpoints;
`hymnPlaybackScore` prepares continuous audio independently of engraving. Keep
layout, transport and persistence changes within those respective boundaries.

## Reviewed instrument editions

`src/instrument-editions.ts` is the registry for reviewed Piano/Guitar editions.
It owns instrument availability and capabilities: capo, tempo, reading guide,
fingering/position callbacks, system layout, and optional strumming guidance.
Consumers use those capabilities rather than branching on song IDs.
`chord-editions.ts` preserves the existing import surface.

`arrangeHymn` runs one lifecycle for every registered edition: build its musical
setting, select the passage and practice voices, normalize instrument notation,
and attach landmarks. `edition-score.ts` shares the grand staff/octave-clef
rules, complete-score voice selection, capo pitch conversion, tempo captions,
and Roman position-mark recognition. Display selection stays in the renderer;
it never chooses the practice part.

`instrument-hymn.ts` builds melody plus reviewed accompaniment from data. It
preserves melody tokens and rhythm, beams by beat, aligns chord changes (including
changes under held notes), applies register choices, and handles strummed versus
fingerstyle voicings. Fly Away, Jesus Loves Me and Faithful use this builder.
The earlier Christ Alone and Grace settings retain their reviewed musical builders
behind the same registry contract. Blues fingering, positions and turnaround
choices live in `fingerstyle-blues.ts`, outside generic rendering code.

Adding an edition means providing its musical data/builder, reading guide and registry entry,
not adding branches to settings, score orchestration or engraving. Use the shared
builder for compatible forms; keep voicings, finger choices and exceptional phrase
endings with the song. Add independent musical fixtures and browser engraving
checks. `instrument-edition-contract.test.ts` additionally freezes pitches,
timing, rests, ties, slurs, chord symbols and landmarks across all six existing
songs, both instruments, all practice parts, and every passage size.
