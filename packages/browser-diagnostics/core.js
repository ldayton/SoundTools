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
    cacheSource: ["cache", "network"],
    cacheOperation: [
      "setup",
      "navigation",
      "download",
      "update",
      "storage",
      "worker",
      "model",
    ],
    cacheOutcome: [
      "started",
      "ready",
      "paused",
      "failed",
      "fallback",
      "recovered",
      "retrying",
      "unsupported",
      "unavailable",
    ],
    cacheReason: [
      "none",
      "network",
      "timeout",
      "quota",
      "integrity",
      "storage",
      "cancelled",
      "unavailable",
      "unknown",
    ],
    durationMs: "number",
    byteCount: "number",
    fileCount: "number",
    retryCount: "number",
    persistent: "boolean",
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
      maxMetrics = 40;
    const session =
      env.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    let started = now(),
      events = [],
      errors = [],
      metrics = Object.create(null),
      sharing = readSharing(),
      automatic = sharing && !!options.dsn && options.enabled !== false,
      remote = null,
      loading = null,
      epoch = 0,
      disposed = false,
      status = sharing ? "local" : "off",
      lastFlush = now(),
      retryAt = 0,
      retryDelay = 30000,
      pendingMetrics = Object.create(null),
      pendingCounts = Object.create(null),
      pendingLogs = [];
    let frameState = null,
      warmUntil = now() + 2000;
    const listeners = [],
      subscribers = new Set(),
      sent = new Map();
    let seen = new WeakSet();
    let recentSends = [];
    const maxSends = 20,
      sendWindow = 60000;
    const sharingKey = app + ":diagnostics:sharing";
    let navigationDiagnosticsAllowed = sharing;
    function readSharing() {
      try {
        return (
          env.localStorage?.getItem(app + ":diagnostics:sharing") === "yes"
        );
      } catch {
        return false;
      }
    }
    function discardDatabase(name) {
      try {
        env.indexedDB?.deleteDatabase(name);
      } catch {}
    }
    // Retire local reports. Only the sharing preference is retained locally.
    discardDatabase(dbName);
    if (!sharing) discardDatabase(remoteDb);
    async function setSharing(value, save = true) {
      value = value === true;
      if (value === sharing || disposed) return;
      sharing = value;
      if (!sharing) navigationDiagnosticsAllowed = false;
      automatic = sharing && !!options.dsn && options.enabled !== false;
      const token = ++epoch;
      if (save)
        try {
          env.localStorage?.setItem(sharingKey, value ? "yes" : "no");
        } catch {}
      const old = remote;
      remote = null;
      loading = null;
      status = sharing ? "local" : "off";
      await clear();
      pendingMetrics = Object.create(null);
      pendingCounts = Object.create(null);
      pendingLogs = [];
      recentSends = [];
      logTimes = [];
      lastFlush = now();
      retryAt = 0;
      notify();
      try {
        await old?.close?.();
      } catch {}
      if (token !== epoch || disposed) return;
      if (!sharing) {
        discardDatabase(remoteDb);
        return;
      }
      event("session.started");
      await loadRemote();
    }
    let logTimes = [];
    // Shared low-cardinality offline telemetry; never accepts URLs or messages.
    function offline(operation, outcome, details = {}, error) {
      if (
        !baseFields.cacheOperation.includes(operation) ||
        !baseFields.cacheOutcome.includes(outcome)
      )
        return;
      let reason = details.cacheReason;
      if (!baseFields.cacheReason.includes(reason)) {
        reason =
          {
            QuotaExceededError: "quota",
            TimeoutError: "timeout",
            AbortError: "timeout",
            TypeError: "network",
            SyntaxError: "integrity",
            SecurityError: "storage",
            InvalidStateError: "storage",
            UnknownError: "storage",
          }[error?.name] || "unknown";
        if (baseFields.cacheReason.includes(error?.offlineReason))
          reason = error.offlineReason;
        if (
          outcome === "ready" ||
          outcome === "started" ||
          outcome === "recovered"
        )
          reason = "none";
      }
      if (operation === "storage" && reason === "network") reason = "storage";
      const safe = fields(
        {
          ...details,
          cacheOperation: operation,
          cacheOutcome: outcome,
          cacheReason: reason,
        },
        baseFields,
      );
      event("cache." + operation + "." + outcome, safe);
      if (Number.isFinite(safe.durationMs) && safe.durationMs >= 0)
        metric("cache." + operation + "_ms", safe.durationMs);
      // A disconnected network, timeout or deliberate cancellation is expected.
      if (
        (outcome === "failed" ||
          (outcome === "fallback" &&
            ["quota", "integrity", "storage"].includes(reason))) &&
        !["network", "timeout", "cancelled"].includes(reason)
      )
        capture(error, "cache." + operation + "_failed");
    }
    const watchedWorkers = new WeakSet();
    function observeOffline(registration) {
      if (!registration) return;
      const watch = (worker) => {
        if (!worker || watchedWorkers.has(worker)) return;
        watchedWorkers.add(worker);
        on(worker, "error", () =>
          offline("worker", "failed", { cacheReason: "unknown" }),
        );
        let completed = worker.state !== "installing";
        on(worker, "statechange", () => {
          if (["installed", "activating", "activated"].includes(worker.state))
            completed = true;
          if (!completed && worker.state === "redundant")
            offline("setup", "unavailable", { cacheReason: "unavailable" });
        });
      };
      watch(registration.installing);
      watch(registration.waiting);
      watch(registration.active);
      on(registration, "updatefound", () => watch(registration.installing));
    }
    // Only the current controlling worker may supply coded offline diagnostics.
    const serviceWorker = env.navigator?.serviceWorker;
    const initialSharing = sharing;
    on(serviceWorker, "message", (e) => {
      if (
        e.source !== serviceWorker.controller ||
        e.data?.type !== "offline-diagnostic"
      )
        return;
      const { operation, outcome, details } = e.data;
      if (operation === "navigation" && !navigationDiagnosticsAllowed) return;
      offline(operation, outcome, details);
    });
    function requestNavigationDiagnostic() {
      try {
        serviceWorker?.controller?.postMessage({
          type: "offline-diagnostics",
          sharing: navigationDiagnosticsAllowed && sharing,
        });
      } catch {}
    }
    on(serviceWorker, "controllerchange", requestNavigationDiagnostic);
    on(serviceWorker, "messageerror", () =>
      offline("worker", "failed", { cacheReason: "unknown" }),
    );
    requestNavigationDiagnostic();
    // Measure actual response time even when a worker's transient result is lost.
    if (initialSharing) {
      try {
        const navigation =
          env.performance.getEntriesByType?.("navigation")?.[0];
        if (navigation?.responseEnd > 0)
          metric(
            "cache.navigation_response_ms",
            navigation.responseEnd - navigation.startTime,
          );
      } catch {}
    }
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
      if (disposed || !sharing || !codePattern.test(code)) return;
      events.push({
        code,
        elapsedMs: Math.max(0, now() - started),
        details: fields(details, spec),
      });
      if (events.length > limit) events.shift();
      increment(code);
      if (pendingLogs.length < 50)
        pendingLogs.push({ code, details: fields(details, spec) });
    }
    function metric(name, value) {
      if (
        disposed ||
        !sharing ||
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
      let delta = pendingMetrics[name];
      if (!delta && Object.keys(pendingMetrics).length >= maxMetrics) return;
      if (!delta) delta = pendingMetrics[name] = { count: 0, sum: 0, max: 0 };
      delta.count++;
      delta.sum += value;
      delta.max = Math.max(delta.max, value);
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
    // Reports are never saved on the device or offered for export.
    async function persist() {}
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
      const reporterStarted = now();
      const recovering = retryAt > 0;
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
            enabled: () => automatic && token === epoch,
            environment: options.environment || "production",
            fields: spec,
          });
          if (disposed || !automatic || token !== epoch) {
            await client.close?.();
            return;
          }
          remote = client;
          metric("monitoring.reporter_startup_ms", now() - reporterStarted);
          if (recovering) event("monitoring.reporter_recovered");
          retryAt = 0;
          retryDelay = 30000;
          status = "connected";
          for (const error of errors) sendError(error);
          flush();
          notify();
        } catch {
          if (disposed || token !== epoch) return;
          status = "unavailable";
          event("monitoring.reporter_unavailable");
          metric("monitoring.reporter_startup_ms", now() - reporterStarted);
          retryAt = now() + retryDelay;
          retryDelay = Math.min(300000, retryDelay * 2);
          notify();
        } finally {
          if (token === epoch) loading = null;
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
      if (disposed || !sharing || !codePattern.test(code)) return;
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
      return { ...snapshot(), previousReports: [] };
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
      notify();
      return true;
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
    on(env, "storage", (e) => {
      if (e.key === sharingKey || e.key === null)
        void setSharing(readSharing(), false);
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
    const ready = Promise.resolve(remoteReady).then(() => api);
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
      setSharing,
      offline,
      observeOffline,
      getState: () => ({
        sharing,
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
        try {
          await remote?.close?.();
        } catch {}
      },
    };
    return api;
  }
  function attachPanel(client, parent) {
    const panel = parent.ownerDocument.createElement("div");
    panel.className = "diagnostics-panel";
    const label = parent.ownerDocument.createElement("label");
    const checkbox = parent.ownerDocument.createElement("input");
    checkbox.type = "checkbox";
    label.append(checkbox, " Share diagnostic information");
    panel.append(label);
    checkbox.onchange = () => {
      void client.setSharing(checkbox.checked);
    };
    const render = () => {
      checkbox.checked = client.getState().sharing;
    };
    client.subscribe(render);
    render();
    parent.append(panel);
    return panel;
  }
  const api = { create, attachPanel, version };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrowserDiagnostics = api;
})(typeof globalThis === "object" ? globalThis : this);
