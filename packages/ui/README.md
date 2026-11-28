# SoundTools UI

Current cross-app architecture: [docs/ui-architecture.md](../../docs/ui-architecture.md).

One React root and `SoundToolsProvider` per application. Import ordinary widgets
straight from `@mantine/core`; the provider changes only the primary brand color and page tone
and imports Mantine's complete default stylesheet. Keep its normal sizes,
spacing, typography, focus and overlay behavior unless a musical control needs
special treatment.

Share behavior with real consumers, not wrappers around every library component:

- `responsive-pitch-field`: owns labels, desktop popup, optional mobile wheel,
  dismissal, focus and lifecycle. Callers supply musical choices/constraints.
  An optional compact range adds an Extended range toggle without changing selected notes.
- `tempo-control`, `committed-number`, `volume-control`: common editing (Enter/blur commit, Escape cancel, optional decimals/rejection/reset) and mute
  presentation; controllers retain musical timing and saved-unit conversions.
  Toolbar volume popovers and inline volume controls include a separate mute/unmute
  action, restoring the mounted control's last audible level (50% if opened muted
  without a prior level). Both use the existing volume callback and saved values.
- `privacy-section`, `diagnostic-consent`, `offline-status-panel`: consistent presentation while
  service clients retain consent and caching lifecycles.
- `round-actions`: repeated round navigation; no grading or playback logic.
- `retained-content`: stable boundary for existing notation/instrument renderers.
- `control-icon`, `panel-icon`: fixed shared SVG artwork for common actions.
- `view-state`: stable serializable UI snapshots. Do not send audio frames or
  buffers through React state.

Shared styles own the practice shell, surface framing and specialized pitch
field geometry. Use Mantine theme variables for their colors. Apps retain their
musical rules; common components must not become another settings owner.

All three practice applications include shared UI and browser-control sources in
their release fingerprints. Preserve this whenever adding consumers so offline
builds update when shared code changes.

## Layout

DoReGo, NoteWise and SongAlong use these components directly with Mantine defaults:

- `UpdateBar`: one centered, 48px update row below the main toolbar on desktop
  and mobile. Update actions stay accessible when navigation is collapsed.
- `ApplicationLayout`: 72px header, 244px navigation, mobile navigation drawer,
  accessible collapse/focus controls, page title and content container.
- `PracticeOptionsProvider`, `PracticeWorkspace`, `PracticeOptionsReopen`: one
  300px options column from 70em upward; a closed disclosure above practice below
  that width. Desktop and mobile expansion choices are independent.
- `PracticeActions`: content-sized, wrapping action rows. Activity controllers own
  labels, enabled states and playback/grading behavior.
- `SettingsSections`: offline content, consent and credits in a consistent page.
- `SoundToolsProvider`: Mantine defaults with app accent and optional page tone.

The application supplies navigation, routing and activity content. Opening panels
must preserve retained practice/audio elements. Music-specific score fitting,
piano key sizing and rendering remain with their existing controllers.
NoteWise and SongAlong adapt their registered options into the shared provider;
that registry is not part of the general UI package.

DoReGo uses `#settings` so the same page remains directly accessible on its root
Vercel build, subdirectory/static pages build, and cached offline shell. The other
apps retain their existing `/settings` routes.

`node scripts/test-practice-layout.cjs <app> [dist-pages]` from the repository root
checks the same layout contract against each built app. `TEST_BROWSER` selects
Chromium, Firefox or WebKit. The app CI jobs run this contract after building.

The shared UI browser contract (`scripts/test-ui-controls.cjs`) runs once per
engine in the Nightly NoteWise group and covers all four application layouts.
Real update staging and reload remain owned by each app’s offline tests.

`usePracticeOptions()` exposes the existing options context, including
`closeMobile()`, for consumers whose selection should dismiss the mobile drawer.

`ToolbarNumber` uses explicit minus/plus buttons automatically on touch layouts.
Set `stepper` to keep that same control on desktop as well; numeric entry, bounds,
step size and committed-value behavior remain shared with the default field.

`PracticeOptionsProvider` accepts `purpose="contents"` for navigation panels.
It keeps the shared drawer, sidebar and focus behavior, with Open/Close contents
labels and a larger list-icon trigger. The default options presentation is unchanged.

`SwipePager` uses native horizontal snap scrolling with vertically scrollable
pages. Only touch, horizontal wheel, or arrow-key input may select a page.
Prop alignment, resizing, and incidental browser scroll settlement preserve the
selected value. `blocked` cancels pending paging and realigns the selected page.
Inactive pages remain inert and hidden from accessibility navigation.
