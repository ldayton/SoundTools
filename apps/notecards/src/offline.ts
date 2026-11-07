import {
  createResources,
  createWorkerSession,
  createUpdatePolicy,
  applyUpdate,
} from "@ldayton/browser-offline";

export function setupOffline() {
  const status = document.querySelector<HTMLElement>("#offline-status")!;
  const retry = document.querySelector<HTMLButtonElement>("#offline-retry")!;
  const update = document.querySelector<HTMLButtonElement>("#offline-update")!;
  if (!import.meta.env.PROD) {
    status.textContent = "Offline use is available in the built app.";
    return;
  }
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    status.textContent = "Offline use isn’t supported in this browser.";
    return;
  }
  const current = document.querySelector<HTMLMetaElement>(
    'meta[name="notecards-shell"]',
  )!.content;
  const base = import.meta.env.BASE_URL;
  const resources = createResources();
  const session = createWorkerSession({ resources });
  const policy = createUpdatePolicy({ app: "notecards", current });
  let registration: ServiceWorkerRegistration | undefined;
  let active = true,
    busy = false,
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
    update.hidden = false;
    update.onclick = () => applyUpdate(version);
    policy.offer(version);
  };
  async function check(force = false) {
    if (
      !active ||
      busy ||
      document.hidden ||
      (!force && Date.now() - lastCheck < 15000)
    )
      return;
    busy = true;
    lastCheck = Date.now();
    const epoch = session.generation(),
      signal = session.signal();
    retry.disabled = true;
    let operation = "registration lookup";
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
        operation = "worker registration";
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
      operation = "worker activation";
      await session.settle(registration);
      if (!navigator.serviceWorker.controller) {
        operation = "worker control";
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
      retry.textContent = "Retry offline setup";
      operation = "offline status";
      const saved = await session.call<{ ready: boolean; reason?: string }>(
        "offline-status",
        { shellCache: current },
        12000,
      );
      if (!active || epoch !== session.generation()) return;
      status.textContent = saved.ready
        ? "Available offline"
        : "Offline copy needs repair. Retry when connected.";
      retry.hidden = saved.ready;
      status.classList.toggle("is-ready", saved.ready);
      // Offline startup and practice never wait for a network check.
      try {
        const result = await session.call<{
          ready: boolean;
          shellCache?: string;
        }>("prepare-update", {}, 45000);
        if (!active || epoch !== session.generation()) return;
        if (result.ready && result.shellCache) {
          if (result.shellCache === current && !saved.ready) {
            status.textContent = "Available offline";
            status.classList.add("is-ready");
            retry.hidden = true;
          }
          offer(result.shellCache);
        } else later();
        // Replacing the worker does not replace the document or interrupt practice.
        await resources.deadline(15000, () => registration?.update(), signal);
      } catch {
        later();
      }
    } catch (error) {
      if (!active || epoch !== session.generation()) return;
      console.warn("Offline setup failed", operation, error);
      status.textContent =
        "Couldn’t save an offline copy. Retry when your connection or storage improves.";
      retry.textContent = "Retry offline setup";
      status.classList.remove("is-ready");
      retry.hidden = false;
      later();
    } finally {
      if (epoch === session.generation()) {
        busy = false;
        retry.disabled = false;
      }
    }
  }
  retry.onclick = () => {
    void resources
      .deadline(2000, () => navigator.storage?.persist?.())
      .catch(() => {});
    status.textContent = "Saving for offline use…";
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
