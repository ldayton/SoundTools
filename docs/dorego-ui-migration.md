# DoReGo React/Mantine migration: unattended work plan

Status: in progress; shell milestone verified locally.

## Objective and finish line

Migrate DoReGo's application UI to React and Mantine, using the established
SoundTools provider and standard controls. Preserve its exercise behavior,
branding, responsive layout, audio timing, saved preferences, exports, privacy
and offline resilience. Finish all milestones below in one sustained assignment,
with tested local commits and a final review. Do not push or deploy.

Soundglow is outside this assignment. Note by Note changes are limited to checks
required when shared UI code changes; do not resume its migration or redesign it.

## Standing decisions

- Keep DoReGo's current builder/player arrangement. Do not add routes, a sidebar,
  a new Settings page, or features merely because another app has them.
- Use direct Mantine components with their default sizes, variants, spacing,
  focus and overlay behavior. Keep brand configuration minimal. Avoid custom
  replacements for standard widgets or a generalized form/action framework.
- One React root and provider own ordinary application UI. Exercise specifications
  and playback state have one validated owner; forms do not mirror them in a
  second independently maintained settings object.
- Keep music generation, audio scheduling, sample loading, canvas rendering and
  export rendering outside React. Do not feed audio frames or canvas animation
  through React state. Publish small UI snapshots only when their values change.
- Preserve storage keys, migrations, defaults and valid saved specifications.
  A UI migration alone must not invalidate preferences or restart a phrase.
- Keep the shared mobile NoteWheel behavior. Use Mantine for overlay placement,
  dismissal and focus; retain domain-specific pitch grids and contour drawings.
- Preserve the distinction between within-round contour and between-round
  progression, repeated endpoint/home notes, doubled rounds without rests,
  glide direction semantics, note spelling and iteration-range display.
- Keep offline controls below the builder at its width, and retain diagnostic
  opt-in. Do not restore the removed fullscreen button.
- Test in local Chrome on this Mac, not the built-in browser. Automated suites
  may drive their own Chromium, Firefox and WebKit instances. Keep audio muted.

## Work loop and checkpoints

For each milestone:

1. Read this plan, inspect the current diff and the last checkpoint; verify the
   actual source before trusting previous notes. Identify any unrelated edits.
2. Complete a coherent UI area, including removing the legacy handlers/styles it
   replaces. Keep the app usable throughout the migration.
3. Run the checks relevant to that area. Investigate failures rather than masking
   them with retries, relaxed assertions or blanket screenshot updates. Adapt
   tests to changed component structure while retaining behavioral coverage.
4. Review the diff for two state owners, direct DOM writes into React-owned
   controls, unnecessary abstractions, leaked listeners and timing changes.
5. Commit the tested milestone locally. Record its commit, checks, remaining
   risks and exact next action in the checkpoint section. Continue immediately
   to the next milestone; a commit is not a stopping point.

Run audio/performance suites sequentially to avoid introducing underruns through
competing test loads. Never rebuild an output directory while browser tests are
using it. Freeze the build for each browser matrix; builds for different targets
must use separate output directories or run sequentially.

Keep updates concise and meaningful: completed milestones, a discovered defect,
a changed approach, or a genuine blocker. Do not emit repeated status messages
when nothing has changed.

## Milestones

### 1. Establish the baseline and state boundary

- [x] Record existing build/test status and representative desktop/mobile views.
- [x] Inventory builder, transport, pitch controls, dialogs, footer/offline and
      diagnostics ownership in `apps/dorego/src/main.ts`.
- [x] Separate UI-facing specification/playback actions from element lookups only
      where needed for migration. Preserve `restoreSpec` validation and existing
      audio lifecycle guards; do not rewrite the music or player engines.
- [x] Add React/Mantine using workspace-compatible versions and Vite's React
      plugin. Preserve both `index.html` and `render.html` build entry points.
- [x] Introduce the single root/provider with a retained canvas boundary and an
      explicit mount lifecycle. Do not rely on delays for DOM readiness.

Gate: existing unit tests, production/pages builds and basic local practice work;
no competing settings owner or second React root is introduced.

### 2. Migrate the exercise builder

- [x] Replace ordinary exercise/instrument selectors with standard Mantine
      selectors. Remove the corresponding `AnchoredSelect` usage rather than
      keeping hidden native controls synchronized with a second visible widget.
- [x] Migrate contour/progression choices with correct semantics: single-choice
      controls for exclusive choices; checkbox groups only where multiple choices
      are valid. Preserve diagrams, availability and explanatory disabled states.
- [x] Migrate More options, repeat switches, counts and range controls. Keep exact
      existing bounds, defaults, conditional visibility and repeat behavior.
- [x] Use one source of truth for paired tempo controls. Permit temporary editing
      states without persisting invalid numbers or regenerating exercises on
      every keystroke. Preserve live tempo changes and playback position.
- [x] Keep desktop controls compact and mobile controls usable without making
      every option expand to the available screen width.

Gate: unit tests plus desktop, direction/repeat, tempo and spelling checks;
interactive desktop/mobile builder use and saved-preference reloads.

### 3. Migrate transport and supporting UI

- [ ] Migrate play/pause/resume/restart, seeking, volume, warmup/error/retry states
      and the current/next note and iteration-range presentation around the canvas.
