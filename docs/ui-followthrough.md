# UI consistency follow-through

Authorization: finish all six milestones autonomously, commit each tested local
milestone, then push, verify CI/deployments and interactively test both live apps.
Keep the computer muted. Do not rewrite musical, audio or persistence engines.

1. Mobile DoReGo repeats/rest use all desktop-supported values.
2. Shared responsive pitch field owns labels, desktop popup and native wheel lifecycle.
3. Note by Note options render pitch fields directly; remove placeholder DOM adapters.
4. Note by Note React shell owns ordinary route/layout/status presentation.
5. React/Mantine practice progress, feedback, completion and consistent answer targets.
6. Remove obsolete styling/docs and verify both frozen builds across browsers,
   storage/privacy/offline/audio regressions, then push and verify production.

Each milestone: inspect diff, implement a coherent boundary, run relevant local
checks, record evidence and commit. Continue without approval at milestone boundaries.
Use existing controllers for grading, timing, MIDI, navigation and saved data.

Checkpoint: starting from clean 9e36fee. No new changes pushed yet.

Milestone 1 complete: both DoReGo layouts expose repeats 0–15 and rest 0–16.
Pages build and browser checks pass, including choosing the maximum mobile values.
Next: consolidate responsive pitch fields and lifecycle ownership.

Milestone 2 complete: shared responsive pitch component owns labels, popup state,
mobile wheel and teardown. DoReGo uses it directly. Wheel keyboard input respects
constraints; all listeners and observers are cleaned up. Pages build/browser pass,
including mobile label focus and keyboard stepping. Next: render Note by Note
pitch fields directly from its existing option snapshots.

Milestone 3 complete: flashcard, theory and hymn options render their pitch fields
straight from controller snapshots. Removed native placeholder/replacement adapters
and their parked DOM. Build, navigation, theory, hymn keys, hymn playback and
passage-selection browser checks pass. Optional filters preserve no-matching-key
behavior and keyboard/mobile wheel input. Next: React-owned shell/status rendering.

Milestone 4 complete: React owns shell route visibility/layout, storage status,
legacy recovery notices and blocked interaction. Controllers publish status instead
of writing shell DOM. Stable retained activity/MIDI elements preserve cached rounds.
Build, navigation/history/MIDI and full recovery/storage tests pass on a fresh
local server. Fixed initialization parking for the retained MIDI portal during
verification. Next: ordinary practice presentation and answer sizing.
