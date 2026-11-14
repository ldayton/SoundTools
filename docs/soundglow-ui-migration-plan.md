# Soundglow: remaining React/Mantine migration

## Starting point and authorization

- Library menus/dialogs and dark theme: `1b4df1f`.
- Application shell: `7d6a7d8`.
- Spectrogram Display controls: `84ca66b`.
- These milestones are committed locally. Publication is not part of this plan.
- Execution of the whole plan was authorized by the user on 2026-11-14.
  Work through the checklist autonomously,
  test locally and commit each completed milestone. Do not push, deploy or alter
  production configuration without subsequent authorization.
- Implementation notes and completed verification live in
  [soundglow-ui-migration.md](soundglow-ui-migration.md).

## Boundaries and control idioms

React owns ordinary controls, disclosure state, dialogs and their rendered values.
Existing controllers keep ownership of validated settings, presets, persistence,
audio sessions, worker requests and drawing. UI snapshots are projections of
controller state; do not create a parallel settings or playback model in React.

Use Mantine defaults for sizes, spacing, keyboard behavior, focus and portals.
Use NativeSelect for short fixed choice lists, Slider for bounded continuous
adjustments, Checkbox/Switch according to established semantics, and Modal/Menu
for dialogs and actions. Numeric fields may keep a temporary editing draft;
only valid committed values enter the controller. Test clearing, typing, blur,
Enter, Escape and external preset changes. Preserve meaningful decimal steps.
The existing shared CommittedNumber currently accepts integers only: do not use
it unchanged for decimal settings or silently change its other consumers.

Use the shared provider, view state and retained-renderer utilities. Reuse the
shared consent, volume and offline panels where their behavior fits. Soundglow's
optional-model download/resume controls must retain their capabilities. Extract
new shared components only when at least two real consumers need the same
behavior. Do not introduce a settings form generator or generic widget framework.

Each migrated subtree has exactly one UI owner. Remove its old markup, listeners
and value writes in the same commit. Standard Mantine hidden form inputs are fine;
retained native controls acting as shadow proxies for React controls are not.
Keep canvas nodes and audio engines stable across React updates and resizing.

## Ordered implementation checklist

Each numbered item is a separate reviewable commit. Split an item further if
its behavior or test failures turn out to cross controller boundaries.

| Step | Bounded scope | Required behavior to verify |
| --- | --- | --- |
| 1 ✓ | Spectrogram colour and contrast | Palette, brightness, dynamic range, normalization mode, fixed maximum, suppression, pre-emphasis and compression. Preserve conditional visibility/disabled states, units, preset identity and live repaint without capture reset. |
| 2 ✓ | Formant controls | Visibility, smoothing, filtering and ceiling. Preserve overlay-only changes versus analysis rebuilds, and clear old overlays when disabled or when applying a preset. |
| 3 ✓ | Advanced spectrogram analysis | Window, shape, analysis rate, frame step, FFT padding, DC removal, units, resampling and quality. Preserve dependent controls, pending/committed analysis separation and failure recovery without restarting the source. |
| 4 ✓ | Advanced spectrogram colour | Normalization clock, frequency/frame interpolation, peak history and decay. Preserve decimal precision, frozen redraw and retained-history performance. |
| 5 ✓ | Basic pitch display | Minimum/maximum, axis, history and smoothing. Keep editable numeric drafts usable and enforce the existing cross-field bounds on commit. Preserve plot and settings state across feature switches. |
| 6 ✓ | Pitch detection controls | Method, speech gate, confirmation and uncertain-jump policy. Preserve supported methods, optional-model fallback, pending rebuild state, error recovery and paused playback. |
| 7 ✓ | Pitch trace controls | Drawing/edge modes, confidence, voicing ceiling, outline, gap bridging, widths, sampling, aggregation, jumps, corners and markers. Preserve conditional controls and original pitch data; rendering settings must not rewrite measurements. |
| 8 ✓ | Pitch targets and reference bands | Band visibility, target/reference mode, target bounds and editable reference ranges. Preserve validation and stable field identity while editing. Keep stored presets compatible. |
| 9 ✓ | Spectrogram preset selector and dialog | Move selection and create/rename/delete UI to React. Preserve built-in immutability, named edits, validation, storage-error retry, focus return and toast behavior. Leave storage policy in the controller. |
| 10 ✓ | Pitch preset selector and dialog | Migrate against the existing feature-state model. Share the ordinary form/dialog presentation from step 9 only where semantics match; keep each preset model's policy intact. |
| 11 ✓ | Microphone and example controls | Device selection/refresh, permission and disconnected-device states, start/stop/pause/resume, example seek/loop/listen/restart and credits. Preserve pending-operation guards, privacy and mobile return-to-chart behavior. |
| 12 | File playback controls | Play/pause/restart, skip, loop, speed, volume and playback options. Preserve playback intent through loading/seeking, end-of-selection restart and desktop-only saved-file support. |
| 13 | Selection actions and bookmark creation | Fit/clear selection, bookmark naming/save/cancel and passage bounds. Keep the reserved row geometry; preserve exact selection/view restoration, loop defaults, validation and failed-save retry. Retain the existing waveform gesture engine. |
| 14 | Offline, update and diagnostic UI | Render current offline/download/update states through React and appropriate shared panels. Keep cache/update/worker logic in its existing controllers. Preserve cancellation/resume/quota/error states, safe update activation, opt-in diagnostics and data scrubbing. Include performance enable/reset/export. |
| 15 | Remaining status and welcome UI | Welcome actions, status/readouts, notices and progress. Make asynchronous statuses accessible and React-owned without publishing per-frame canvas data to React. Use the established Mantine feedback idioms. |
| 16 | Migration cleanup and final acceptance | Remove obsolete selectors, handlers, adapters and temporary bootstrap assumptions. Consolidate shell/library UI into one provider/root if their ownership can now be combined safely; preserve portal focus and cached-page behavior. Keep custom canvas/audio/gesture code outside React. Complete the final checks below. |

