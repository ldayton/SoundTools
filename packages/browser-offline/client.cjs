(function (root) {
  function applyUpdate(version, env = globalThis) {
    const url = new URL(env.location.href);
    url.searchParams.set("__soundtools_update", version);
    env.location.replace(url.href);
  }
  // Refresh only an untouched foreground page. Explicit updates remain available
  // after interaction; a per-tab guard prevents automatic reload loops.
  function createUpdatePolicy({
    env = globalThis,
    app,
    current,
    apply = (version) => applyUpdate(version, env),
  } = {}) {
    let interacted = false,
      applied = false,
      offered;
    const listeners = [];
    const on = (target, name, fn) => {
      target?.addEventListener(name, fn, true);
      listeners.push(() => target?.removeEventListener(name, fn, true));
    };
    const touch = () => {
      interacted = true;
    };
    for (const name of [
      "pointerdown",
      "keydown",
      "input",
      "change",
      "submit",
      "wheel",
    ])
      on(env.document, name, touch);
    function refresh() {
      if (
        !offered ||
        offered === current ||
        interacted ||
        env.__soundtoolsStartup?.interacted ||
        applied ||
        env.document?.hidden
      )
        return false;
      const key = app + ".automaticUpdate",
        now = Date.now();
      try {
        const storage = env.sessionStorage;
        if (!storage) return false;
        let prior;
        try {
          prior = JSON.parse(storage.getItem(key) || "null");
        } catch {}
        if (Number.isFinite(prior?.at) && now - prior.at < 60000) return false;
        const marker = JSON.stringify({ from: current, to: offered, at: now });
        storage.setItem(key, marker);
        if (storage.getItem(key) !== marker) return false;
      } catch {
        return false;
      }
      applied = true;
      apply(offered);
      return true;
    }
    on(env.document, "visibilitychange", refresh);
    return {
      offer(next) {
        if (typeof next !== "string" || !next || next === current) return false;
        offered = next;
        return refresh();
      },
      dispose() {
        for (const remove of listeners) remove();
      },
    };
  }
  function createWorkerSession({ env = globalThis, resources } = {}) {
    let owner = new AbortController(),
      generation = 0;
    const reset = (
      reason = new DOMException("Worker session replaced", "TimeoutError"),
    ) => {
      owner.abort(reason);
      owner = new AbortController();
      generation++;
    };
    const abort = (
      reason = new DOMException("Page suspended", "TimeoutError"),
    ) => {
      owner.abort(reason);
      generation++;
    };
    async function call(type, data = {}, timeout = 40000, parent) {
      const controller = new AbortController(),
        signals = [owner.signal, parent].filter(Boolean),
        listeners = [];
      for (const signal of signals) {
        const forward = () => controller.abort(signal.reason);
        if (signal.aborted) forward();
        else {
          signal.addEventListener("abort", forward, { once: true });
          listeners.push(() => signal.removeEventListener("abort", forward));
        }
      }
      try {
        return await resources.deadline(
          timeout,
          (signal) =>
            new Promise((resolve, reject) => {
              const channel = new env.MessageChannel(),
                close = () => {
                  signal.removeEventListener("abort", stop);
                  channel.port1.close();
                },
                stop = () => {
                  close();
                  reject(signal.reason);
                };
              signal.addEventListener("abort", stop, { once: true });
              channel.port1.onmessage = ({ data }) => {
                close();
                resolve(data);
              };
              try {
                const worker = env.navigator.serviceWorker.controller;
                if (!worker)
                  throw new DOMException(
                    "No controlling worker",
                    "InvalidStateError",
                  );
                worker.postMessage({ ...data, type }, [channel.port2]);
              } catch (error) {
                close();
                reject(error);
              }
            }),
          controller.signal,
        );
      } finally {
        for (const remove of listeners) remove();
      }
    }
    function settle(registration, timeout = 65000) {
      return resources.deadline(
        timeout,
        (signal) =>
          new Promise((resolve, reject) => {
            const worker =
              registration?.installing ||
              registration?.waiting ||
              registration?.active;
            if (!worker || ["activated", "redundant"].includes(worker.state)) {
              resolve();
              return;
            }
            const clean = () => {
                worker.removeEventListener("statechange", changed);
                signal.removeEventListener("abort", stop);
              },
              changed = () => {
                if (["activated", "redundant"].includes(worker.state)) {
                  clean();
                  resolve();
                }
              },
              stop = () => {
                clean();
                reject(signal.reason);
              };
            worker.addEventListener("statechange", changed);
            signal.addEventListener("abort", stop, { once: true });
            changed();
          }),
        owner.signal,
      );
    }
    return {
      call,
      settle,
      reset,
      abort,
      generation: () => generation,
      signal: () => owner.signal,
    };
  }
  if (typeof module === "object" && module.exports)
    module.exports = { createUpdatePolicy, createWorkerSession, applyUpdate };
  else
    Object.assign(root.BrowserOffline || (root.BrowserOffline = {}), {
      createUpdatePolicy,
      createWorkerSession,
      applyUpdate,
    });
})(typeof globalThis === "object" ? globalThis : this);
