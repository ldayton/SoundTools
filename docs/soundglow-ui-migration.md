# Soundglow UI migration

## Current ownership

Soundglow uses one document-lifetime React root and the shared dark/orange
SoundToolsProvider. `src/ui/application-shell.tsx` owns navigation and retained
renderer hosts; library rows/menus/dialogs now join that same root. Explicit React
components own spectrogram/pitch settings, preset editors, microphone/example/file
transport, selection/bookmark creation, offline/update/consent/performance controls,
and welcome/status feedback. The shared consent, offline and volume components are
used directly. Native file input change handling is React-owned too.

`dist/app.js`, `workspace.js`, `audio-library.js` and `updates.js` retain validated
models, persistence, audio, analysis and cache policies. Their UI interfaces publish
small projections and receive commands. Renderer arrays and audio buffers stay
outside React; progress/time have isolated subscriptions. Retained canvas/waveform
hosts, their geometry, pointer gestures and ruler remain engine-owned. Controllers
never assign values/text/listeners inside React control trees.

The ordered commits, tests and limitations are recorded in
[soundglow-ui-migration-plan.md](soundglow-ui-migration-plan.md). The notes below
preserve the earlier milestones and their historical measurements.

## Initial foundation (historical)


The file/bookmark lists, context menus and rename/delete dialogs now use React and
Mantine. The existing spectrogram, pitch, capture, playback, waveform gestures,
settings models and IndexedDB store remain their owners.

## Source and build

- `apps/soundglow/src/ui/library-actions.tsx` owns one React root and the bounded
  library view. `AudioLibrary` publishes plain row metadata and supplies storage
  and playback commands. React portals own the contents of the two list hosts.
- The shared `SoundToolsProvider` accepts a dark color scheme; its light default
  remains unchanged for the three practice apps. Soundglow opts into dark/orange.
- Vite builds a synchronous browser entry and CSS into ignored `dist/ui/`. It is
  a classic IIFE during this milestone because the legacy audio controller needs
  its adapter before initialization. Node environment assumptions are compiled out.
- `npm run prepare:shared --workspace=soundglow` builds shared adapters and the UI.
  The existing dev/test/Vercel entry points already run this preparation. After
  editing UI source during a running source preview, run
  `npm run build:ui --workspace=soundglow` and reload.
- `scripts/dev-server.cjs` retains its no-store and fresh asset-namespace behavior.
  The release builder hashes and packages the generated UI beside the other
  immutable release assets. UI maps remain private and are uploaded to Sentry
  against those exact versioned URLs before deployment cleanup.
- The audio vendor builder has an explicit empty TypeScript configuration, so the
  new UI configuration cannot change its existing generated JavaScript.

## Interaction ownership

Mantine owns menu positioning, keyboard navigation, focus traps, modal dismissal
and ordinary controls. Right-click remains the primary library action; the
ellipsis and Shift+F10/ContextMenu key expose the same actions. Cursor and button
menus have separate floating references so switching triggers cannot retain an
old cursor anchor. The two-line name clamp and full-name tooltip remain.

The storage adapter retains rename/delete validation and transactions. Dialogs
keep entered text on failure, disable repeat submissions/dismissal while saving,
and restore focus to the invoking row or the import control after deletion.
Existing global playback shortcuts yield to menus and dialogs. Renderer arrays,
waveform peaks and audio buffers are not placed in React state.

React subscriptions and transient window listeners are released on teardown.
A back-forward cached document keeps its React owner and closes transient UI
instead of returning to a destroyed root.

The production library UI adds approximately 131 kB gzip JavaScript and 38 kB gzip
CSS. This is the React/Mantine foundation for subsequent UI migration; the canvas
and audio engines are not included in that bundle.

## Local checks

The existing core, visual/replay, update and offline tests remain the acceptance
suite. The library suite additionally covers dark theme, cursor/button anchoring,
keyboard and focus return, pending storage, stale saves, deletion fallback and
cached-page lifecycle. `SOUNDGLOW_TEST_BROWSER=firefox|webkit` can select an engine
for focused library checks; each engine gets separate result and report folders
so parallel checks cannot delete another run's traces. The complete DSP/performance
suite remains Chromium.
On macOS, Firefox needs the same isolated `CFFIXED_USER_HOME` test environment used
by the other apps. No installed user profile or permissions are changed.

