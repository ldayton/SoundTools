# Cache freshness and resilience review — both apps

Reviewed against the actual adapters, shared runtime, browser clients, builds,
Vercel configuration and packaged browser tests.

## Policy

Open the newest **complete, verified saved release** immediately; discover and
stage a newer deployment in the background. Verification must succeed before the
latest pointer changes. Before the first interaction, refresh automatically once
when a verified update is ready and the document is visible. After interaction,
show **Update available** and leave the current session intact. Worker replacement is awaited before an update action is offered; controller
changes invalidate the earlier check and restart it against the new worker.
An update action names its verified target release, so stale latest metadata
cannot redirect that action to an older cached copy. The temporary version hint
is removed from the URL after startup. Capture interaction
in the HTML, before external scripts finish loading. The per-tab guard permits at most one automatic refresh per minute, including
rapid deployment/rollback changes. If session storage cannot
maintain the refresh-loop guard, require the explicit update button.

This deliberately favors a usable saved app over waiting indefinitely for the
network. It cannot promise the newest server release while offline, while the
server is failing, or after a user chooses to keep an active session open.

## Scenario coverage

| Situation | Behavior / review result |
| --- | --- |
| First visit, healthy network | Serve current HTML; install a verified core offline copy. Larger optional sounds/models require Download. |
| First visit, offline | No saved app exists. Browser network failure is unavoidable; client diagnostics cannot run. |
| Previously saved app, offline browser restart | Open verified cached release and play cached audio; exercised for both apps. |
| Flaky, slow or hanging update discovery | Cached startup proceeds independently. Header/body/total deadlines and retry budgets bound network work. |
| Disk lookup exceeds the fast-start budget | Retain its verified result for up to eight seconds while trying network independently; use it if it wins or network fails. |
| Cache API denied or permanently stalled | Use working network without depending on cache writes; show unsupported/retry UI. Never claim offline availability. |
| Neither usable cache nor network | Controlling worker returns a small retry page; no endless loading. HTTP error responses remain distinguishable from network failure. |
| Initial application script unavailable | Inline HTML recovery offers Try again after 12 seconds; successful late startup removes it. Does not depend on Sentry or a rescue script loading. |
| Update ready on untouched page | Automatically refresh once; hidden pages wait until visible. Browser-driven tests verify this in both apps. |
| Update ready after interaction / during practice | Update button only. Multi-tab tests keep original playback/microphone running while another tab updates. |
| Browser client claiming stalls during activation | Bound this optional claim operation so activation and new navigations can proceed; report a coded worker fault best effort. |
| New worker controlling an older live document | Preserve release-specific assets and client pins. DoReGo now fetches the inventory named by its HTML, avoiding a mutable inventory belonging to another deployment. |
| Failed or inconsistent deployment | Reject incomplete/hash-mismatched releases; keep previous complete copy. Both adapters verify the startup document. |
| Damaged advisory metadata | Ignore malformed records and recover from valid release inventories, rather than making JSON parsing a startup dependency. |
| Partial browser eviction / corrupt assets | Revalidate readiness; hashes detect damaged bytes. Repair files online; navigation can use a complete backup. DoReGo also verifies interface hashes in its page readiness check. |
| Multiple tabs / cleanup | Protect live versions, navigation grace, current release and a complete backup. Cleanup waits for tracked late storage operations. |
| Page hidden then visible | Healthy background audio can continue. Recheck updates/readiness on return; hidden automatic downloads wait. Visibility is a signal, not proof of connectivity. |
| Navigate away / history restore | Abort document-owned requests, invalidate stale callbacks and reset operation flags. Recheck on pageshow, including restored documents; retain incomplete download intent. |
| Worker job replies after its page closes | Safely discard replies to stopped message ports; a successful job must not become an uncaught error because its receiver vanished. |
| Worker replacement during download | Cancel old RPCs/transfers, close ports, reset UI and allow a fresh attempt. A stale completion cannot overwrite the new operation. |
| Worker terminated mid-download | Soundglow checks worker download liveness every 20 seconds with a five-second RPC bound; retain completed files and retry. Worker optional work is bounded below the typical five-minute event lifetime. |
| User cancels a download | Abort transfer; retain completed files; clear automatic-resume intent. |
| Connection improves / app reopens | Resume user-requested incomplete downloads with bounded backoff. Resume is per completed file, not byte offsets inside a file. |
| Audio requests Range, HEAD or adds query string | Serve ranges/HEAD from complete cached files; canonicalize sound-cache keys. Never store a partial response as a complete recording. Multipart ranges are ignored with a full response. |
| Quota exceeded / persistence denied | Retryable UI; denial is informational. Retain working copies instead of clearing everything. Browser storage estimates are hints, not reservations. |
| Optional neural model absent or too slow | Keep Soundglow core/native analysis usable; model loading has its own retry/fallback behavior. |
| Offline diagnostics / Sentry blocked | Opt-in only. Existing bounded SDK transport may deliver later; app operation never waits for it. No audio, raw URLs or user text in cache signals. |

