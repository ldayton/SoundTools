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

Milestone 5 complete: ordinary headers/progress/feedback/completion now share React
presentation components across flashcards, theory, rhythm, patterns and hymns.
Controllers publish derived snapshots; score engraving, clocks, matching and
saved data stay with their original owners. Theory answers match the 48px note
answer targets. Tests assert accessible progress values instead of native element
implementation attributes. Build plus browser/theory/practice/hymn-playback,
passage and navigation checks pass. Next: remove superseded CSS/docs and final
frozen-build matrix, then release verification.

Milestone 6 complete: removed superseded field/progress/feedback/completion CSS,
unused continuation adapters and redundant direct wheel dependencies. Shared UI
owns the browser-control dependency; Note by Note fingerprints that source for
offline updates. Updated the UI package guidance to the completed Mantine setup.
Hymn filter wording explicitly identifies the melody range.

Final verification: 151 Note by Note and 62 DoReGo logic tests; shared package and
history checks; both root builds and DoReGo Pages build/type checks. Note by Note's
browser/navigation/theory/guitar/piano/hymn-key/practice/playback/sight/MIDI/
signature/offline suites pass in Chromium, Firefox and WebKit. Recovery, real
IndexedDB migration/failure/ownership, consent/privacy and recorded piano audio
checks pass. DoReGo's 15 desktop/Pages/lifecycle/offline/spelling combinations
pass, plus tempo continuity, PCM/mute/stalls, all glide directions, diagnostics
and cache resilience. The Mac output was verified muted during testing.

Verification refinements: browser-generated IDs require unique random values even
when musical test draws are deterministic. The shared MIDI fixture now preserves
that distinction. Hymn search uses Mantine's supported first-option selection
policy. Tests wait for rendered titles and exercise valid range changes, including
asserting that crossing a bound cannot silently move the other. Tempo/audio tests
accept a frozen preview URL; the source-module glide renderer retains its own
development server. Readiness requires an actual enabled Play button.

Native local Chrome inspection covered answer/next behavior, range popup/clear/
focus, common labels, and muted playback/pause. Final release work: push these
milestone commits, verify the deployment commit at both production aliases, inspect
CI, and interactively exercise the live apps. Production delivery results are
reported in the task handoff rather than changing code solely to record a deploy.

Production aliases: https://note-by-note-seven.vercel.app/ and
https://do-re-go.vercel.app/. Vercel project scope: team-lily.
