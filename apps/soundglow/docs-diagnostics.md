# Diagnostics

See the monorepo's [central diagnostics guide](../../docs/observability.md) for
collection, privacy, setup, source maps, retention and validation. The adapter is
`dist/diagnostics.js`; the implementation is `packages/browser-diagnostics`.

Run `npm run test:diagnostics` in this workspace. For WebKit coverage, run
`TEST_BROWSER=webkit npm run test:browser --workspace=@ldayton/browser-diagnostics`. Requests are intercepted.