## Hosting and old releases

Root HTML/icons/manifest explicitly revalidate. Discovery inventories, deployment
history, diagnostics release metadata and the worker avoid stale HTTP caching.
Versioned interface/engine/media/model assets remain immutable. HTTP cache headers
do not govern CacheStorage; application verification and publication handle that
separately.

Deployment retention preserves the current release, three preceding releases and
additional releases published within the last day. Added the small DoReGo web
sound banks to verified deployment retention; excluded the original studio files.
An immutable recording URL may not silently change bytes: a new bank needs a new
version directory. This protects older open tabs during deployments without
redownloading unchanged sounds on the user's device.

Retention is bounded. A very old tab needing an uncached asset after its deployment
has aged out can still fail; keep the saved app when complete, otherwise use its
recovery/update path. These custom static apps do not assume Vercel framework
Skew Protection handles their asset URLs.

## Driven validation and limits

- Shared runtime/resource/client tests cover late-cache recovery, malformed
  metadata, safe auto-update policy, session cancellation and range semantics.
- Packaged DoReGo offline suite and Soundglow update suite exercise actual workers,
  release changes, verification failures, live tabs and offline playback.
- Persistent-profile resilience probes cover transient transfer failure, stalled
  discovery, full browser restart offline, denied/stalled storage, startup-script
  failure/retry, Range/HEAD/query requests, malformed metadata and history return.
- A history round trip is tested; whether the browser chooses bfcache is its
  decision. Synthetic persisted-page events additionally exercise DoReGo's stale
  callback protection. These are not physical phone lock/unlock or OS-kill tests.

No web app can guarantee offline storage after browser/OS eviction, user data
clearing, private-mode restrictions or a first visit without network. Safari's
inactivity/storage policies also matter. Persistence requests reduce risk where
granted; they do not replace checking actual files. A large file interrupted before
completion restarts that file; byte-level resumable downloading is not implemented.
Very slow storage can exceed bounded lookup budgets; retry UI is the recovery path.

Sentry cannot observe HTML/JavaScript that never ran, an evicted disconnected app,
or every terminated worker. Initial failure is locally recoverable where the HTML
loaded, but central delivery remains best effort and consent-gated. No external
uptime monitor was created. Local configuration checks do not prove new Vercel
headers are deployed; live deployment verification is required after publication.

## Primary references and implications

- [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle):
  installation and activation are separate; worker takeover must preserve live
  documents' asset generations.
- [MDN Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache): explicit
  versioning/eviction is application work; HTTP cache policy is separate.
- [Back/forward cache](https://web.dev/articles/bfcache): restored documents resume
  paused JavaScript and need lifecycle reconciliation, not just startup handlers.
- [Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
  and [Chromium worker security FAQ](https://chromium.googlesource.com/chromium/src/+/main/docs/security/service-worker-security-faq.md):
  waitUntil extends lifetime but cannot guarantee uninterrupted background work.
- [Offline range requests](https://web.dev/articles/sw-range-requests): media clients
  can need byte ranges even when full files are cached.
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
  and [tracking prevention](https://webkit.org/tracking-prevention/): storage is
  evictable; persisted and installed contexts have browser-specific treatment.
- [Vercel cache headers](https://vercel.com/docs/caching/cache-control-headers)
  and [Skew Protection](https://vercel.com/docs/skew-protection): separate mutable
  discovery from immutable assets; custom static clients need their own versioning.
