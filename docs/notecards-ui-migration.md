# Note by Note UI migration

Scope: finish the Note by Note React/Mantine migration locally. Preserve music,
audio, MIDI, saved progress and offline behavior. Commit tested milestones; do not push.
DoReGo and Soundglow are outside this milestone.

## Completed foundation

- [x] Shared provider, Settings and application shell.
- [x] Hymn search and options, shared flashcard settings, theory settings.
- [x] Cross-browser interaction coverage for the migrated forms.

## Completion checklist

- [x] Finish guitar-scale viewer controls and standardize rhythm/pattern settings ownership.
- [x] Make React own the shared options/sidebar structure; remove duplicate collapse state and per-header DOM portals.
- [x] Migrate exercise answer and playback controls to standard components while keeping timing/grading in controllers.
- [x] Finish specialized picker integration and replace temporary CSS imports/reset boundaries.
- [x] Review accessibility, bundle/startup cost, saved-state compatibility and offline behavior.
- [x] Run the relevant desktop/mobile and Chromium/Firefox/WebKit suites; complete final local interactive verification.

Notation renderers, piano/fretboard drawings, audio processing and MIDI remain
purpose-built engines. React owns their surrounding application UI; retained DOM
adapters are appropriate for these specialized renderers, not a second UI framework.

## Checkpoints

- `932934b`: theory options migration; build, 150 unit tests and three-browser theory checks passed.

Scale options and single-owner settings verified with the guitar-scale, practice and navigation browser suites.

Unified React sidebar verified with navigation, all-hymn/offline, recovery, theory and scale-viewer checks, plus local desktop/mobile interaction.

Exercise controls now share the application React root and Mantine provider. Letter/modifier answers, theory choices, transports, passage actions, scale navigation/details and MIDI connection controls use Mantine components. The pitch grid uses Mantine placement/dismissal/focus trapping with explicit Escape focus return for its retained composite field. Removed general legacy button/select styling and switched to Mantine's standard stylesheet. Unit tests (150), targeted browser checks and local desktop interaction passed; the final review also checks recovery and the complete browser matrix.

## Final review

- One application root/provider; direct Mantine components for ordinary controls. Remaining retained DOM is notation, piano/fretboard drawing, pitch fields/wheels and controller-owned score/status rendering. The audio clock, MIDI matching and grading stay outside React.
- Control snapshots notify only when their serializable values change. Rhythm frames and audio samples do not flow through React state. Cached activities keep their exact progress when navigating.
- Pitch overlays follow their anchors, fit the viewport, trap focus, support arrow navigation and Escape, return focus to the pitch input, and close when switching activities or collapsing options. Cached theory keyboards have distinct panel IDs.
- Default Mantine CSS replaces the partial import/reset boundary. Domain styling remains for notation and instrument diagrams. Letter answers have 48px touch targets; musical accidentals retain readable notation typography. Standard action buttons wrap at their content width.
- Final build's main JavaScript is 574.44 kB gzip, essentially unchanged from 574.32 kB before the control migration. Full Mantine CSS is about 42.2 kB gzip (about 20 kB more than the partial stylesheet). This trades a small download increase for the library's maintained defaults. The existing large notation bundle remains a separate optimization opportunity.
- No saved-data version changes. Migration, round completion, pause/bookmarks, multiple-window ownership, future-version rejection, blocked storage and quota failures are covered by recovery checks.
- Offline build fingerprints include the shared UI. All three browsers passed install/update, protection of active practice, fast cached startup, unvisited routes, missing/corrupt files, eviction, repair and retry in the existing offline suite. Diagnostics remain opt-in with privacy filters; real-SDK upload/retry tests cover the Settings controls.

Browser tests use the shared sidebar instead of looking inside the music renderer for controls. Tests wait for responsive redraws and React's displayed state; passage clicks center targets below the fixed header. The corrupt-storage fixture unloads its writer before injection so pending saves cannot repair the fixture mid-test.

## Completed validation

- Production build and all 150 unit tests passed.
- Chromium, Firefox and WebKit: letter/modifier answers, piano controls, theory, rhythm/pattern practice, scale viewer, simulated MIDI, route/history/sidebar behavior, hymn playback, passage selection/looping, all 44 hymn scores at desktop/mobile widths and separate-hand recovery passed.
- All three browsers: saved-state/ownership/storage recovery and offline install/update/startup/repair passed.
- Chromium: responsive workspace, all key signatures, guitar exercise modes, exhaustive notation geometry, recorded piano output/volume and real-SDK diagnostic consent/privacy/retry checks passed.
- Final build repeated letter-answer, navigation/focus, theory, practice and passage checks in all three browsers after the last styling/accessibility adjustments.
- Interactive local Chrome checks covered desktop and 390px mobile navigation, options, pitch popovers, scale transposition/relative positions, readable accidentals, Settings labels and 48px letter targets. Temporary viewport overrides were reset; the computer remains muted. Physical MIDI hardware was not exercised.

Everything remains local. No push or deployment was performed.
