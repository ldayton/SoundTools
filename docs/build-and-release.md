# Build, validation and production releases

## Normal pushes and pull requests

CI runs shared unit tests once, then validates only affected apps. Each app builds
and runs its focused tests in one job, followed by a short WebKit smoke check at
MacBook Air and iPhone sizes. Firefox is no longer part of CI; local suites may
still use it explicitly.

The focused checks retain transport/audio, instrument input, responsive workspace,
and SongAlong fingering coverage. They omit exhaustive hymn/arrangement catalogs,
visual snapshots, every backing genre, and full offline-update scenarios from the
release path. Those checks run in the regression profile.

The maximum normal run is 12 jobs: changes, shared tests, four app validations,
one account validation, a summary gate, and four independent releases. Most app
changes select fewer jobs. There are no build-artifact upload/download jobs.
Failure screenshots and traces are still uploaded.

Account integration tests run in Chromium only, and only for account, auth,
persistence, sync, database or infrastructure changes. Changing an ordinary app
screen, scale algorithm or style does not start three backend environments.

Each app release depends on its own validation and shared checks. A NoteWise test
failure cannot block a validated SongAlong release. Required account checks still
block releases when account-related code changed. The summary validation gate
reports the combined result for pull requests; releases do not depend on that
all-app gate.

## Nightly and manual regression checks

Nightly runs validate all apps in Chromium and WebKit, without publishing. Select
`full` when manually dispatching CI for the same exhaustive suites. A manual run
without `full` runs the focused checks for all apps, also without publishing.

The regression profile retains complete hymn catalogs, visual snapshots, backing
realism and genre checks, offline updates, MIDI and notation tests. Each app and
browser owns one job rather than expanding catalogs and snapshots into many
small runner jobs. These jobs have a 30-minute budget and never gate an unrelated
normal-push run.

## Change selection and builds

Workspace dependencies determine affected consumers. Unknown workspaces, lockfiles
and root infrastructure changes are handled conservatively; docs alone do not
start browsers or publish. A push is compared with its previous source revision,
then each app's live `build-info.json` is checked separately. Thus cancelled or
failed runs cannot hide unpublished source changes, and an unrelated failed
workflow does not reset every app's validation baseline.

Each app builds once in its validation job. The built files retain app, source SHA,
profile and digest provenance, and tests use `CI_USE_BUILD=1` to reject stale
bundles. Normal SongAlong checks do not build NoteWise; only regression cross-app
boundary tests need that fixture. Account tests keep separate local Supabase
configuration, and those bundles are never used for publication.

Local commands:

```sh
npm ci
npm run test:ci-unit
CI_USE_BUILD=1 TEST_BROWSER=chromium node scripts/ci/check-app.cjs songalong focused
CI_USE_BUILD=1 TEST_BROWSER=webkit node scripts/ci/check-app.cjs songalong regression
```

The focused command also needs Chromium and WebKit installed. Regression needs
its selected browser. Browser checks mute Chromium, block service workers except
in explicit offline tests, and retain bounded, credential-redacted diagnostics.
No test assertion is automatically retried. Browser installation and local
backend startup each permit one bounded infrastructure retry.

Packaging verifies all advertised resource sizes and SHA-256 hashes against the
same limits used by service workers. This runs locally and on the final Vercel
output. Production candidates still have to pass public-page, asset-integrity,
responsive rendering and isolated-email-confirmation checks before promotion.

## Release and recovery

Each `production-<app>` GitHub environment allows only `main` and holds one
project-scoped `VERCEL_TOKEN`. Rotate it before expiry through Vercel account
settings, verify that another project is inaccessible, and replace the matching
environment secret. Protected projects also hold a project-only
`VERCEL_AUTOMATION_BYPASS_SECRET`. Staged checks send it only to the exact staging
origin, refuse redirects and disable request traces while it is in use. Live
checks run without it, verifying public access. Deployment protection stays on.
Do not store a CLI sign-in token in GitHub or the repository.

The release job builds the exact validated SHA as a staged production deployment.
A rerun reuses an existing viable stage for that SHA. It verifies source metadata,
privacy headers, all critical advertised assets and a representative audio file.
It also opens the actual candidate at MacBook Air and iPhone 14 Pro sizes and
checks that email confirmation does not acquire practice storage or a writer
lock. After promotion it verifies the canonical domain's deployment ID and runs
the same live checks there.

When provisioning fails, fix the infrastructure and rerun the failed job. When
code or an assertion fails, correct it and run the affected suite locally before
pushing. A deployment quota error requires waiting for the platform allowance;
retrying every project repeatedly only spends more requests. Keep the current
verified release live until the new stage passes. Vercel rollback remains the
recovery path for an already-promoted release.
