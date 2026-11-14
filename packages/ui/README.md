# SoundTools UI

One React root and `SoundToolsProvider` per application. Import ordinary widgets
straight from `@mantine/core`; the provider changes only the primary brand color
and imports Mantine's complete default stylesheet. Keep its normal sizes,
spacing, typography, focus and overlay behavior unless a musical control needs
special treatment.

Share behavior with real consumers, not wrappers around every library component:

- `responsive-pitch-field`: owns labels, desktop popup, optional mobile wheel,
  dismissal, focus and lifecycle. Callers supply musical choices/constraints.
- `tempo-control`, `committed-number`, `volume-control`: common editing and mute
  presentation; controllers retain musical timing and saved-unit conversions.
- `diagnostic-consent`, `offline-status-panel`: consistent presentation while
  service clients retain consent and caching lifecycles.
- `round-actions`: repeated round navigation; no grading or playback logic.
- `retained-content`: stable boundary for existing notation/instrument renderers.
- `view-state`: stable serializable UI snapshots. Do not send audio frames or
  buffers through React state.

Shared styles are limited to the specialized pitch grid/wheel's geometry. Use
Mantine theme variables for their colors. Apps retain their own navigation and
musical rules; common components must not become another settings owner.

Both applications include shared UI and browser-control sources in their release
fingerprints. Preserve this whenever adding consumers so offline builds update
when shared code changes.