- [ ] Preserve play-request cancellation, rapid repeated input guards, startup
      failure recovery, tempo continuity and completion/restart behavior.
- [ ] Migrate help dialogs, notices, offline status/actions and diagnostic consent
      using standard components, preserving their placement and privacy behavior.
- [ ] Keep the canvas drawing and the export page independent of component
      lifecycles. Re-rendering controls must not recreate the audio player/context.

Gate: audio playback, tempo, lifecycle and diagnostics UI suites; local repeated
play/pause/restart/seek use, including changes while audio is loading.

### 4. Finish pitch controls and remove migration bridges

- [ ] Put desktop pitch selection under Mantine's popover/focus behavior while
      retaining the musical grid and click-anywhere-to-choose behavior.
- [ ] Preserve shared mobile wheel scrolling, snapping, keyboard operation,
      lowest/highest constraints and displayed spelling.
- [ ] Reuse a shared pitch component only if comparison with Note by Note proves
      the same contract is useful; do not copy its implementation or build an
      artificial cross-app framework. Keep app-specific music rules in DoReGo.
- [ ] Remove obsolete dropdown/dialog code, event handlers, CSS overrides and
      hidden mirrored controls. Use Mantine's normal stylesheet once ordinary
      controls are migrated; remove temporary reset/import boundaries.
- [ ] If shared provider/picker code changes, run focused Note by Note regressions
      to verify the completed app remains unchanged.

Gate: mouse, keyboard, touch/wheel, Escape, outside-click and focus return checks;
anchoring near viewport edges and after scrolling/resizing; no duplicate IDs or
invisible overlays retaining focus.

### 5. Verify release behavior and complete the milestone

- [ ] Review accessibility, tab order, labels, touch targets, text clipping,
      responsive wrapping and keyboard shortcuts at desktop and narrow widths.
- [ ] Compare build/startup cost with baseline. Investigate repeatable playback,
      render or allocation regressions using the existing performance evidence;
      do not route hot audio/display paths through React to simplify the UI.
- [ ] Verify local root and `/DoReGo/` builds, direct loading, asset URLs, export
      rendering and the offline pack. Shared UI assets must affect release hashes.
- [ ] Verify latest-code updates, cached startup, interrupted downloads, missing
      assets, recovery/retry, and preservation of active practice during updates.
- [ ] Run the final relevant Chromium/Firefox/WebKit matrix and local Chrome
      interaction checks on the frozen final build. Inspect intentional visual
      changes before accepting updated snapshots.
- [ ] Commit the final review and verification record; leave a clean working tree
      except for explicitly identified unrelated user changes. Do not push.

Final acceptance: every ordinary DoReGo control has a clear React owner; obsolete
UI code is removed; domain engines remain intact; all required checks pass; the
app is running locally for inspection. Physical device tests are not a hidden
requirement: distinguish simulated browser lifecycle/device tests from hardware
behavior that cannot be exercised unattended.

## Verification map

Use the actual workspace scripts, checking their environment/port requirements
before running them:

- Logic/shared contracts: `npm test --workspace=dorego`.
- Builds: `npm run build --workspace=dorego` and
  `npm run build:pages --workspace=dorego`.
- Builder/browser/layout: `test:e2e`, `test:desktop`, `test:pages`, `test:spelling`.
- Music/transport: `test:tempo`, `test:glides`, `test:audio`, `test:lifecycle`.
- Resilience/privacy: `test:offline`, `test:resilience`, `test:diagnostics-ui`.
- Existing cross-browser runner: `npm run test:browsers --workspace=dorego`
  runs desktop/pages/lifecycle/offline/spelling sequentially per browser. Check
  coverage before adding other supported suites; do not assume its matrix covers
  every audio or UI test.

Run focused checks after each change and the full relevant matrix at completion.
Do not repeatedly run unchanged expensive suites without a new concern.

## When to stop

Stop only when the finish line is met, or when meaningful progress requires a
user decision or access that cannot be obtained independently. Normal coding,
test failures and routine framework choices are work to resolve, not reasons to
pause. If one area is blocked, continue independent work where safe.

Ask before changing product behavior that cannot be preserved within the agreed
scope, introducing an external service, or taking an action outside local work.
Do not push, deploy, erase user data or change system audio/device settings beyond
the already-established muted testing setup. Do not overwrite conflicting user
edits; isolate the work or ask if the conflict cannot be resolved safely.

## Checkpoint log

Shell checkpoint: baseline unit/build/pages/desktop checks passed. Added one React root/provider, a retained practice workspace and a Mantine Help modal. Root and pages builds, desktop PCM/playback/lifecycle checks, pages controls/credits and a focused Note by Note navigation regression passed. Verified locally in Chrome. Next: migrate the builder into controlled React components.

For each completed milestone record: commit; meaningful changes; exact passing
checks; unresolved concerns; next action. Update this file so a later context can
resume from evidence without reconstructing the whole conversation.

Builder checkpoint: controlled Mantine exercise/contour/progression/More options/count controls now call validated spec actions. Removed form reads and hidden value mirrors. Retained pitch adapters await milestone 4. DoReGo logic tests (61), pages controls/persistence/credits and desktop PCM/lifecycle checks passed; Note by Note logic tests passed after sharing the small view-state helper. Shell commit: `c34f894`. Next: React-owned playback and offline/privacy surfaces.
