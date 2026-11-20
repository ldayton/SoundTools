# Diagnostics audit — 2026-11-19

## Why SONGALONG-1 was incomplete

The production event retained `cacheReason: storage`, but the original worker
exception could be replaced by `{ready:false, reason}`. Worker diagnostic messages
also carried only a reason. The collector discarded every exception message,
recognized too few DOM error names, and forwarded neither causes nor structured
failure attributes. The Sentry adapter deliberately used no automatic integrations,
and its final allowlist omitted breadcrumbs and standard browser/OS context.
Consequently a generic reason could reach Sentry without an original stack or
exception type. Source maps cannot recover an exception that was discarded.

The observed timeline also shows `update.ready` before `update.failed`. Those
statuses previously conflated preparing cached assets and updating the service
worker registration. That event alone cannot establish which browser operation
failed or prove the phone ran out of space.

## Survey and changes

| Area | Finding and resulting behavior |
| --- | --- |
| Shared collector | Preserves native DOM classes, DOM codes, HTTP status, database error codes, Retry-After, technical message categories, bounded causes and aggregate members. Arbitrary message text remains excluded. |
| Missing stacks | Includes an explicitly labeled reporting-site stack when no original stack exists; it is not presented as the original throw location. |
| Service workers | Sends a structured-clone-safe exception with sanitized frames and causes, then rejects failed RPCs with that information. Unsolicited diagnostics from the current controller carry the same data. Older reason-only workers remain supported. |
| Offline update stages | Distinguishes worker RPC, registration update and activation. Preserves original exceptions through those stages. |
| Sentry event adapter | Emits linked exceptions, handled/unhandled classification, low-cardinality searchable tags, failure details, native breadcrumb timeline and standard browser/OS/screen context. |
| Storage | Reports origin usage/quota when the browser exposes an estimate. Estimation is best effort, asynchronous, consent-gated and never blocks a failure report. |
| Accounts | Storage, application, schema, read and per-record write failures include their exceptions and retry/queue metadata instead of becoming reason-only logs. No setting values, keys, identities or email are attached. |
| Cloud files | Queue, fingerprint, transfer, catalogue and deletion failures carry exceptions and operation/attempt metadata. No original names, audio, IDs, object paths or signed URLs are attached. |
| Music practice | Existing startup/render/piano reporting remains; sample HTTP failures retain status. Backing track, metronome and unexpected MIDI failures now report their exceptions. Permission denials remain expected state. |
| Soundglow | Existing microphone/analysis/render reporting remains; audio-resume, preset-save and file-prefetch failures now report exceptions. |
| Source artifacts | Existing exact-release Vite and Soundglow UI map uploads remain mandatory in configured production builds. Generated `sw.js`, previously outside the upload directories, gains an identity map with its exact generated source. Worker frames resolve to generated worker source, not fictitious original TypeScript mappings. Deployed bytes are not rewritten. |
| Delivery | Existing bounded offline queue, original timestamp expiry, consent controls, isolated client, retry limits and performance safeguards remain. |

## Boundaries retained intentionally

Expected cancellation, stopped/ended audio nodes, cleanup after disposal,
permission denial, ordinary offline fallback, optional capability probing and
invalid advisory caches are not all treated as new Sentry issues. Suppression
and per-session budgets prevent retry storms from consuming the error quota.
Reports do not include raw console output, DOM text, user data, request/response
bodies, tokens, arbitrary exception messages, audio, or device labels.

Recognized technical message categories preserve useful meaning such as quota,
access denied, stopped context, fetch failure, integrity mismatch and closed
storage without transmitting arbitrary content. Unrecognized messages stay
redacted. Browser CORS restrictions and native errors without stacks cannot be
reconstructed; reporting-site stacks are labeled accordingly. Errors before
consent, before JavaScript starts, or during blocked telemetry delivery may remain
unavailable. Previously ingested sparse events cannot be enriched retroactively.

## Verification

Tests exercise DOM exceptions, cause cycles, aggregate errors, sanitized worker
serialization and RPC propagation, HTTP metadata, native Sentry exception chains,
breadcrumbs, tags, browser context, offline retry, expiry and consent. Real-SDK
browser tests intercept outgoing envelopes and seed another SDK's global scope
with private sentinels; they inspect transmitted and queued payloads for leaks.
Release tests check worker artifact identity and source content. Application
builds check reporting hooks and worker generation in all four apps.

After deployment, inspect a naturally occurring new event in the correct release
and verify exception type, source frame/cause, failure stage and breadcrumbs. A
successful local payload test or map upload is not proof that a production device
has updated. This audit does not claim live ingestion of the new format yet.

The design uses Sentry's documented
[breadcrumb](https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/)
and [source map](https://docs.sentry.io/platforms/javascript/sourcemaps/)
mechanisms, with an explicit allowlist instead of automatic console/network capture.
