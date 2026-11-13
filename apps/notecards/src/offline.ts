import {
  createResources,
  createWorkerSession,
  createUpdatePolicy,
  applyUpdate,
} from "@ldayton/browser-offline";
import { diagnostics } from "./diagnostics";
import { persistence } from "./persistence";
import { offlineState, offlineActions } from "./offline-state";

export function setupOffline() {
  if (!import.meta.env.PROD) {
    offlineState.set({ status: "Offline use is available in the built app." });
    return;
  }
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    offlineState.set({
      status: "Offline use isn’t supported in this browser.",
    });
    diagnostics.offline("setup", "unsupported");
    return;
  }
  const current = document.querySelector<HTMLMetaElement>(
    'meta[name="notecards-shell"]',
  )!.content;
  const base = import.meta.env.BASE_URL;
  const resources = createResources();
  const session = createWorkerSession({ resources });
  const applySavedUpdate = async (version: string) => {
    if (await persistence.prepareUpdate()) applyUpdate(version);
  };
  const policy = createUpdatePolicy({
    app: "notecards",
    current,
    apply: applySavedUpdate,
  });
  let registration: ServiceWorkerRegistration | undefined;
  let active = true,
    busy = false,
    checkRequested = false,
    lastCheck = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const announce = () =>
    navigator.serviceWorker.controller?.postMessage({
      type: "using-cache",
      shellCache: current,
    });
  const later = () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (active && !document.hidden) void check(true);
    }, 30000);
  };
  const offer = (version: string) => {
    if (version === current) return;
    offlineState.set({ updateAvailable: true });
    offlineActions.update = () => void applySavedUpdate(version);
    policy.offer(version);
  };
  async function check(force = false) {
    if (
      !active ||
      document.hidden ||
      (!force && Date.now() - lastCheck < 15000)
    )
      return;
    if (busy) {
      checkRequested ||= force;
      return;
    }
    checkRequested = false;
    busy = true;
    lastCheck = Date.now();
    const epoch = session.generation(),
      signal = session.signal();
    offlineState.set({ busy: true });
    const started = performance.now();
    diagnostics.offline("setup", "started");
    try {
      registration = await resources.deadline(
        2000,
        () => navigator.serviceWorker.getRegistration(base),
        signal,
      );
      if (
        !registration ||
        ![
          registration.active,
          registration.installing,
          registration.waiting,
        ].some((worker) => worker && worker.state !== "redundant")
      ) {
        registration = await resources.deadline(
          15000,
          () =>
            navigator.serviceWorker.register(base + "sw.js", {
              scope: base,
              updateViaCache: "none",
            }),
          signal,
        );
      }
      diagnostics.observeOffline(registration);
      await session.settle(registration);
      if (!navigator.serviceWorker.controller) {
        await resources.deadline(
          5000,
          (inner) =>
            new Promise<void>((resolve, reject) => {
              const clean = () => {
                navigator.serviceWorker.removeEventListener(
                  "controllerchange",
                  done,
                );
                inner.removeEventListener("abort", abort);
              };
              const done = () => {
                  clean();
                  resolve();
                },
                abort = () => {
                  clean();
                  reject(inner.reason);
                };
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                done,
              );
              inner.addEventListener("abort", abort, { once: true });
              if (navigator.serviceWorker.controller) done();
            }),
          signal,
        );
      }
      if (!active || epoch !== session.generation()) return;
      announce();

      const saved = await session.call<{ ready: boolean; reason?: string }>(
        "offline-status",
        { shellCache: current },
        12000,
      );
      if (!active || epoch !== session.generation()) return;
      diagnostics.offline("storage", saved.ready ? "ready" : "unavailable", {
        cacheReason: saved.reason || (saved.ready ? "none" : "unavailable"),
      });
      diagnostics.offline("setup", "ready", {
        durationMs: performance.now() - started,
      });
      offlineState.set({
        status: saved.ready
          ? "Available offline"
          : "Offline copy needs repair. Retry when connected.",
        retryVisible: !saved.ready,
        ready: saved.ready,
      });
      // Offline startup and practice never wait for a network check.
      try {
        const updateStarted = performance.now();
        diagnostics.offline("update", "started");
        const result = await session.call<{
          ready: boolean;
          shellCache?: string;
          reason?: string;
        }>("prepare-update", {}, 45000);
        if (!active || epoch !== session.generation()) return;
        diagnostics.offline("update", result.ready ? "ready" : "failed", {
          durationMs: performance.now() - updateStarted,
          cacheReason: result.reason || "none",
        });
        if (result.ready && result.shellCache) {
          if (result.shellCache === current && !saved.ready) {
            offlineState.set({
              status: "Available offline",
              ready: true,
              retryVisible: false,
            });
          }
          offer(result.shellCache);
        } else later();
        // Replacing the worker does not replace the document or interrupt practice.
        await resources.deadline(15000, () => registration?.update(), signal);
      } catch (error) {
        if (!active || epoch !== session.generation()) return;
        diagnostics.offline("update", "failed", {}, error);
        later();
      }
    } catch (error) {
      if (!active || epoch !== session.generation()) return;
      diagnostics.offline(
        "setup",
        "failed",
        { durationMs: performance.now() - started },
        error,
      );
      offlineState.set({
        status:
          "Couldn’t save an offline copy. Retry when your connection or storage improves.",
        ready: false,
        retryVisible: true,
      });
      later();
    } finally {
      if (epoch === session.generation()) {
        busy = false;
        offlineState.set({ busy: false });
        if (checkRequested) queueMicrotask(() => void check(true));
      }
    }
  }
  offlineActions.retry = () => {
    void resources
      .deadline(2000, () => navigator.storage?.persist?.())
      .then((persistent) =>
        diagnostics.offline("storage", "ready", { persistent }),
      )
      .catch((error) => diagnostics.offline("storage", "failed", {}, error));
    offlineState.set({ status: "Saving for offline use…" });
    void check(true);
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    session.reset();
    busy = false;
    lastCheck = 0;
    announce();
    void check(true);
  });
  window.addEventListener("pagehide", () => {
    active = false;
    checkRequested = false;
    clearTimeout(retryTimer);
    session.abort();
    busy = false;
    lastCheck = 0;
  });
  window.addEventListener("pageshow", () => {
    if (!active) session.reset();
    active = true;
    void check(true);
  });
  window.addEventListener("online", () => void check(true));
  window.addEventListener("focus", () => void check());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void check(true);
  });
  setInterval(() => void check(), 60000);
  void check(true);
}
