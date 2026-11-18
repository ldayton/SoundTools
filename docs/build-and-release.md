# Build, validation and production releases

The single CI workflow owns publication. Git-triggered Vercel deployments are
disabled in each app's `vercel.json`. Vercel projects keep automatic domain
assignment disabled: only a verified release job can promote a staged build.

## What runs

`scripts/ci/affected.cjs` follows npm workspace dependencies, including transitive
consumers. Shared music code reaches NoteWise and SongAlong; account/UI changes
reach all consumers. Unknown and deleted workspaces are treated conservatively.
Documentation does not deploy. Test-only changes validate their consumers without
publishing them. Root build configuration and lockfile changes validate all apps.

Validation compares against the last successful main push, so cancelled pushes
cannot lose untested changes. Publication separately compares against the
`build-info.json` served by each production app. Thus a green-but-unpromoted
revision is still published by a later push, even if that push only changes docs.
An unavailable or invalid baseline causes more validation, never less.

Nightly and manual runs validate the complete matrix without publishing.
Superseded validation jobs cancel per branch, browser and shard. Production jobs
are serialized per app and are never cancelled midway through promotion. The
release checks main again immediately before promotion; an obsolete candidate
stays staged.

## Builds and profiles

The build matrix runs fast app unit tests, builds each affected app once and
uploads a compressed artifact. Browser jobs restore that artifact, verify its
app, source revision, `ci` profile and file digests, and do not compile it again.
SongAlong's split-boundary test also needs a NoteWise fixture build, without
triggering unrelated NoteWise browser suites.

DoReGo has two deliberate build profiles: root and `/DoReGo/`. Studio sample
originals are omitted from test artifacts, as they are from production; the web
sound banks remain. Soundglow's generated adapters and compiled UI accompany its
artifact. Shared compilation is scoped to the app, so building DoReGo does not
compile Soundglow's UI.

Account tests deliberately build against their own isolated local Supabase
configuration. These bundles must never be reused as production bundles. Vercel
builds production candidates remotely with the project's existing production
variables and Sentry upload credential; production secrets are not downloaded
into the validation jobs.

## Local commands

Use Node 24, matching CI. Existing per-app `npm run test:* --workspace=...`
commands are the same commands run by the workflow.

```sh
npm ci
npm run test:ci-unit
npm run test:shared
npm run build:ci -- dorego
npm run build:ci -- notewise
npm run build:ci -- songalong
npm run build:ci -- soundglow
TEST_BROWSERS=firefox npm run test:browsers --workspace=dorego
TEST_BROWSER=webkit TEST_SHARD=1/3 npm run test:catalog --workspace=songalong
CI_USE_BUILD=1 npm run test:visual --workspace=soundglow -- --shard=1/3
```

`CI_USE_BUILD=1` requires artifacts for the current commit; it fails instead of
silently reusing a stale build. Omit it to use Soundglow's ordinary local build
hooks. Commit changes and rebuild before checking artifact reuse at a new SHA.

The shared browser harness selects the requested engine, isolates Firefox's
macOS profile, mutes Chromium, waits for actual server/application readiness and
captures failure traces, screenshots and bounded console/network diagnostics.
Ordinary UI contexts block service workers; offline tests explicitly allow them.
Failure output redacts authentication parameters. Do not upload local backend
status files, credentials or real account sessions as artifacts.

## Long suites and failures

Soundglow core/update tests and three visual shards run independently. Each audio
runner retains one worker. SongAlong's complete hymn/arrangement/width catalog is
partitioned into three shards for each browser, separate from interaction tests.
Every catalog combination still runs. Test failures are not automatically retried.
Only browser installation and local backend startup get one bounded retry.

Final packaging verifies all advertised resource sizes and SHA-256 hashes after
bundling, along with the same inventory limits embedded in the service workers.
This runs before expensive browser tests and again on the final Vercel output.
The validation gate rejects failed, cancelled, missing or unexpectedly skipped
required jobs. Failure artifacts are retained for diagnosis.

## Release and recovery

Each `production-<app>` GitHub environment allows only `main` and holds one
project-scoped `VERCEL_TOKEN`. Rotate it before expiry through Vercel account
settings, verify that another project is inaccessible, and replace the matching
environment secret. Do not store a CLI sign-in token in GitHub or the repository.

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