## Autonomous execution loop

For every checklist item:

1. Inspect the exact controls, their state owner, persistence and existing tests.
   Record the small scope and expected behavior in the execution log below.
2. Implement that scope using the established controller-to-view projection.
   Preserve saved settings and existing public behavior unless a necessary change
   is explicitly documented. Resolve routine layout/component decisions directly.
3. Build/typecheck before browser testing. Run the affected controller tests and
   browser scenarios through real keyboard, pointer and native control actions.
   Update tests that depend on obsolete DOM structure, keeping their behavioral
   assertions; do not bypass hidden/disabled controls to obtain a pass.
4. Check desktop and mobile, plus focused Firefox/WebKit coverage for newly used
   widgets or changed focus/input behavior. Use same-Mac Chrome for a concise
   manual walkthrough of the completed group, with the computer muted and public
   test audio. Use simulated hardware/failures where real hardware is unavailable
   and report that limitation explicitly.
5. Review the diff for competing state owners, lingering legacy writes, duplicated
   constraints and unnecessary abstractions. Remove the superseded UI code now,
   rather than scheduling a separate cleanup for each field.
6. Commit only after the applicable checks pass. Record the hash, exact commands,
   results and any remaining limitation in the execution log. Mark the item done,
   then proceed to the next item without seeking routine confirmation.

If a regression appears, diagnose and fix it within the current milestone, or
split the milestone into smaller independently working commits. Never label a
failed check unrelated without evidence. Do not weaken assertions, regenerate
DSP goldens or hide test failures to obtain a passing result. If a corrected test
is rerun, record the original failure and why the test changed.

Pause for an actual product decision, destructive data operation, credential
approval, missing access/hardware that prevents verification, or a blocker that
cannot be resolved safely. Otherwise continue. Provide concise updates when a
finding, milestone or blocker changes; avoid repetitive "still working" messages.

## Local verification strategy

- **Every milestone:** UI build/typecheck, affected controller tests, focused
  desktop/mobile interaction coverage and diff review. Check direct settings
  links, hidden controls, units, validation, keyboard shortcuts and focus when
  relevant. Add tests for uncovered behavior, not for trivial component wiring.
- **Settings-family checkpoints (after 4, 8 and 10):** complete core suite,
  registry/UI completeness, preset storage/error coverage, source identity,
  paused/live continuity and appropriate rendering tests. Include slowed-device
  checks when slider/numeric edits could increase redraw or analysis work.
- **Transport checkpoint (after 13):** source/pause/view/action combinations,
  repeated play/pause/seek, stale async completions, file switching, selections,
  bookmark restore/reload, source interruptions and responsive transitions.
- **Offline checkpoint (14):** real service-worker/update tests, offline startup,
  cached branding/assets, transfer cancellation/resume, worker termination,
  corruption recovery, quota/storage failures and diagnostics consent/scrubbing.
- **Final acceptance:** complete Soundglow build/test pipeline; full Chromium
  visual/numeric/performance suite with existing goldens; focused Firefox/WebKit
  coverage of all migrated UI families; release/source-map packaging checks;
  and same-Mac Chrome walkthrough on desktop and a mobile viewport. If shared
  components changed, run affected tests/typechecks for their other consumers.

Use the existing commands in `apps/soundglow/package.json` and Playwright projects.
`npm run build:ui --workspace=soundglow` builds/typechecks; `test:core`,
`test:visual` and `test:updates` are the broad checkpoints. Focused runs use
`npx playwright test <affected specs>` from `apps/soundglow` after building.

