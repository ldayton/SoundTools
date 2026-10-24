// SPDX-License-Identifier: MIT
import { parseEnvelope, serializeEnvelope } from "@sentry/core";

// Sentry's standard IndexedDB store has no deadline. Keep storage waits bounded,
// including blocked opens, and perform mutations within IDB request callbacks.
export function createOfflineStore(
  { dbName, maxQueueSize = 30, timeoutMs = 1500 },
  env = globalThis,
) {
  let failed = !env.indexedDB,
    closed = false,
    connection;
  const memory = [];
  function task(run) {
    if (failed || closed) return Promise.resolve({ ok: false });
    return new Promise((resolve) => {
      let settled = false,
        cancel = () => {};
      const finish = (result) => {
        if (settled) return;
        settled = true;
        env.clearTimeout(timer);
        resolve(result);
      };
      const timer = env.setTimeout(() => {
        failed = true;
        finish({ ok: false });
        try {
          cancel();
        } catch {}
      }, timeoutMs);
      try {
        cancel = run(finish, () => settled) || cancel;
      } catch {
        failed = true;
        finish({ ok: false });
      }
    });
  }
  function open() {
    if (!connection)
      connection = task((finish, done) => {
        const request = env.indexedDB.open(dbName);
        request.onupgradeneeded = () => {
          if (done() || closed) {
            request.transaction?.abort();
            return;
          }
          if (!request.result.objectStoreNames.contains("queue"))
            request.result.createObjectStore("queue");
        };
        request.onerror = request.onblocked = () => {
          failed = true;
          finish({ ok: false });
        };
        request.onsuccess = () => {
          const db = request.result;
          if (done() || closed) {
            db.close();
            finish({ ok: false });
            return;
          }
          db.onversionchange = () => {
            failed = true;
            db.close();
          };
          finish({ ok: true, value: db });
        };
        return () => {
          try {
            request.transaction?.abort();
          } catch {}
        };
      });
    return connection;
  }
  async function operation(value, front, read = false) {
    if (closed) return;
    const opened = await open();
    if (closed) return;
    let result = { ok: false };
    if (opened.ok && !failed)
      result = await task((finish, done) => {
        const db = opened.value,
          tx = db.transaction("queue", "readwrite"),
          store = tx.objectStore("queue");
        let found;
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          if (done()) return;
          try {
            const list = keys.result;
            if (read) {
              if (!list.length) return;
              const request = store.get(list[0]);
              request.onsuccess = () => {
                if (!done()) {
                  found = request.result;
                  store.delete(list[0]);
                }
              };
            } else if (list.length < maxQueueSize) {
              store.put(
                value,
                front ? Math.min(0, ...list) - 1 : Math.max(0, ...list) + 1,
              );
            }
          } catch {
            failed = true;
            try {
              tx.abort();
            } catch {}
            finish({ ok: false });
          }
        };
        tx.oncomplete = () => finish({ ok: true, value: found });
        tx.onabort = tx.onerror = () => {
          failed = true;
          finish({ ok: false });
        };
        return () => {
          try {
            tx.abort();
          } catch {}
          db.close();
        };
      });
    if (closed) return;
    if (result.ok) return result.value;
    if (read) return memory.shift();
    if (memory.length < maxQueueSize)
      front ? memory.unshift(value) : memory.push(value);
  }
  return {
    async push(envelope) {
      await operation(serializeEnvelope(envelope), false);
    },
    async unshift(envelope) {
      await operation(serializeEnvelope(envelope), true);
    },
    async shift() {
      try {
        const value = await operation(undefined, false, true);
        return value ? parseEnvelope(value) : undefined;
      } catch {
        return undefined;
      } // Corrupt persisted records are discarded.
    },
    close() {
      closed = true;
      memory.length = 0;
      void connection?.then((result) => result.value?.close());
    },
  };
}
