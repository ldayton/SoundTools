# Offline resilience and diagnostic coverage

Both apps use `@ldayton/browser-offline` for release staging and navigation and
`@ldayton/browser-diagnostics` for consent-gated Sentry reporting. All collection
is off by default. Production builds require a configured DSN; local/preview
builds never upload. No raw error messages, URLs, model output or audio is added.

## Current behavior

- A complete cached release opens before update discovery begins. Updates stage in
  the background. A verified update automatically refreshes an untouched foreground
  page once. After any interaction, **Update available** requires an explicit click;
  playing, recording and editing are never automatically interrupted. A per-tab
  guard prevents repeated automatic refreshes of the same stale document.
- Navigation gives cached startup a 1.2-second fast path and bounds version-record
  writes at 200 ms. Slow verified cache lookup remains available for up to eight
  seconds while the network is tried independently; an outage does not discard a
  late healthy saved copy. Blocked storage falls back to the network without
  requiring a cache write. If
  neither a saved copy nor the network works, a small uncached page explains why
  the app cannot open and offers **Try again**.
- DoReGo downloads all 133 web recordings (about 33 MB), verifying SHA-256 and byte
  counts. Missing/corrupt files invalidate readiness and are repaired without
  redownloading good files. Unchanged banks are reused across interface updates.
- Soundglow automatically installs its core interface, engine and example audio
  (about 9.65 MB). **Download for offline use**, at the bottom of settings, adds
  the optional neural assets (about 14.63 MB). Large optional downloads do not
  delay initial core installation. Full readiness checks every saved file hash.
- The shared loader bounds header waits, detects stalled body reads, verifies
  size/hash, and retries temporary failures with backoff/jitter and bounded
  Retry-After hints. Total budgets scale with known file size up to three minutes;
  a progressing large transfer is not limited to 30s. Live piano/cello loading
  has shorter 15s/5s total/idle budgets and two attempts. Cancellation never retries.
- DoReGo downloads two files at once; worker staging uses at most four transfers.
  Readiness hashes two files at once. Timed-out native cache operations remain
  tracked so cleanup does not race late writes. That tracker is bounded at 128.
- Both apps check estimated free space and request persistence after an explicit
  Download click. Persistence denial is informational. Browser online status is a
  hint and never disables downloads. Quota/storage failures have retryable UI.
- User-started incomplete downloads retain completed files and resume on reconnect
  or reopen. Retries back off from 30s to five minutes and do not start while the
  document is hidden. Explicit cancellation clears the saved download intent.
- Setup retries independently of playback. Late readiness responses cannot
  overwrite an active download. Experimental model loading retries with bounded
  backoff; inference overload retains native analysis without repeatedly loading.
- Both apps verify interface checksums, retain one complete previous release as a
  recovery copy, and protect live tabs during cache cleanup.
  Interrupted updates never publish partial releases. No runtime CDN is required.

A first visit still needs a connection. Browser/OS suspension can stop downloads;
completed files survive for resumption when the app is reopened. Users and the
browser can clear stored site data, and persistence may be denied. Offline
availability therefore means a verified saved copy, not indefinite storage.

## Sentry signals

| Scenario | Signal | Treatment |
| --- | --- | --- |
| Offline/online transition | Existing `browser.offline` / `browser.online` | Informational; online is a browser hint |
| Navigation completes or uses cached fallback | `cache.navigation.ready/failed`, source, duration and coded reason | Successful cache reads are informational; unexpected faults are reported separately |
| Slow navigation | `cache.navigation_response_ms`, `cache.navigation_ms` | Numeric timing, not a claim about visual readiness |
| Setup unsupported or installation fails | `cache.setup.started/ready/unsupported/unavailable/failed`; registration/worker errors | Unsupported/redundant install is informational; unexpected failures become issues |
| DoReGo download start, cancel, failure, success | `cache.download.started/retrying/paused/failed/ready`, duration and completed bytes | User cancellation/network failure/timeout are informational; integrity/quota faults become issues |
| DoReGo readiness loss or repair | `cache.storage.unavailable/ready`, file count and bytes | Readiness is rechecked, not inferred from online status |
| Persistence request | `cache.storage.ready` with `persistent`; failure classification | Denial is not an error |
| Soundglow update check failure or success | `cache.update.started/failed/ready`, duration and worker's coded reason | Network/timeout is informational; invalid releases/storage faults become issues |
| Experimental neural loading, readiness or fallback | `cache.model.started/ready/unavailable` | State transitions only; no inference data or raw error text |
| Reporter fails to load and later recovers | `monitoring.reporter_unavailable/recovered`, startup duration | Bounded in-memory counters; sent only if the reporter eventually starts |

`cacheOperation`, `cacheOutcome`, `cacheSource`, and `cacheReason` are enum allowlists. Durations,
bytes and counts are numeric. The page accepts messages only from its current
service worker, then passes them through the shared diagnostic allowlist. Workers
never instantiate Sentry or directly upload anything.

Navigation can finish before the new page's listener exists. The worker retains
at most 50 tiny coded navigation results, for at most one minute, in memory only.
The new page retrieves its own result only if sharing was already enabled at
startup and has not been turned off since then. Opt-out consumes/discards the result; enabling sharing later does not
replay it. Worker termination or activation races can lose this handoff; the
Navigation Timing metric is an independent best-effort fallback.

Routine outcomes are logs and counters, not error issues. Errors are deduplicated
and rate limited by the existing diagnostics layer. Metrics/logs share the same
opt-in, allowlists, batching and bounded offline transport as other telemetry.
Once the SDK starts, failed envelopes can queue for reconnect: 30 envelopes,
24-hour maximum age, best effort. There is no user-facing local report or export.

## Observability limits

A first visit that cannot fetch HTML/JavaScript cannot run Sentry. Neither can a
browser with all app storage evicted while disconnected. If the SDK never loads,
or Sentry stays blocked, delivery cannot be guaranteed. A worker crash before the
page can observe it can also be invisible. Results before opt-in are not replayed.

Independent server-side uptime monitoring is needed to observe host/DNS/TLS/HTTP
failures when no client code runs. Such monitoring cannot diagnose a particular
user's offline device. No uptime monitor or alert rule was created by this change.

## Driven validation

Persistent-profile probes (`npm run test:resilience --workspace=dorego` and its
Soundglow counterpart) exercise real packaged apps. They inject transfer failures,
hanging update discovery and stalled/denied Cache Storage, restart the entire
browser offline, exercise playback and verify the no-copy fallback. Reports and
screenshots are in `work/resilience-{app}/`. Timing results are local measurements,
not physical-device guarantees. The probes are included in GitHub CI.

Shared tests cover classification, redaction, consent and current-worker message
validation; worker tests cover navigation handoff and opt-out discard. The real
SDK browser contract verifies sanitized offline events in error/log/metric
envelopes, with network queue/reconnect and opt-out tests. DoReGo's offline suite
asserts cancellation/success diagnostics and cached navigation handoff while all
seven exercises play offline. Soundglow's update suite asserts integrity reasons
and cached navigation handoff while a separate live microphone session survives.
It also confirms that cancellation aborts the active transfer and that corrupt
cached HTML falls back to a verified recovery release, then repairs online.


## Freshness review

See [the complete scenario review](cache-freshness-review.md) for deployment
retention, update policy, lifecycle cancellation, partial media requests,
startup-script recovery, online references and remaining browser limits.