Builds and preparation may replace `dist/ui`; never run them while a browser suite
is reading that directory. Give concurrent browser runs distinct ports and output
folders. Firefox on this Mac uses an isolated temporary `CFFIXED_USER_HOME`, as
in the completed milestones. Never modify the installed user profile. Do not
repeat full expensive suites after passing unless another change or unresolved
failure justifies doing so.

## Completion criteria

- All ordinary Soundglow controls and dialogs use React/Mantine or established
  shared UI components, with consistent input, focus, disabled and error behavior.
- Legacy controllers do not mutate React-owned control trees. Canonical settings,
  persistence, audio, analysis and drawing each have one clear owner.
- Imported files, bookmarks, saved presets and diagnostic consent remain intact.
- No regressions in analysis, pitch data, playback, selection, cached startup,
  updates, rendering or performance. Any intentional visible change is documented.
- The checklist and execution log distinguish implemented, tested and committed
  work. All final checks pass, working tree is clean, and nothing is pushed.

## Execution log

### Step 1 completed

Colour/contrast controls retain SettingsState ownership; React owns values,
units, conditional visibility and disabled states. Extracted the slider
presentation used by history and contrast. Fixed a real regression exposed by
continuous slider events: a failed named-preset write now remains visible during
subsequent drag events. Tests no longer write DOM values behind React's back.

- Build/typecheck: `npm run build:ui --workspace=soundglow` passed.
- Pure validation/transport: `node tests/settings-state.cjs` and
  `node tests/spectrum.cjs` passed from the app directory.
- Browser: settings-state, presets and overlays specs across desktop/mobile:
  44 initially passed; four failed (two tests per viewport). The manual-input
  test was updated to use real controls; the failed-write test exposed the bug
  fixed above. All four passed on rerun.
- Native Chrome: held-peak mode disables dynamic range and hides fixed maximum;
  sidebar and native select interaction verified with the saved public fixture.
- Next: step 2, formant controls.


For each milestone append: scope; controller/view ownership; changed behavior;
commands and results; manual browser verification; commit hash; and the next step.

### Step 2 completed

Previous milestone commit: `9054e8d`. Migrated formant display, smoothing,
filtering and ceiling through the existing SettingsState projection. Removed
legacy markup/listeners for these fields. Build/typecheck and pure settings,
real-WASM overlay, and spectrum/transport tests passed. Focused formant-controls,
overlays and settings-state browser specs passed all 16 desktop/mobile cases
(`/tmp/sg-m2-tests.log`). Native Chrome verified the native formant selector and
immediate preset identity update with the public saved fixture. Next: step 3.

### Step 3 completed

Previous milestone: `688f324`. Advanced analysis uses explicit NativeSelect
controls with registry-owned values, a Mantine Accordion, and reactive resampling
quality enablement. The mounted hidden panel continues receiving canonical
snapshots. Audio Space shortcuts yield to Accordion controls. Authored option
labels are retained as data, with no generated form schema.

Build/typecheck, pure settings, spectrum and real-WASM handover tests passed.
Advanced-controls, settings-organization and settings-state: 18 desktop/mobile
passes; the new keyboard/closed-panel case also passed Firefox and WebKit.
Native Chrome verified opening the disclosure and enabling quality via polyphase.
Tests now inspect actual disclosure state, rather than a native `open` attribute.
Next: step 4 and the spectrogram-family checkpoint.

### Step 4 completed — spectrogram checkpoint

Previous milestone: `6af8820`. Advanced colour now uses a second ordinary Mantine
Accordion with explicit choices and unchanged decimal option values. Removed the
last legacy spectrogram setting value writes and listeners; controllers publish
canonical snapshots to all spectrogram controls.

`npm run test:core --workspace=soundglow` passed completely. Browser checkpoint:
continuity, settings-state, replay, voice-speech and display-controls, 30 passes
including desktop/mobile, Retina and both 4x-slowed cases. Existing canvas/DSP
goldens were used unchanged. Native Chrome verified peak-decay selection at 0.999.
Next: step 5, pitch display and committed numeric editing.

### Step 5 completed

Previous milestone: `9ba326f`. Pitch minimum, maximum, history, axis and smoothing
now use the shell's React projection. Numeric bounds are exported by FeatureState
and used by both validation and the view. Added decimal-capable local numeric
drafts with Enter/blur commit, Escape cancel, spinner changes and external reset.
No changes to pitch measurement or drawing algorithms.

