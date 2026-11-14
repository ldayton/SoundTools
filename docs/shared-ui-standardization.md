# Two-app UI standardization

Scope: DoReGo and Note by Note. Incremental local commits only; no push/deploy.

1. Share the controlled pitch field and retained-renderer boundary. Remove Note by
   Note's native field chrome/listeners; preserve app note spelling, written pitch
   vs MIDI values and mobile wheel behavior. Test keyboard, overlays, range forms.
2. Use explicit range constraints without silently moving the other endpoint.
   Preserve different musical spans and optional hymn filters. Separate tempo
   edits from rhythm generation. Standardize tempo entry, volume/mute, action
   hierarchy and boolean exercise options. Preserve distinct practice modes.
3. Share diagnostic consent, offline-status presentation and duplicate round
   actions; use the existing snapshot helper for simple duplicated stores. Keep
   offline/audio engines and navigation app-specific. No universal form framework.
4. Test both apps locally, including cross-browser behavior, offline/privacy,
   music timing and shared-component regressions. Keep sound muted. Record tests
   and commit each coherent milestone; leave the local previews available.

Milestone 1: both apps use `@ldayton/ui/pitch-field` and the same retained-renderer
boundary. Note by Note no longer retains a custom input/button inside its popup;
ordinary values, roles and focus targets belong to React. App-specific spelling,
diatonic/chromatic choices and optional hymn values remain in adapters. Mobile
wheels retain their existing shared implementation. Root builds pass for Note by
Note and Pages for DoReGo; Note by Note browser/theory/hymn-key/navigation checks
and DoReGo Pages checks pass. Next: constraints, rhythm tempo and consistent
volume/actions.

Milestone 2: shared tempo entry/stepping and percent-volume controls. All tempo
fields accept integer BPM values within their existing limits, with five-BPM
step buttons; numeric drafts commit on blur/Enter. Rhythm tempo changes stop
safely but preserve the exact saved bars. Range choices cannot cross the other
endpoint; DoReGo additionally applies its musical span. Home/End and mobile
wheels respect those constraints. Optional hymn limits remain filters that can
produce no matching key. Native wheel observers/timers now have cleanup for
React lifecycles. DoReGo repeat options use checkboxes, primary practice actions
use filled buttons and restart wording is consistently Start again.

Passing checks: 151 Note by Note logic tests, 62 DoReGo logic tests (including
volume conversion/mute), both builds, Note by Note navigation and piano-audio,
DoReGo Pages and desktop PCM/lifecycle checks. Browser regression verifies tempo
preserves the committed rhythm and range keyboard edits never move the other
bound. Saved DoReGo volumes retain their dB schema. No push/deploy.

Milestone 3: shared diagnostic-consent checkbox and offline-status panel, keeping
both caching services independent. Shared consent owns subscription/error UI;
app state remains in the diagnostics client. Shared round actions/continuation
remove flashcard/theory duplication. Note by Note shell/offline snapshots now
use the existing helper; React-node registries remain separate. Both roots use
StrictMode and the same render-error reporting policy. Native retained widgets
have a stable boundary; optional hymn clear action now uses Mantine and returns
focus to the visible pitch control. Ordinary pitch labels use Mantine styling.

Both builds, both diagnostic/privacy suites, Note by Note navigation and DoReGo
Pages pass. Next: freeze final builds, broaden browser/audio/offline regression
coverage and inspect local desktop/mobile previews. No push/deploy.
