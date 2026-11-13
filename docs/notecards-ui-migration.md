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
- [ ] Migrate exercise answer and playback controls to standard components while keeping timing/grading in controllers.
- [ ] Finish specialized picker integration and replace temporary CSS imports/reset boundaries.
- [ ] Review accessibility, bundle/startup cost, saved-state compatibility and offline behavior.
- [ ] Run the relevant desktop/mobile and Chromium/Firefox/WebKit suites; complete final local interactive verification.

Notation renderers, piano/fretboard drawings, audio processing and MIDI remain
purpose-built engines. React owns their surrounding application UI; retained DOM
adapters are appropriate for these specialized renderers, not a second UI framework.

## Checkpoints

- `932934b`: theory options migration; build, 150 unit tests and three-browser theory checks passed.

Scale options and single-owner settings verified with the guitar-scale, practice and navigation browser suites.

Unified React sidebar verified with navigation, all-hymn/offline, recovery, theory and scale-viewer checks, plus local desktop/mobile interaction.
