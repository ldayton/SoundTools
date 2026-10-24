# Shared browser debugging

The implementation lives in `../../packages/browser-diagnostics`; see its README for
privacy, lifecycle, retention, and workspace details. Both apps consume the same
workspace source through the root lockfile. Their app adapters are intentionally
small: Soundglow `dist/diagnostics.js`, DoReGo `src/diagnostics.ts`.

## Current behavior

No remote endpoint is configured by default. Local technical reports are bounded,
retained best-effort for 24 hours/five sessions, and downloadable under collapsed
Debug reports (Soundglow: Developer settings). Users can clear retained reports.
Errors include stable codes/source locations rather than potentially sensitive
messages. There is no audio, pitch/formant history, or user-entered text in reports.
Microphone permission refusal is an expected action, not an error.

Captured app failures cover microphone/example startup, analysis and reconfiguration,
worklet processor errors, global exceptions/rejections, cache setup, DoReGo sample
preparation/playback, and offline download failures. Offline/cancellation paths
are not deliberately reported as bugs. Context includes active build, source/view,
safe configuration values, visibility, browser family and sample rate where known.

Timing summaries include foreground frame intervals, supported-browser long tasks, and available app processing
measurements. These are diagnostics, not calibrated end-to-end audio latency.
Audio callbacks do not perform storage or telemetry. Local writes are asynchronous
and reports never block audio playback. The background SDK queue is bounded.

## Enabling online reporting

Create separate Sentry browser projects. Configure retention/access and IP scrubbing
there; automatic sharing sends technical data to Sentry and necessarily exposes
network metadata to the provider. Keep Session Replay/profiling disabled.

Set GitHub repository variable `SOUNDGLOW_SENTRY_DSN` in Soundglow and
`DOREGO_SENTRY_DSN` in DoReGo (public browser DSNs, not auth tokens). Local builds
use environment variables `SOUNDGLOW_SENTRY_DSN` and `VITE_SENTRY_DSN` respectively.
Build/deploy as usual. Each user must independently enable sharing in each app.
Without a DSN the checkbox is disabled; local export works. Verify a synthetic
coded error in the correct release/project after configuration, then remove it.
No Sentry project or service-side settings have been provisioned by this change.

DoReGo emits hidden source maps. Deployment retains them in a GitHub Actions
artifact for 14 days, removes them from Pages, and excludes them from offline
precache. Artifact access follows repository access (a public repository's CI
artifacts must not be treated as secret). Source-map upload to Sentry is not yet
automated: configure its project/authentication first and associate the maps with
the exact `dorego@<report.release>` and deployed asset URLs. Until then, reports
still have release IDs/error codes/locations and maps can be used locally.
Soundglow's app scripts are unminified; the Sentry bundle is vendor code.

## Validation

Soundglow `npm run test:diagnostics`: provenance, boundedness/privacy/unit tests,
actual SDK consent/offline queue/opt-out/IndexedDB browser contract. Its normal
visual suite includes UI/export/worklet-error capture during English playback.
`TEST_BROWSER=webkit node tests/diagnostics-browser.cjs` checks Safari's engine.
All telemetry in these tests is intercepted; tests never contact a real project.

DoReGo `npm run test:diagnostics` verifies the pin; `npm run test:diagnostics-ui`
checks collapsed UI, report download, privacy, clear/reload and build identity.
Normal pages/offline/playback tests remain the regression checks for audio.

Real iPhone/Android collection and a real Sentry ingestion/source-map smoke test
remain necessary after choosing projects. Browser-engine tests are not physical
phone tests. Local storage may be evicted, blocked, or lost on abrupt shutdown;
export is the fallback when the network or remote service is unavailable.
