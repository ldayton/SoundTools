# Browser diagnostics 0.2.0

Shared, MIT-licensed browser diagnostics for DoReGo and Soundglow. Source is this
workspace package; both apps resolve the same code through the root lockfile.
The UMD core supports plain scripts/CommonJS; declarations support TypeScript.
The pinned Sentry SDK is bundled separately as a self-hosted static asset.

See [central diagnostics](../../docs/observability.md) for data contracts, privacy,
limits, failure behavior, production configuration, source maps and verification.

Edit `core.js` and `src/sentry.js`, run `npm run build:shared` and
`npm run test:shared` at the root, and commit generated `sentry.js` with the source.
Soundglow's copied browser assets are generated and ignored. Keep app adapters
small and their field allowlists strict. Event/metric names must be static technical
codes, never user text. Add metrics only at non-audio-thread instrumentation points.

The SDK is isolated from global scope and has no default integrations. Before-send
hooks filter all three data channels. Routine metrics stay in memory until the
scheduled flush; do not call SDK APIs directly from app rendering/audio code.
