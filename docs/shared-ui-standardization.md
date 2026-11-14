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
