# Browser diagnostics 0.1.0

Small MIT-licensed browser layer shared by Soundglow and DoReGo. Canonical source:
`ldayton/Soundglow/packages/browser-diagnostics`. No runtime CDN dependency.

Consumers commit the same versioned tarball in `vendor/`, its SHA-256 provenance
pin, and an npm lockfile. `npm ci` works with either repository alone. Run
`node node_modules/@ldayton/browser-diagnostics/verify.cjs` in the consumer to
verify the pin and (for Soundglow) runtime copies. Normal app builds never reach
into another checkout.

To release a change, increment the package version, run `npm ci && npm test`
here, then run `node scripts/sync-diagnostics.cjs /path/to/DoReGo` from Soundglow.
Review and test both consumer updates before committing. The initial 0.1.0 is
unreleased; subsequent versions must not overwrite previously published tarballs.

Core records allowlisted numeric/enum context, bounded breadcrumbs, error codes
and source locations, and aggregated timings. It never records exception messages,
audio, pitch trajectories, user text, microphone labels, console logs, or network
bodies. Keep adapters equally strict. Source stacks retain static application URL
paths without queries or fragments. Do not pass arbitrary source URLs or dynamic
user paths.

Local persistence: app-namespaced IndexedDB, at most five sessions, 24 hours;
cleanup runs on persistence. Storage operations have 1.5-second deadlines (test/config override capped at five seconds). A stalled operation switches the local client to in-memory reports; late database connections are closed and outstanding transactions are aborted. Clear reports distinguishes successful persistent removal from memory-only cleanup. Browser shutdown and storage are best effort.
Reports can be downloaded/cleared from the collapsed Debug reports panel.

Remote reporting: optional Sentry browser DSN plus explicit app-scoped opt-in.
The separately bundled SDK executes only after consent. It has no default
integrations, replay, profiling, tracing, or automatic sessions. Offline queues
are app-namespaced, capped at 30 events, expire after 24 hours at send time, and
are cleared on opt-out. No server-side historical deletion is implied by opt-out
or local Clear. Already transmitted/in-flight requests cannot be recalled.
Sentry infrastructure necessarily receives network metadata such as IP addresses;
configure retention/access and IP scrubbing in the service before deployment.

Health summaries sample 5% of opted-in sessions, at most once per 30 seconds.
Errors are deduplicated, with a shared budget of 20 error reports per rolling minute and a bounded, expiring fingerprint cache. Clearing local reports does not reset the sending budget. Frame timing is not microphone/display
latency; background/inactive/warmup intervals are excluded. Timing uses bounded
128-sample rings: p95 is recent; count/mean/max cover the session.

Sentry SDK is pinned to 11.9.0; bundle using `npm run build`. Core is UMD for plain
scripts and CommonJS, with TypeScript declarations. DoReGo bundles the core via
Vite and emits the reporter as a self-hosted URL asset. Soundglow copies verified
files into its immutable release and offline cache. Downloading/cache installation
of that static asset is not reporting or execution.
