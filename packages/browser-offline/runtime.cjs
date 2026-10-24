// Keep this factory self-contained: the build embeds its source in each service worker.
function createRuntime(env, base, resources) {
  let maintenance = Promise.resolve();
  const inflight = new Map();
  const graceMs = 10 * 60 * 1000;
  // Navigation finishes before the new document's diagnostics listener exists.
  // Keep only a tiny, transient result until that document confirms prior consent.
  const navigations = new Map();
  function navigationResult(event, outcome, reason, started, source) {
    const id = event.resultingClientId;
    if (!id) return;
    for (const [key, value] of navigations)
      if (Date.now() - value.at > 60000) navigations.delete(key);
    while (navigations.size >= 50)
      navigations.delete(navigations.keys().next().value);
    navigations.set(id, {
      at: Date.now(),
      operation: "navigation",
      outcome,
      details: {
        cacheReason: reason,
        durationMs: Date.now() - started,
        cacheSource: source,
      },
    });
  }
  env.addEventListener("message", (event) => {
    if (event.data?.type !== "offline-diagnostics" || !event.source?.id) return;
    const result = navigations.get(event.source.id);
    navigations.delete(event.source.id);
    if (
      event.data.sharing === true &&
      result &&
      Date.now() - result.at <= 60000
    ) {
      try {
        event.source.postMessage({
          type: "offline-diagnostic",
          operation: result.operation,
          outcome: result.outcome,
          details: result.details,
        });
      } catch {}
    }
  });
  function report(client, operation, outcome, details = {}) {
    try {
      client?.postMessage({
        type: "offline-diagnostic",
        operation,
        outcome,
        details,
      });
    } catch {}
  }
  function offlineFailure(reason, message) {
    return Object.assign(Error(message), { offlineReason: reason });
  }
  function reason(error) {
    if (
      [
        "integrity",
        "storage",
        "quota",
        "network",
        "timeout",
        "unavailable",
      ].includes(error?.offlineReason)
    )
      return error.offlineReason;
    return (
      {
        QuotaExceededError: "quota",
        TimeoutError: "timeout",
        AbortError: "timeout",
        TypeError: "network",
        SyntaxError: "integrity",
        SecurityError: "storage",
        InvalidStateError: "storage",
        UnknownError: "storage",
      }[error?.name] || "unknown"
    );
  }
  function serialize(action) {
    const task = maintenance.then(action, action);
    maintenance = task.catch(() => {});
    return task;
  }
  function requestURL(request) {
    const url = new URL(request.url);
    return request.method === "GET" &&
      url.origin === env.location.origin &&
      url.pathname.startsWith(base)
      ? url
      : null;
  }
  function jsonStore(cacheName, keyURL) {
    return {
      async read(key) {
        const response = await (
          await env.caches.open(cacheName)
        ).match(keyURL(key));
        return response ? response.json() : null;
      },
      async write(key, value) {
        await (
          await env.caches.open(cacheName)
        ).put(keyURL(key), new Response(JSON.stringify(value)));
      },
    };
  }
  async function withDeadline(ms, action) {
    if (resources) return resources.deadline(ms, action);
    const controller = new AbortController();
    let timer;
    const task = Promise.resolve().then(() => action(controller.signal));
    const timeout = new Promise(
      (_, reject) =>
        (timer = setTimeout(() => {
          const error = offlineFailure("timeout", "Operation timed out");
          controller.abort(error);
          reject(error);
        }, ms)),
    );
    try {
      return await Promise.race([task, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function complete(cacheName, files) {
    const cache = await env.caches.open(cacheName);
    return (await Promise.all(files.map((url) => cache.match(url)))).every(
      (response) => response?.ok,
    );
  }
  async function verified(cacheName, files, onCorrupt) {
    const cache = await env.caches.open(cacheName),
      remaining = [...files];
    let valid = true;
    await Promise.all(
      Array.from({ length: Math.min(2, files.length) }, async () => {
        while (remaining.length) {
          const file = remaining.shift(),
            response = await cache.match(file.url);
          if (!response?.ok) {
            valid = false;
            continue;
          }
          if (resources)
            try {
              await resources.verify(await response.arrayBuffer(), file);
            } catch (error) {
              if (error.offlineReason !== "integrity") throw error;
              valid = false;
              await cache.delete(file.url);
              onCorrupt?.();
            }
        }
      }),
    );
    return valid;
  }
  async function stageAssets(
    cacheName,
    files,
    { signal, atomic = false, onRetry } = {},
  ) {
    const cache = await env.caches.open(cacheName);
    if (atomic) {
      if (
        !(await complete(
          cacheName,
          files.map((file) => file.url),
        ))
      )
        await cache.addAll(
          files.map(
            (file) => new Request(file.url, { cache: "reload", signal }),
          ),
        );
      return;
    }
    // Bound transfers, resume valid files, and drain workers before publishing.
    const remaining = [...files],
      results = await Promise.allSettled(
        Array.from({ length: Math.min(4, files.length) }, async () => {
          while (remaining.length) {
            signal?.throwIfAborted();
            const file = remaining.shift();
            const cached = await cache.match(file.url);
            if (cached?.ok) {
              if (!file.sha256 && !file.bytes) continue;
              try {
                if (resources)
                  await resources.verify(await cached.arrayBuffer(), file);
                continue;
              } catch (error) {
                if (error.offlineReason !== "integrity") throw error;
                await cache.delete(file.url);
              }
            }
            if (resources) {
              const bytes = await resources.fetchBytes(file.url, {
                ...file,
                signal,
                onRetry,
              });
              signal?.throwIfAborted();
              const pathname = new URL(file.url, env.location.origin).pathname;
              const extension = pathname.endsWith("/") ? "html" : pathname.split(".").pop();
              const mime = {
                js: "text/javascript",
                mjs: "text/javascript",
                wasm: "application/wasm",
                css: "text/css",
                html: "text/html",
                json: "application/json",
                webmanifest: "application/manifest+json",
                svg: "image/svg+xml",
                png: "image/png",
                m4a: "audio/mp4",
                flac: "audio/flac",
                txt: "text/plain",
              };
              await cache.put(
                file.url,
                new Response(bytes, {
                  headers: {
                    "Content-Type":
                      mime[extension] || "application/octet-stream",
                    "Content-Length": String(bytes.byteLength),
                  },
                }),
              );
            } else {
              const response = await env.fetch(
                new Request(file.url, { cache: "reload", signal }),
              );
              if (!response.ok)
                throw offlineFailure("network", "Incomplete release");
              if (file.sha256) {
                const bytes = await response.clone().arrayBuffer();
                const hash = Array.from(
                  new Uint8Array(
                    await env.crypto.subtle.digest("SHA-256", bytes),
                  ),
                  (n) => n.toString(16).padStart(2, "0"),
                ).join("");
                if (hash !== file.sha256)
                  throw offlineFailure(
                    "integrity",
                    "Release integrity mismatch",
                  );
              }
              signal?.throwIfAborted();
              await cache.put(file.url, response);
            }
          }
        }),
      );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
  async function publish(id, prepare) {
    if (inflight.has(id)) return inflight.get(id);
    // Adapter commits its manifest only after all assets and document checks succeed.
    const task = serialize(prepare);
    inflight.set(id, task);
    try {
      return await task;
    } finally {
      inflight.delete(id);
    }
  }
  function cleanup(action) {
    return serialize(async () => {
      if (
        inflight.size ||
        resources?.busy() ||
        env.registration.installing ||
        env.registration.waiting
      )
        return;
      await action();
    });
  }
  async function protectedClients(initial, versionsFor) {
    const live = (
      await env.clients.matchAll({ type: "window", includeUncontrolled: true })
    ).filter((client) => new URL(client.url).pathname.startsWith(base));
    const keep = new Set(initial);
    for (const client of live) {
      const versions = await versionsFor(client.id);
      // Legacy/unknown tabs could still need any prior release. Do not guess.
      if (!versions) return null;
      for (const version of versions) keep.add(version);
    }
    return { live, keep };
  }
  function recent(savedAt, now = Date.now()) {
    return Number.isFinite(savedAt) && now - savedAt < graceMs;
  }
  async function networkDocument(request) {
    // This path stays independent of stalled storage-operation tracking.
    const controller = new AbortController();
    let timer;
    const abort = () => controller.abort(request.signal.reason);
    if (request.signal.aborted) abort();
    else request.signal.addEventListener("abort", abort, { once: true });
    const task = (async () => {
      const response = await env.fetch(
        new Request(request, { signal: controller.signal }),
      );
      const bytes = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.delete("Content-Encoding");
      headers.set("Content-Length", String(bytes.byteLength));
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })();
    const timeout = new Promise(
      (_, reject) =>
        (timer = setTimeout(() => {
          const error = offlineFailure("timeout", "Navigation timed out");
          controller.abort(error);
          reject(error);
        }, 10000)),
    );
    try {
      return await Promise.race([task, timeout]);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    }
  }
  async function navigate(event, adapter) {
    const started = Date.now();
    let failureReason = "none";
    const background = () => {
      const task = Promise.resolve()
        .then(() => adapter.latest())
        .catch((error) => {
          void env.clients
            ?.get?.(event.resultingClientId)
            .then((client) =>
              report(client, "update", "failed", {
                cacheReason: reason(error),
              }),
            )
            .catch(() => {});
        });
      event.waitUntil?.(task);
    };
    try {
      const selected = await withDeadline(1200, async (signal) => {
        for (const id of await adapter.candidates()) {
          signal.throwIfAborted();
          try {
            const pack = await adapter.load(id),
              response = pack && (await adapter.document(pack));
            signal.throwIfAborted();
            if (response?.ok) {
              // A failed metadata write must not prevent a good cached page opening.
              try {
                await withDeadline(200, () =>
                  adapter.remember(event.resultingClientId, pack),
                );
              } catch {}
              return response;
            }
          } catch (error) {
            failureReason = reason(error);
          }
        }
      });
      if (selected) {
        navigationResult(event, "ready", failureReason, started, "cache");
        background();
        return selected;
      }
    } catch (error) {
      failureReason = reason(error);
    }
    // Never require a successful cache write to open a working network page.
    background();
    try {
      const response = await networkDocument(event.request);
      navigationResult(
        event,
        response.ok ? "ready" : "failed",
        response.ok ? failureReason : "network",
        started,
        "network",
      );
      return response;
    } catch (error) {
      navigationResult(event, "failed", reason(error), started, "network");
      return new Response(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline copy unavailable</title><style>body{font:16px system-ui;max-width:32rem;margin:15vh auto;padding:24px;line-height:1.5}button{font:inherit;padding:10px 18px}</style><h1>No offline copy available</h1><p>This app is not saved on this device yet, or browser storage is unavailable. Check your connection and try again.</p><button onclick="location.reload()">Try again</button>',
        {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }
  async function networkResponse(request) {
    try {
      return await env.fetch(request);
    } catch (error) {
      return new Response("", {
        status: 503,
        headers: { "X-Offline-Reason": reason(error) },
      });
    }
  }
  function lifecycle(prepare) {
    env.addEventListener("install", (event) =>
      event.waitUntil(
        (async () => {
          await prepare();
          await env.skipWaiting();
        })(),
      ),
    );
    // Claim requests only: never reload a document or touch an audio context.
    env.addEventListener("activate", (event) =>
      event.waitUntil(env.clients.claim()),
    );
  }
  return {
    reason,
    networkResponse,
    report,
    verified,
    requestURL,
    jsonStore,
    withDeadline,
    complete,
    stageAssets,
    publish,
    cleanup,
    protectedClients,
    recent,
    navigate,
    lifecycle,
  };
}
module.exports = { createRuntime };
