# Final UI migration pass

Local-only work authorized on 2026-11-15. Commit each milestone; do not push.
The current ownership contract is in [ui-architecture.md](ui-architecture.md).

| Milestone | Scope | Status and validation |
| --- | --- | --- |
| 1 | Shared numeric draft/commit/cancel/reset behavior | Complete: shared control contract in Chromium/Firefox/WebKit; all app type checks; Soundglow numeric/bookmark browser tests (11 passed). |
| 2 | Soundglow rebuilds UI changes during local development | Complete: four dev-server regressions verify transitive imports, pending startup requests, failure (503), recovery, uncached reloads, repository-root launch and watcher shutdown. |
| 3 | Permanent shared-control and Soundglow cross-browser CI coverage | Complete: CI YAML parsed; exact focused commands passed locally in Firefox and WebKit (31 each); shared-control contract runs in the existing three-browser matrix. |
| 4 | Shared, discoverable Privacy section | Complete: all app type checks; Soundglow consent/organization browser checks (12 passed), including visible opt-in without expanding developer tools. |
| 5 | Checked Soundglow controller/UI command and settings contracts | Complete: closed setting identifiers/value types, typed pitch command adapter using the existing model, compile-time misuse checks, five controller regressions and 34 settings/preset browser checks. |
| 6 | Isolated DoReGo playback position subscriptions | Complete: actual React component subscription contract passes in all three browsers; DoReGo pages build and desktop audio/seek/tempo/volume/navigation checks pass. |
| 7 | Library CSS ownership, common icons, bundle naming and current documentation | Complete: consolidated themed row styles; shared SVG controls; soundglow-ui release/map filenames; one current architecture document linked from historical records. Final checks below passed. |

Retain specialist audio, rendering and gesture owners. Use direct Mantine controls;
do not introduce a form generator or another settings store.

## Final local verification

- All four TypeScript checks and all three practice-app production builds passed.
- Shared package/repository tests passed. DoReGo 63, music-practice 134 and
  SongAlong 31 unit tests passed; Soundglow core/controller tests passed.
- Shared-control contracts passed in Chromium, Firefox and WebKit, including
  numeric draft/rejection/reset behavior and isolated DoReGo clock subscriptions.
- The common layout contract passed for all three practice apps at five widths.
  DoReGo desktop PCM, rapid toggles, seek, tempo/volume, resize, saved controls,
  replacement and interruption tests passed.
- Soundglow's full Chromium browser suite passed: 194 enabled cases, 39 intended
  exclusions. Final Firefox and WebKit UI suites passed 31 each (7 intended
  exclusions each). Automated desktop/mobile screenshots were inspected.
- Soundglow release/source-map packaging, real service-worker updates, cancellation,
  failed deployments, corrupted startup recovery and optional-model offline
  inference tests passed. Packaged resilience also passed: cached startup with
  a hanging update, offline browser restart and stalled cache storage.
- Four development-server regressions passed, including a real command launched
  from the repository root and graceful shutdown of the watcher.
- CI workflow YAML parsed. Remote CI/deployment was not run: nothing was pushed.
- Verification was automated; no final hands-on Chrome check was performed.

The temporary editing state and controller adapters remain bounded. Audio timing,
DSP, MIDI, notation, storage and gestures retain their existing owners. No generic
form generator, replacement state library or DSP rewrite was introduced.
