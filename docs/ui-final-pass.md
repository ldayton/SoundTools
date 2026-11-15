# Final UI migration pass

Local-only work authorized on 2026-11-15. Commit each milestone; do not push.
The current ownership contract is in `ui-architecture.md` once this pass is complete.

| Milestone | Scope | Status and validation |
| --- | --- | --- |
| 1 | Shared numeric draft/commit/cancel/reset behavior | Complete: shared control contract in Chromium/Firefox/WebKit; all app type checks; Soundglow numeric/bookmark browser tests (11 passed). |
| 2 | Soundglow rebuilds UI changes during local development | Complete: dev-server regressions verify transitive imports, rebuild failure (503), recovery and uncached reloads. |
| 3 | Permanent shared-control and Soundglow cross-browser CI coverage | Complete: CI YAML parsed; exact focused commands passed locally in Firefox and WebKit (31 each); shared-control contract runs in the existing three-browser matrix. |
| 4 | Shared, discoverable Privacy section | Pending |
| 5 | Checked Soundglow controller/UI command and settings contracts | Pending |
| 6 | Isolated DoReGo playback position subscriptions | Pending |
| 7 | Library CSS ownership, common icons, bundle naming and current documentation | Pending |

Retain specialist audio, rendering and gesture owners. Use direct Mantine controls;
do not introduce a form generator or another settings store.
