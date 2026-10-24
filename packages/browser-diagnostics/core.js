// SPDX-License-Identifier: MIT
(function (root) {
  "use strict";
  const version = "0.2.0",
    codePattern = /^[a-z][a-z0-9_.-]{0,79}$/;
  const baseFields = {
    view: ["pitch", "spectrogram", "practice"],
    source: ["mic", "speech"],
    running: "boolean",
    paused: "boolean",
    sampleRate: "number",
    audioState: [
      "running",
      "suspended",
      "interrupted",
      "closed",
      "unavailable",
    ],
    visible: "boolean",
    online: "boolean",
    width: "number",
    height: "number",
    dpr: "number",
  };
  function fields(input, spec) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    for (const [key, type] of Object.entries(spec)) {
      const value = input[key];
      if (type === "number" && Number.isFinite(value)) out[key] = value;
      else if (type === "boolean" && typeof value === "boolean")
        out[key] = value;
      else if (Array.isArray(type) && type.includes(value)) out[key] = value;
    }
    return out;
  }
  function errorInfo(error, code) {
    // Exception messages may contain filenames, exercise titles or device labels.
    // Keep a stable application code and source locations, never the raw message.
    let name = "Error",
      stack = "";
    try {
      if (
        /^(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|DOMException|NotAllowedError|NotFoundError|NotReadableError|AbortError|QuotaExceededError|InvalidStateError|TimeoutError)$/.test(
          error?.name,
        )
      )
        name = error.name;
      stack = typeof error?.stack === "string" ? error.stack : "";
    } catch {}
    const frames = stack
      .split("\n")
      .flatMap((line) => {
        const location = line.match(
          /(?:https?:\/\/[^\s)]+|\/[^\s)]+\.(?:js|mjs|ts)):(\d+):(\d+)\)?\s*$/,
        );
        if (!location) return [];
        let filename;
        try {
          const u = new URL(location[0].replace(/\)?\s*$/, ""));
          filename = u.origin + u.pathname.replace(/:\d+:\d+$/, "");
        } catch {
          return [];
        }
        return [
          { filename, lineno: Number(location[1]), colno: Number(location[2]) },
        ];
      })
      .slice(0, 20);
    return { code, name, frames };
  }
  function create(options, env = root) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(options.app))
      throw Error("Invalid diagnostics app");
    const app = options.app,
      release = /^[a-zA-Z0-9_.-]{1,100}$/.test(options.release || "")
        ? options.release
        : "development",
      now = options.now || (() => env.performance.now()),
      wall = options.wallNow || (() => Date.now()),
      spec = { ...baseFields, ...options.fields };
    const dbName = app + "-diagnostics",
      remoteDb = app + "-sentry-offline",
      limit = 100,
      maxErrors = 30,
      maxMetrics = 40,
      ttl = 86400000;
    const session =
      env.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    let started = now(),
      events = [],
      errors = [],
      metrics = Object.create(null),
      automatic = !!options.dsn && options.enabled !== false,
      remote = null,
      loading = null,
      epoch = 0,
      disposed = false,
      persisting = false,
      dirty = false,
      status = "local",
      previous = [],
      lastFlush = now(),
      retryAt = 0,
      retryDelay = 30000,
      pendingMetrics = Object.create(null),
      pendingCounts = Object.create(null),
      pendingLogs = [];
    let frameState = null,
      warmUntil = now() + 2000;
    let diskFailed = false,
      dbPromise;
    const listeners = [],
      subscribers = new Set(),
      sent = new Map();
    let seen = new WeakSet();
    const storageTimeout = Math.max(
      1,
      Math.min(5000, options.storageTimeoutMs || 1500),
    );
    let recentSends = [];
    const maxSends = 20,
      sendWindow = 60000;
    // Production adapters decide whether a DSN is enabled. Old consent storage is
    // deliberately ignored: every configured session contributes technical data.
    let logTimes = [];
    function increment(code) {
      if (!pendingCounts[code] && Object.keys(pendingCounts).length >= 100)
        return;
      pendingCounts[code] = (pendingCounts[code] || 0) + 1;
    }
    function notify() {
      for (const fn of subscribers)
        try {
          fn();
        } catch {}
    }
    function on(target, name, fn, capture = false) {
      target?.addEventListener?.(name, fn, capture);
      listeners.push(() => target?.removeEventListener?.(name, fn, capture));
    }
    function snapshot() {
      let context = {};
      try {
        context = fields(options.snapshot?.(), spec);
      } catch {}
      const summary = {};
      for (const [name, m] of Object.entries(metrics)) {
        const sorted = Array.from(
          m.values.subarray(0, Math.min(m.count, 128)),
        ).sort((a, b) => a - b);
        summary[name] = {
          count: m.count,
          mean: m.sum / m.count,
          max: m.max,
          p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
        };
      }
      return {
        schemaVersion: 1,
        libraryVersion: version,
        app,
        release,
        session,
        recordedAt: new Date(wall()).toISOString(),
        elapsedMs: Math.max(0, now() - started),
        context,
        environment: {
          visible: env.document?.visibilityState !== "hidden",
          online: env.navigator?.onLine !== false,
          width: env.innerWidth || 0,
          height: env.innerHeight || 0,
          dpr: env.devicePixelRatio || 1,
          browser: browser(env.navigator?.userAgent || ""),
          worker: !!env.Worker,
          audioWorklet: !!env.AudioWorkletNode,
          longTasks:
            !!env.PerformanceObserver?.supportedEntryTypes?.includes(
              "longtask",
            ),
        },
        events: events.map((e) => ({ ...e, details: { ...e.details } })),
        errors: errors.map((e) => ({
          ...e,
          frames: e.frames.map((f) => ({ ...f })),
        })),
        metrics: summary,
        limitations: [
          "No audio, pitch history, formant history, user-entered text or device labels.",
          "Animation timing is not physical display or microphone latency.",
          "Recent samples determine percentiles; counts, means and maxima cover this session.",
          "Browser storage and shutdown delivery are best effort.",
        ],
      };
    }
    function browser(ua) {
      const os = /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Windows/.test(ua)
            ? "Windows"
            : /Macintosh/.test(ua)
              ? "macOS"
              : "other";
      const match = ua.match(/(Firefox|Edg|Chrome|Version)\/(\d+)/);
      return {
        os,
        family: match
          ? { Version: "Safari", Edg: "Edge" }[match[1]] || match[1]
          : "other",
        major: match ? Number(match[2]) : 0,
      };
    }
    function event(code, details = {}) {
      if (disposed || !codePattern.test(code)) return;
      events.push({
        code,
        elapsedMs: Math.max(0, now() - started),
        details: fields(details, spec),
      });
      if (events.length > limit) events.shift();
      dirty = true;
      increment(code);
      if (pendingLogs.length < 50)
        pendingLogs.push({ code, details: fields(details, spec) });
    }
    function metric(name, value) {
      if (
        disposed ||
        !codePattern.test(name) ||
        !Number.isFinite(value) ||
        value < 0
      )
        return;
      let m = metrics[name];
      if (!m) {
        if (Object.keys(metrics).length >= maxMetrics) return;
        m = metrics[name] = {
          values: new Float64Array(128),
          count: 0,
          sum: 0,
          max: 0,
        };
      }
      m.values[m.count % 128] = value;
      m.count++;
      m.sum += value;
      m.max = Math.max(m.max, value);
      dirty = true;
      let delta = pendingMetrics[name];
      if (!delta && Object.keys(pendingMetrics).length >= maxMetrics) return;
      if (!delta) delta = pendingMetrics[name] = { count: 0, sum: 0, max: 0 };
      delta.count++;
      delta.sum += value;
      delta.max = Math.max(delta.max, value);
      dirty = true;
    }
    function frame(time, active) {
      if (!active || env.document?.visibilityState === "hidden") {
        frameState = null;
        warmUntil = now() + 2000;
        return;
      }
      if (now() < warmUntil) {
        frameState = null;
        return;
      }
      if (frameState !== null) metric("render.interval_ms", time - frameState);
      frameState = time;
    }
    // Every storage wait has a deadline. Timed-out local storage is disabled for
    // this client; in-memory recording and export remain available.
    function storageTask(fallback, run, local = true) {
      return new Promise((resolve) => {
        let settled = false,
          cancel = () => {};
        const set = env.setTimeout?.bind(env) || setTimeout,
          clear = env.clearTimeout?.bind(env) || clearTimeout;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          clear(timer);
          resolve(value);
        };
        const timer = set(() => {
          if (local) diskFailed = true;
          finish(fallback);
          try {
            cancel();
          } catch {}
        }, storageTimeout);
        try {
          cancel = run(finish, () => settled) || cancel;
        } catch {
          if (local) diskFailed = true;
          finish(fallback);
        }
      });
    }
    async function open() {
      if (diskFailed || !env.indexedDB || disposed) return null;
      if (!dbPromise)
        dbPromise = storageTask(null, (finish, done) => {
          const request = env.indexedDB.open(dbName, 1);
          request.onupgradeneeded = () => {
            if (done()) {
              request.transaction?.abort();
              return;
            }
            if (!request.result.objectStoreNames.contains("reports"))
              request.result.createObjectStore("reports", {
                keyPath: "session",
              });
          };
          request.onerror = request.onblocked = () => {
            diskFailed = true;
            finish(null);
          };
          request.onsuccess = () => {
            const db = request.result;
            if (done() || disposed) {
              db.close();
              finish(null);
              return;
            }
            db.onversionchange = () => {
              diskFailed = true;
              db.close();
            };
            finish(db);
          };
          return () => {
            try {
              request.transaction?.abort();
            } catch {}
          };
        });
      return dbPromise;
    }
    async function stored() {
      const db = await open();
      if (!db) return [];
      return storageTask([], (finish) => {
        const tx = db.transaction("reports"),
          r = tx.objectStore("reports").getAll();
        r.onsuccess = () => finish(r.result || []);
        r.onerror = tx.onabort = () => finish([]);
        return () => {
          try {
            tx.abort();
          } catch {}
          db.close();
        };
      });
    }
    async function persist() {
      if (disposed || persisting || !dirty) return;
      persisting = true;
      dirty = false;
      try {
        const report = snapshot(),
          db = await open();
        if (!db) return;
        await storageTask(false, (finish, done) => {
          const tx = db.transaction("reports", "readwrite"),
            store = tx.objectStore("reports"),
            r = store.getAll();
          r.onsuccess = () => {
            if (done()) return;
            try {
              const old = r.result
                .filter((x) => x.session !== session)
                .sort((a, b) => b.savedAt - a.savedAt);
              for (let i = 0; i < old.length; i++)
                if (i >= 4 || wall() - old[i].savedAt > ttl)
                  store.delete(old[i].session);
              store.put({ ...report, savedAt: wall() });
            } catch {
              try {
                tx.abort();
              } catch {}
              finish(false);
            }
          };
          tx.oncomplete = () => finish(true);
          tx.onerror = tx.onabort = () => finish(false);
          return () => {
            try {
              tx.abort();
            } catch {}
            db.close();
          };
        });
      } catch {
      } finally {
        persisting = false;
      }
    }
    async function loadRemote() {
      if (disposed || !automatic || !options.dsn || now() < retryAt) return;
      const token = epoch;
      if (remote) {
        status = "connected";
        notify();
        return;
      }
      if (loading) return loading;
      status = "loading";
      notify();
      loading = (async () => {
        try {
          const factory = options.remoteFactory || (await scriptFactory());
          if (disposed || !automatic || token !== epoch) return;
          const client = await factory({
            app,
            release,
            dsn: options.dsn,
            dbName: remoteDb,
            enabled: () => automatic,
            environment: options.environment || "production",
            fields: spec,
          });
          if (disposed || !automatic || token !== epoch) {
            await client.close?.();
            return;
          }
          remote = client;
          retryAt = 0;
          retryDelay = 30000;
          status = "connected";
          for (const error of errors) sendError(error);
          flush();
          notify();
        } catch {
          status = "unavailable";
          retryAt = now() + retryDelay;
          retryDelay = Math.min(300000, retryDelay * 2);
          notify();
        } finally {
          loading = null;
        }
      })();
      return loading;
    }
    function scriptFactory() {
      return new Promise((resolve, reject) => {
        if (env.BrowserDiagnosticsSentry?.create) {
          resolve(env.BrowserDiagnosticsSentry.create);
          return;
        }
        if (!options.sdkUrl) {
          reject(Error("No reporter"));
          return;
        }
        const script = env.document.createElement("script");
        script.src = options.sdkUrl;
        script.async = true;
        const timer = env.setTimeout(() => {
          script.remove();
          reject(Error("Reporter timed out"));
        }, 10000);
        script.onload = () => {
          env.clearTimeout(timer);
          env.BrowserDiagnosticsSentry?.create
            ? resolve(env.BrowserDiagnosticsSentry.create)
            : reject(Error("Reporter missing"));
        };
        script.onerror = () => {
          env.clearTimeout(timer);
          script.remove();
          reject(Error("Reporter unavailable"));
        };
        env.document.head.append(script);
      });
    }
    function sendError(error) {
      if (!automatic || !remote || disposed) return;
      const time = now(),
        fingerprint =
          error.code +
          "|" +
          error.name +
          "|" +
          error.frames[0]?.filename +
          "|" +
          error.frames[0]?.lineno;
      for (const [key, at] of sent)
        if (time - at >= sendWindow) sent.delete(key);
      recentSends = recentSends.filter((at) => time - at < sendWindow);
      if (time - (sent.get(fingerprint) ?? -Infinity) < sendWindow) return;
      if (recentSends.length >= maxSends) {
        metric("remote.errors_suppressed", 1);
        return;
      }
      while (sent.size >= maxErrors) sent.delete(sent.keys().next().value);
      sent.set(fingerprint, time);
      recentSends.push(time);
      try {
        remote.capture(error, snapshot());
      } catch {
        status = "unavailable";
        notify();
      }
    }
    function capture(error, code = "runtime.error") {
      if (disposed || !codePattern.test(code)) return;
      if (error && typeof error === "object") {
        if (seen.has(error)) return;
        seen.add(error);
      }
      const safe = errorInfo(error, code),
        fingerprint = JSON.stringify(safe);
      const existing = errors.find((e) => e.fingerprint === fingerprint);
      let entry;
      if (existing) {
        existing.count++;
        existing.elapsedMs = now() - started;
        entry = existing;
      } else {
        entry = { ...safe, fingerprint, count: 1, elapsedMs: now() - started };
        errors.push(entry);
        if (errors.length > maxErrors) errors.shift();
      }
      event(code);
      void persist();
      sendError(entry);
    }
    // Only this scheduled/lifecycle path calls the SDK for routine telemetry.
    // Hot-path metric() calls update a bounded numeric accumulator in memory.
    function flush() {
      if (disposed || !automatic || !remote) return;
      const time = now(),
        elapsed = Math.max(0, time - lastFlush);
      lastFlush = time;
      const batch = {
        counts: pendingCounts,
        metrics: pendingMetrics,
        logs: pendingLogs,
        elapsedMs: elapsed,
        context: snapshot().context,
      };
      pendingCounts = Object.create(null);
      pendingMetrics = Object.create(null);
      pendingLogs = [];
      logTimes = logTimes.filter((at) => time - at < 60000);
      batch.logs = batch.logs.slice(0, Math.max(0, 60 - logTimes.length));
      for (const _ of batch.logs) logTimes.push(time);
      try {
        remote.summary(batch);
        Promise.resolve(remote.flush?.()).catch(() => {
          status = "unavailable";
          notify();
        });
      } catch {
        status = "unavailable";
        notify();
      }
    }
    async function report() {
      await persist();
      previous = (await stored())
        .filter((r) => r.session !== session && wall() - r.savedAt <= ttl)
        .slice(-4);
      return { ...snapshot(), previousReports: previous };
    }
    async function clear() {
      seen = new WeakSet();
      frameState = null;
      warmUntil = now() + 2000;
      events = [];
      errors = [];
      metrics = Object.create(null);
      sent.clear();
      started = now();
      dirty = false;
      let cleared = !env.indexedDB;
      const db = await open();
      if (db)
        cleared = await storageTask(false, (finish) => {
          const tx = db.transaction("reports", "readwrite");
          tx.objectStore("reports").clear();
          tx.oncomplete = () => finish(true);
          tx.onerror = tx.onabort = () => finish(false);
          return () => {
            try {
              tx.abort();
            } catch {}
            db.close();
          };
        });
      previous = [];
      notify();
      return cleared;
    }
    on(
      env,
      "error",
      (e) => {
        if (e.error) capture(e.error, "runtime.error");
        else if (
          e.target?.tagName === "SCRIPT" &&
          !String(e.target.src).includes("sentry")
        )
          capture(null, "resource.script_failed");
      },
      true,
    );
    on(env, "unhandledrejection", (e) =>
      capture(e.reason, "runtime.rejection"),
    );
    on(env, "online", () => {
      event("browser.online");
      void loadRemote();
      flush();
    });
    on(env, "offline", () => event("browser.offline"));
    on(env.document, "visibilitychange", () => {
      frame(now(), false);
      event("browser.visibility", {
        visible: env.document.visibilityState !== "hidden",
      });
      void persist();
      flush();
    });
    on(env, "pagehide", () => {
      frame(now(), false);
      void persist();
      flush();
    });
    let observer;
    try {
      if (env.PerformanceObserver?.supportedEntryTypes?.includes("longtask")) {
        observer = new env.PerformanceObserver((list) => {
          if (env.document?.visibilityState !== "hidden")
            for (const entry of list.getEntries())
              metric("main.long_task_ms", entry.duration);
        });
        observer.observe({ type: "longtask", buffered: false });
      }
    } catch {}
    const timer = env.setInterval?.(() => {
      void persist();
      if (!remote) void loadRemote();
      flush();
    }, 15000);
    timer?.unref?.();
    // Remote initialization must not wait for a slow or blocked local database.
    event("session.started");
    const remoteReady = loadRemote();
    const ready = Promise.all([
      stored().then((rows) => {
        previous = rows.filter((r) => wall() - r.savedAt <= ttl).slice(-4);
      }),
      remoteReady,
    ]).then(() => api);
    const api = {
      event,
      metric,
      frame,
      capture,
      report,
      persist,
      clear,
      flush,
      snapshot,
      ready,
      getState: () => ({
        automatic: automatic,
        configured: !!options.dsn,
        status,
      }),
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      async dispose() {
        if (disposed) return;
        event("session.ended");
        flush();
        disposed = true;
        epoch++;
        observer?.disconnect();
        for (const remove of listeners) remove();
        env.clearInterval?.(timer);
        subscribers.clear();
        void dbPromise?.then((db) => db?.close());
        try {
          await remote?.close?.();
        } catch {}
      },
    };
    return api;
  }
  function attachPanel(client, parent) {
    const doc = parent.ownerDocument,
      details = doc.createElement("details");
    details.className = "diagnostics-panel";
    details.innerHTML =
      '<summary>Debug reports</summary><p>Technical reports help diagnose problems. Audio and recordings are never included.</p><p role="status"></p><button type="button">Download debug report</button> <button type="button">Clear saved reports</button>';
    const status = details.querySelector('[role="status"]'),
      buttons = details.querySelectorAll("button");
    function render() {
      const s = client.getState();
      status.textContent = !s.automatic
        ? "Reports stay on this device. Central reporting is not enabled for this build."
        : s.status === "unavailable"
          ? "Central reporting is unavailable. You can still download a report."
          : "Technical errors, usage counts and performance measurements are collected automatically. Audio and recordings are never sent.";
    }
    buttons[0].onclick = async () => {
      try {
        const report = await client.report(),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(report, null, 2)], {
              type: "application/json",
            }),
          ),
          link = doc.createElement("a");
        link.href = url;
        link.download = report.app + "-debug-" + Date.now() + ".json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        status.textContent = "Could not download the report. Try again.";
      }
    };
    buttons[1].onclick = () => {
      void client.clear().then((cleared) => {
        status.textContent = cleared
          ? "Saved reports cleared on this device."
          : "In-memory reports cleared. Browser storage is unavailable; saved reports could not be removed.";
      });
    };
    client.subscribe(render);
    render();
    parent.append(details);
    return details;
  }
  const api = { create, attachPanel, version };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrowserDiagnostics = api;
})(typeof globalThis === "object" ? globalThis : this);
