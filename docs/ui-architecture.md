# Current SoundTools UI architecture

This is the current ownership and development contract for all four apps.
Migration plans and checkpoint reports are historical records. The completed
final pass is recorded in [ui-final-pass.md](ui-final-pass.md).

## Owners

| App | React UI | Specialist owners |
| --- | --- | --- |
| DoReGo | `apps/dorego/src/app-shell.tsx`, builder, practice controls and Settings | Exercise generation, audio scheduling, canvas and export |
| NoteWise | `packages/music-practice/src`, selected by the NoteWise profile | Notation, piano/fretboard rendering, MIDI and exercise controllers |
| SongAlong | The same music-practice shell and components, selected by the SongAlong profile | Hymn interpretation, playback, matching and passage gestures |
| Soundglow | `apps/soundglow/src/ui` | Existing capture, DSP, analysis workers, file storage, playback, waveform and canvas controllers |

A shared RenderErrorBoundary surrounds each provider and shell. A fatal render
error reports through the app diagnostics, shuts down audio and practice input,
and replaces the failed tree with a focused Reload screen. Recovery preserves
saved data and reloads the current URL; it does not retry a damaged session.

Each app has one React root and one SoundToolsProvider. Ordinary controls use
Mantine directly, including its normal layout, sizes, focus and overlay behavior.
Specialist renderers retain stable hosts across React updates and responsive
layout changes. Never write ordinary values, text or listeners inside a React
control tree from an imperative controller.

DoReGo, NoteWise and SongAlong use the shared ApplicationLayout and
PracticeWorkspace: navigation/selection, device connection and Settings on the
left; universal volume and the active exercise's compact actions in the top bar;
exercise-specific options on the right on desktop and in an initially closed
mobile drawer. NoteWise keeps answer controls beside the question, while
SongAlong and DoReGo use their musical transport toolbars. Responsive options
forms and retained renderer hosts preserve their identity across layout changes.
Soundglow keeps its graphics-first dark inspector.

## Shared components and contracts

`packages/ui` owns the provider, practice layout, standard action rows, committed
numbers, tempo/volume, pitch fields, Privacy section, diagnostic consent, offline
panel, common control/panel icons and retained-content boundary.

CommittedNumber uses Enter or blur to commit and Escape to cancel. Empty or
invalid text restores the current value; bounded values clamp. Step controls
commit immediately. A controller can reject a value or explicitly reset an edit.
Integer input is the default; decimal settings opt in. Drafts never become a
second settings owner.

Small serializable view snapshots use createViewState/useSyncExternalStore.
Playback position/time subscriptions are isolated from ordinary controls.
Audio buffers, spectra and frame arrays stay outside React.

Soundglow's `src/settings-contracts.ts` defines closed settings keys and command
value types. Its typed pitch-settings adapter translates UI commands into the
existing FeatureState model and preserves persistence failure/retry behavior;
it does not own a second copy of settings. Runtime model validation remains
necessary for saved data and external inputs.

All four apps expose the same user-facing Privacy section. Local performance
measurement tools remain separate from consent to upload diagnostic information.
Offline storage, optional-model downloads and safe-update activation remain
service/controller responsibilities rather than generalized UI components.

## Source and development

The three practice apps use their Vite development entry points. Soundglow's
`npm run dev --workspace=soundglow` runs the uncached preview with a Vite build
watcher covering the full UI import graph, including shared packages. Reload to
apply a successful rebuild; active audio is never interrupted by automatic reload.
HTML/UI requests wait during builds. Failed builds return 503 instead of serving
an older UI; fixing the source automatically restores service.

Soundglow emits `dist/ui/soundglow-ui.js` and `.css` as ignored generated files.
Its synchronous IIFE preserves the existing controller startup order. The release
packager hashes them into immutable offline releases, keeps source maps private
and uploads maps against the corresponding release URLs. Existing engines remain
in `dist/*.js`; moving those sources or converting all DSP to TypeScript is not a
requirement of this UI migration.

Library row styles live beside their React view in `src/ui/library.css`.
`dist/style.css` owns specialist artwork, canvases and retained-host geometry;
`src/ui/shell.css` owns the Soundglow React shell. Theme variables supply ordinary
control colors.

## Verification

- `npm run test:ui` tests real shared controls, including draft/cancel/rejection,
  external changes and DoReGo's isolated clock subscriptions. TEST_BROWSER selects
  Chromium, Firefox or WebKit; the existing DoReGo CI matrix runs all three.
- `node scripts/test-practice-layout.cjs <app> [dist-pages]` checks the same
  responsive/focus/retained-host contract against each built practice app.
- Soundglow's full suite runs in Chromium. `test:ui-browsers` supplies permanent
  focused Firefox/WebKit CI coverage for shell lifecycle, controls, presets,
  library menus/dialogs, privacy and responsive ownership.
- Soundglow's controller tests check the real model registry, validation, failed
  persistence, retries and compile-time misuse of settings commands.
- App-specific audio, MIDI, notation, offline and resilience suites remain in
  place; shared UI checks do not replace those tests.

Tagaluya uses `ApplicationLayout` and `PracticeOptionsProvider`/workspace for
service navigation, song selection and responsive drawers. Reading controls use
the shared toolbar and committed number control. The browser-controls package
owns directional gesture recognition and the injectable shell offline lifecycle;
practice apps and Tagaluya share these implementations. Bilingual melody reading
is a thin adapter over the music-practice score layout, not a separate engraver.
