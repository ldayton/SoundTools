# Browser offline

Canonical source: this monorepo workspace package.

The CommonJS build API emits a self-contained worker runtime after `CONFIG.base`.
Both apps consume the same npm workspace source and embed the runtime directly in
`sw.js`; normal builds never read another checkout. No runtime CDN or registry.

Shared behavior: scoped GET filtering, metadata JSON storage, deadlines, complete
asset checks, atomic cache population or per-file SHA-256 verification, deduplicated
serialized staging, cleanup fences, live-tab protection, ten-minute navigation
grace, complete-release navigation fallback, and install/activate lifecycle.

Adapters own manifest validation, cache names/layouts, document consistency checks,
client messages, fallback ordering and cache eviction. DoReGo retains optional
sound downloads and a separate sound cache. Soundglow retains immutable release
paths, per-file integrity checks, explicit update preparation and shared assets.
Existing cache names, metadata schemas and messages remain compatible with old tabs.

From the repository root, edit this package and run `npm test`. Both consumers
resolve the same source through the root npm lockfile. Commit shared code and app
adapters together; no tarball synchronization or sibling checkout is needed.
`test:offline` and `test:updates` exercise actual generated workers, not a runtime
mock. Install all workspace dependencies with `npm ci` at the root.
