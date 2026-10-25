(function (root) {
  // Self-contained so the same bounded resource loader runs in pages and workers.
  function createResources(env = globalThis) {
    const pending = new Set();
    function fault(reason, message) {
      return Object.assign(new Error(message), { offlineReason: reason });
    }
    function deadline(ms, action, signal) {
      if (pending.size >= 128)
        return Promise.reject(fault("storage", "Too many stalled operations"));
      const controller = new AbortController();
      let timer, abort;
      const task = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return action(controller.signal);
      });
      pending.add(task);
      // Track late cache operations: they cannot be cancelled, so cleanup must wait.
      task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      const stop = new Promise((_, reject) => {
        abort = () => {
          const error =
            signal?.reason || fault("timeout", "Operation timed out");
          controller.abort(error);
          reject(error);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => {
          const error = fault("timeout", "Operation timed out");
          controller.abort(error);
          reject(error);
        }, ms);
      });
      return Promise.race([task, stop]).finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      });
    }
    function delay(ms, signal) {
      return deadline(
        ms + 1000,
        (inner) =>
          new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(inner.reason);
            };
            const timer = setTimeout(() => {
              inner.removeEventListener("abort", abort);
              resolve();
            }, ms);
            inner.addEventListener("abort", abort, { once: true });
          }),
        signal,
      );
    }
    async function digest(bytes) {
      return Array.from(
        new Uint8Array(await env.crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
    }
    async function verify(bytes, file) {
      if (file.bytes !== undefined && bytes.byteLength !== file.bytes)
        throw fault("integrity", "Incomplete resource");
      if (file.sha256 && (await digest(bytes)) !== file.sha256)
        throw fault("integrity", "Resource integrity mismatch");
    }
    async function fetchBytes(
      url,
      {
        signal,
        bytes,
        sha256,
        attempts = 3,
        timeoutMs = Math.min(
          180000,
          Math.max(30000, ((bytes || 0) / 65536) * 1000 + 10000),
        ),
        idleMs = 8000,
        retryMs = 300,
        onRetry,
      } = {},
    ) {
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        try {
          return await deadline(
            timeoutMs,
            async (inner) => {
              const requestController = new AbortController();
              const forward = () => requestController.abort(inner.reason);
              inner.addEventListener("abort", forward, { once: true });
              const headerTimer = setTimeout(
                () =>
                  requestController.abort(
                    fault("timeout", "Response headers timed out"),
                  ),
                Math.min(10000, timeoutMs),
              );
              try {
                const response = await deadline(
                  Math.min(10000, timeoutMs),
                  () =>
                    env.fetch(url, {
                      signal: requestController.signal,
                      cache: attempt ? "reload" : "default",
                    }),
                  inner,
                );
                clearTimeout(headerTimer);
                if (!response.ok) {
                  const retryable =
                    response.status === 408 ||
                    response.status === 429 ||
                    response.status >= 500;
                  const error = fault(
                    retryable ? "network" : "unavailable",
                    "Resource unavailable",
                  );
                  const offlineReason =
                    response.headers.get("X-Offline-Reason");
                  if (
                    [
                      "network",
                      "timeout",
                      "integrity",
                      "storage",
                      "quota",
                      "unavailable",
                    ].includes(offlineReason)
                  )
                    error.offlineReason = offlineReason;
                  error.retryable =
                    retryable &&
                    !["quota", "storage", "unavailable"].includes(
                      error.offlineReason,
                    );
                  const retryAfter = response.headers.get("Retry-After");
                  if (retryAfter)
                    error.retryAfterMs = Math.min(
                      30000,
                      Math.max(
                        0,
                        Number.isFinite(Number(retryAfter))
                          ? Number(retryAfter) * 1000
                          : Date.parse(retryAfter) - Date.now(),
                      ),
                    );
                  throw error;
                }
                const reader = response.body?.getReader();
                let data;
                if (reader) {
                  const chunks = [];
                  let total = 0;
                  try {
                    for (;;) {
                      const result = await deadline(
                        idleMs,
                        () => reader.read(),
                        inner,
                      );
                      if (result.done) break;
                      total += result.value.byteLength;
                      if (
                        total > (bytes === undefined ? 64 * 1024 * 1024 : bytes)
                      )
                        throw fault("integrity", "Resource too large");
                      chunks.push(result.value);
                    }
                  } catch (error) {
                    void reader.cancel().catch(() => {});
                    throw error;
                  } finally {
                    try {
                      reader.releaseLock();
                    } catch {}
                  }
                  data = new Uint8Array(total);
                  let offset = 0;
                  for (const chunk of chunks) {
                    data.set(chunk, offset);
                    offset += chunk.byteLength;
                  }
                } else data = new Uint8Array(await response.arrayBuffer());
                inner.throwIfAborted();
                await verify(data, { bytes, sha256 });
                inner.throwIfAborted();
                return data.buffer;
              } finally {
                clearTimeout(headerTimer);
                inner.removeEventListener("abort", forward);
              }
            },
            signal,
          );
        } catch (error) {
          if (signal?.aborted) throw signal.reason;
          const retryable =
            error.retryable !== false &&
            (error instanceof TypeError ||
              ["network", "timeout", "integrity"].includes(
                error.offlineReason,
              ));
          if (!retryable || attempt + 1 >= attempts) throw error;
          onRetry?.(attempt + 1, error.offlineReason || "network");
          await delay(
            Math.max(
              error.retryAfterMs || 0,
              Math.min(2000, retryMs * 2 ** attempt) *
                (0.8 + Math.random() * 0.4),
            ),
            signal,
          );
        }
      }
    }
    return {
      deadline,
      fetchBytes,
      verify,
      digest,
      fault,
      busy: () => pending.size > 0,
    };
  }
  if (typeof module === "object" && module.exports)
    module.exports = { createResources };
  else Object.assign(root.BrowserOffline || (root.BrowserOffline = {}), { createResources });
})(typeof globalThis === "object" ? globalThis : this);
