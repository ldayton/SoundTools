# Central diagnostics

SoundTools uses one shared browser diagnostics package with thin adapters in both
apps. Configured **production** builds automatically collect technical diagnostics
from every session. Preview builds, development servers, and builds without a DSN
keep reports local. This is operational monitoring, not a visitor identity system.
The historical localStorage sharing preference no longer controls collection.

## Data model

- Errors are sanitized exception events: stable application code, allowlisted error
  class, source locations, exact app release and bounded technical context. Raw
  exception messages are discarded. Duplicate errors are suppressed for a minute;
  all error codes still contribute usage counters, subject to bounded name capacity.
- Metrics are batched interval **deltas**. Every numeric series sends `.count`,
  `.total`, and `.max`; calculate weighted mean as sum(total)/sum(count). Max is a
  gauge per reporting interval. These are not raw sample distributions: do not call
  a percentile of these aggregates frame p95. The downloadable local report has
  recent-sample p95 and session aggregates.
- Usage counters count coded lifecycle/control events. Structured logs retain their
  allowlisted numeric/enum details. Logs are bounded to 50 pending entries and 60
  entries per minute per session; counters continue when detailed logs are dropped.
- `session.started` counts app loads, not unique people. `session.elapsed_ms` is
  elapsed wall time between flushes, including background time, not active practice
  time. No persistent user identifier is collected.

The collector does not send audio, recordings, pitch/formant histories, microphone
labels, raw text, console output, DOM content, network bodies, cookies, URL queries
or fragments. No replay, automatic tracing, profiling or global Sentry integrations
are installed. Each app owns an isolated SDK client and scope. The provider receives
network connection metadata; disable IP retention in both Sentry projects.

## Runtime and failure behavior

Audio/render hot paths only update bounded in-memory accumulators. SDK loading,
IndexedDB and networking happen asynchronously. Remote startup does not wait for
local storage. Measurements batch every 15 seconds and flush on visibility,
pagehide, online and disposal. Startup failures retry with 30-second to five-minute
backoff. Errors send separately with a budget of 20 per minute; clearing local
reports does not reset this budget. SDK internals buffer logs/metrics before sending.

Failed transmissions use app-namespaced IndexedDB queues, limited to 30 envelopes.
Queue opens and transactions have 1.5-second deadlines; stalled or unavailable
storage falls back to a 30-envelope in-memory queue for this page.
Original timestamps expire errors, logs and metric batches after 24 hours; retries
cannot renew their age. Sentry rate limits are honored by its transport. Memory,
storage, delivery on shutdown, and offline retries are best effort. Ad blockers,
network policy, quota limits or storage eviction can prevent collection; “automatic
for all sessions” does not promise delivery of every event.

Local reports retain five sessions for up to 24 hours. Storage operations have
1.5-second deadlines and fall back to memory. Debug reports offers download and
local clearing; clearing does not delete data already received by Sentry.

## Production setup

Create separate **dorego** and **soundglow** browser projects in the same Sentry
organization. Use the free plan initially; do not enable paid overage or Replay.
Set IP scrubbing and restrict access in the service. Alerts are optional; central
collection does not require notification emails.

Configure these **Production-only** Vercel variables on each corresponding project:

| Variable | DoReGo | Soundglow |
| --- | --- | --- |
| Public browser DSN | `VITE_SENTRY_DSN` | `SOUNDGLOW_SENTRY_DSN` |
| Organization slug | `SENTRY_ORG` | `SENTRY_ORG` |
| Project slug | `SENTRY_PROJECT=dorego` | `SENTRY_PROJECT=soundglow` |
| Secret release upload credential | `SENTRY_AUTH_TOKEN` | `SENTRY_AUTH_TOKEN` |

Use a restricted organization release-upload credential, store it as a sensitive
build variable, and never put it into VITE variables, HTML or the repository.
Browser DSNs are public ingestion identifiers, not management credentials. Restrict
allowed origins in Sentry to the production app origins and explicitly needed domains.

`scripts/build-vercel.cjs` publishes the exact runtime release before removing maps
from web output. DoReGo uses `dorego@<commit-prefix>-<source-fingerprint>` and hidden
Vite source maps uploaded with `~/assets` URLs. Vercel's commit SHA works without a
.git checkout. Soundglow uses `soundglow@<immutable-release-hash>` and unminified
scripts with deployed line numbers. We use release/URL source-map association so
fingerprinted JavaScript and offline manifests are never changed after packaging.
A configured production build fails if upload credentials/settings are missing or
upload fails, instead of deploying silently without matching release artifacts.
Development and preview builds do not publish monitoring releases.

## Verification

Shared unit tests cover boundedness, automatic all-session collection, privacy,
delta correctness, delayed startup/disposal, error flooding and blocked IndexedDB.
Soundglow's real-SDK browser test intercepts every request and checks actual error,
log and metric envelopes, release isolation, expiry and offline queue replay.
DoReGo's browser test covers report UI, export, clearing and playback timing.
These tests use fake DSNs and never contact the live service.

After configuring real projects, deploy, open both production apps, and verify
`session.started`, a metric batch and a synthetic `monitoring.smoke_test` error in
the correct project/release. Confirm DoReGo's stack maps back to TypeScript. Inspect
payloads for privacy and check the error alert. Do not claim central collection is
live until ingestion is verified; the presence of SDK code or a successful build
alone is not proof.

## Configured service

Organization: `team-lily`; projects: `dorego` and `soundglow`. Both projects discard
IP addresses and use the default sensitive-field scrubber. Accepted origins are
the canonical production domain and each app's team/main aliases on Vercel.
Automatic AI debugging and automatic release creation are disabled. No automatic
alert emails or paid upgrades were configured.

Vercel receives a dedicated `org:ci` credential for release/source-map uploads,
separate from the temporary setup credential used to configure and verify the
service. Revoke the setup credential after production verification. Keep the
build credential as a sensitive Production-only variable on both projects.