Milestone verification: UI build/typecheck, the complete core suite, 12 shared
release tests, and offline/update recovery tests passed. The full Chromium suite
passed 151 tests with 34 intentional skips, without updating visual baselines.
The six focused library cases also passed in Chromium, Firefox and WebKit.
Native Chrome interaction covered import, rename, right-click, keyboard dismissal,
focus return and playback with the computer muted. The other three apps passed
their TypeScript checks against the shared provider change.

## Second milestone: application shell

`src/ui/index.ts` now mounts the React shell before the legacy audio controller
captures its elements. `application-shell.tsx` owns the header, Mantine view tabs,
sidebar actions, Files/Settings disclosures, hash navigation and breakpoint state.
Its viewport and inspector geometry live in `shell.css`; the old layered shell
rules and imperative navigation handlers have been removed.

This full-height audio workspace uses Mantine layout primitives with the shared
provider and `RetainedContent`, rather than the practice apps' document-scrolling
page layout. Existing chart canvases, settings bodies and audio transport nodes
stay mounted across view changes and breakpoints. Settings remain a desktop
inspector and a replacement view on mobile. The browser Back/Forward controls,
Escape, focus return and per-view settings scroll positions remain supported.
The old 3D page flip is replaced by ordinary visibility changes on mobile.

The shell's React effects own its window listeners. The root has the document's
lifetime: `pagehide` stops audio without destroying controls that pending cleanup
may still reference, and a restored cached page retains a usable shell. Branding
uses the icon URL from the release HTML, so it is served from the same verified
offline cache as the rest of the app. Settings fields, preset dialogs and transport
controls are deliberately retained for subsequent incremental milestones.

New browser regressions cover audio/canvas identity across resizing and navigation,
keyboard tabs, direct settings URLs, history, cached-page restoration and audio
shutdown. The spectrum unit harness now supplies the shell command boundary;
actual layout/focus/navigation assertions run against React in the browser.

Local acceptance: build/typecheck, the core suite, 12 shared release tests and
full offline/update tests passed. The complete Chromium run exercised 191 cases:
156 passed, 34 intentionally skipped, and one mobile detector test tried to edit
settings after Pause had returned to the chart. That test now reopens Settings
and passed on rerun. The final spacing build passed all 10 desktop/mobile shell
and layout cases; the shell/library/layout cases also passed in Firefox and
WebKit, with an additional final shell run in each. Golden baselines were not
regenerated. Native Chrome verified view switching, independent disclosures,
playback and sidebar dismissal with the computer muted.

The combined shell/library bundle is approximately 135 kB gzip JavaScript and
38 kB gzip CSS. No audio, pitch or drawing engines have moved into React state.

## Third milestone: spectrogram Display controls

The first settings slice is frequency ceiling, frequency scale and history.
`spectrogram-display.tsx` supplies Mantine `NativeSelect` and `Slider` controls
through a portal owned by the existing shell root. Available values, defaults
and slider bounds come from the authoritative `SettingsState` registry; only
human-readable option labels belong to the view.

The audio controller connects the edit command once and publishes the canonical
three-field projection after settings transitions, including preset loads and
validation recovery. It no longer writes values or attaches input listeners to
these React-owned controls. The slider's standard hidden form input preserves
form/value inspection; pointer and keyboard events go through the accessible
slider. Space while focused on a slider is excluded from global audio shortcuts,
matching the retained native input behavior. Seconds are announced using Mantine's
`thumbValueText` API.

Registry/UI completeness is now checked against rendered browser controls rather
than static HTML. Legacy preset tests use actual selection and slider keyboard
input for the migrated fields. Core validation, preset storage and DSP ownership
remain in their existing controllers.

Local acceptance: the complete core suite passed. The broader targeted run passed
56 settings/preset/continuity cases, including mobile and slowed-device checks;
its two new accessibility failures identified the missing seconds announcement.
After switching to the supported API, all 14 final desktop/mobile display and
navigation cases passed, as did three focused cases each in Firefox and WebKit.
Native Chrome verified native select behavior, slider edits, reset on reload and
visual layout. Existing visual goldens were not changed.