Build/typecheck and feature/preset/transport model tests passed. The first browser
run passed 22 cases and exposed two repeated-validation failures. Diagnosis found
NumberInput internal formatting retained a rejected edit; rejected fields now
reset their own widget state, and preset resets are separate from validation.
Removed forced React renders from pitch publication to avoid event reentrancy.
All four recovery cases passed (including spinner editing); the numeric test
passed Firefox/WebKit again. Native Chrome committed a minimum of 75 via the real
input. Temporary debug instrumentation was removed. Next: step 6.

### Step 6 completed

Previous milestone: `c333173`. Detector method, speech gate, confirmation and
uncertain-jump controls now use React NativeSelect/Checkbox inputs. Controller
edit/persistence/rebuild logic stays in workspace.js. Legacy writes/listeners for
these fields were removed. Build/typecheck and feature/preset model tests passed;
features, pitch-presets and neural-gate browser specs passed all 32 desktop/mobile
cases. The speech/confirmation case also passed Firefox and WebKit. Native Chrome
verified the speech checkbox and preset identity. Tests expand the real disclosure
instead of setting its DOM `open` property. Next: step 7.

### Step 7 completed

Previous milestone: `3944ee9`. Trace drawing, edges, confidence/ceiling, widths,
bridging, grouping, gaps, jumps, corners and markers now use React. The advanced
trace panel is a Mantine Accordion retaining mounted canonical fields. Numeric
limits moved into FeatureState's exported frozen metadata and replace duplicated
validation bounds; measurement/grouping algorithms are untouched. Preserved the
existing labels and option values. Build/typecheck and pitch feature/preset model
oracles passed; 24 features/pitch-presets/numeric desktop/mobile cases passed.
Native Chrome verified speckles disables marker choices without losing the value.
Next: step 8 and the pitch-family checkpoint.

### Step 8 completed — pitch checkpoint

Previous milestone: `d6c4025`. Targets, reference ranges, validation feedback and
reset now use React; range field identities stay stable across mode switches.
Bounds come from FeatureState metadata. Removed the remaining imperative pitch
field tree creation, value/checked writes and listeners. Controllers still own
preset persistence, measurement, grouping and drawing.

Complete core suite passed. Browser checkpoint: 28 features/presets/numeric/fake
microphone desktop/mobile passes; production pitch replay and long-history
pruning both passed (four intended unsupported/corpus skips). Both numeric/range
cases passed Firefox/WebKit. Native Chrome edited Band 1 low from 85 to 90.
Next: step 9, spectrogram preset selector and modal.

### Step 9 completed

Previous milestone: `4ef4844`. Spectrogram preset selection and create/rename/delete
now use Mantine controls and a React modal. Persistence stays transactional in the
controller; failed writes keep the editor and draft available for retry. Removed
the old dialog/listeners and selector writes. Escape routing also handles a key
pressed before portal focus transfer, and focus restoration avoids inspector
scrolling. Modal transition tests now await actual closure before measuring final
layout; all existing layout assertions remain. The dialog is unmounted when closed.

Build/typecheck and pure settings, spectrum and release diagnostics checks passed.
Preset browser coverage passed desktop/mobile, with save/retry and Back/focus checks
in Firefox and WebKit. Native Chrome confirmed Escape returns to the editor opener
without closing Settings. Next: step 10, reuse the editor for pitch presets.

### Step 10 completed — preset checkpoint

Previous milestone: `78d2dc3`. Pitch presets now share the selector/editor
presentation with spectrogram presets, with independent controller/state policies.
Removed native selector/dialog listeners and writes. Fixed silent storage failure:
create/delete are persisted before committing, and failed live named edits become
unnamed while leaving the last saved preset intact. The error remains visible and
retry remains possible. Native Chrome verified the editor and cancellation/focus.

Complete core suite passed, plus 20 desktop/mobile pitch/preset cases, two extra
failed-live-edit cases, and shared editor checks in Firefox/WebKit. No DSP goldens
changed. Next: step 11, microphone/example transport controls.

### Step 11 completed

Previous milestone: `a3d2bd6`. Header/desktop transport buttons, microphone choices
and refresh, example seek/loop/listen/restart and credits now use React/Mantine.
Controllers own microphone IDs, capture, source transitions and example options;
there are no native proxy controls or competing control writes. Progress updates
are isolated from the other transport components. A generation guard discards
retired microphone enumeration results. Space on inspector buttons now keeps its
normal button behavior. Welcome actions remain in the planned step 15 subtree.

Build/typecheck and the 40-combination controller oracle passed. Existing
shell/features/fake-microphone/organization coverage: 24 desktop/mobile passes.
After progress isolation and enumeration guarding, 18 shell/organization/new
transport cases passed; focused Firefox/WebKit transport checks passed. Native
Chrome verified pause, listen off and restart at zero while remaining paused.
Next: step 12, saved-file playback controls.
