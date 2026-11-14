# Soundglow UI migration — first milestone

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
