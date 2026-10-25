import { diagnostics } from './diagnostics';
import {
  createResources,
  createUpdatePolicy,
  createWorkerSession,
  applyUpdate,
} from '@ldayton/browser-offline';

type SoundPack = {
  cache: string;
  files: { url: string; bytes: number; sha256?: string }[];
  shellCache: string;
  shell: string[];
  hashes?: Record<string, string>;
};
const resources = createResources();
export function setupOffline() {
  const button = document.querySelector<HTMLButtonElement>('#offline-download')!;
  const update = document.querySelector<HTMLButtonElement>('#offline-update')!;
  const status = document.querySelector<HTMLElement>('#offline-status')!;
  const progress = document.querySelector<HTMLProgressElement>('#offline-progress')!;
  const base = import.meta.env.BASE_URL;
  const expectedShell = document.querySelector<HTMLMetaElement>(
    'meta[name="dorego-shell"]'
  )?.content;
  const inventoryURL =
    document.querySelector<HTMLMetaElement>('meta[name="dorego-inventory"]')?.content ||
    `${base}offline-pack.json`;
  const session = createWorkerSession({ resources });
  const freshness = createUpdatePolicy({ app: 'dorego', current: expectedShell || 'unversioned' });
  let pack: SoundPack | undefined,
    downloading: AbortController | null = null;
  let active = true,
    interfaceNeedsRepair = false;
  let checkGeneration = 0,
    lastComplete: boolean | undefined,
    initializing: Promise<void> | null = null;
  let registration: ServiceWorkerRegistration | undefined,
    updating = false,
    lastUpdate = 0;
  let resumeWanted = false,
    retryTimer: ReturnType<typeof setTimeout> | undefined,
    retryDelay = 30000;
  try {
    resumeWanted = localStorage.getItem('dorego.offlineDownloadWanted') === 'yes';
  } catch {}
  const rememberIntent = (value: boolean) => {
    resumeWanted = value;
    try {
      localStorage.setItem('dorego.offlineDownloadWanted', value ? 'yes' : 'no');
    } catch {}
  };
  const schedule = () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!document.hidden) {
        if (!pack) void initialize();
        else if (resumeWanted) void download();
      } else schedule();
    }, retryDelay);
    retryDelay = Math.min(300000, retryDelay * 2);
  };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !('caches' in window)) {
    status.textContent = import.meta.env.DEV
      ? 'Offline downloads are available in the built app.'
      : 'Offline downloads aren’t supported in this browser.';
    button.hidden = true;
    if (!import.meta.env.DEV) diagnostics.offline('setup', 'unsupported');
    return;
  }
  const readCache = <T>(action: () => Promise<T>) => resources.deadline(2000, action);
  async function check() {
    if (!active || !pack || downloading) return;
    const current = pack,
      generation = ++checkGeneration;
    try {
      const cache = await readCache(() => caches.open(current.cache));
      const present: boolean[] = [];
      // Bound simultaneous reads and hashing so large cached banks do not spike memory.
      const remaining = current.files.map((file, index) => ({ file, index }));
      await Promise.all(
        Array.from({ length: 2 }, async () => {
          while (remaining.length) {
            const { file, index } = remaining.shift()!;
            present[index] = await readCache(async () => {
              const response = await cache.match(file.url);
              if (!response?.ok) return false;
              try {
                await resources.verify(await response.arrayBuffer(), file);
                return true;
              } catch (error) {
                if ((error as { offlineReason?: string }).offlineReason !== 'integrity')
                  throw error;
                if (!active || generation !== checkGeneration) return false;
                await cache.delete(file.url);
                diagnostics.offline('storage', 'failed', { cacheReason: 'integrity' }, error);
                return false;
              }
            });
          }
        })
      );
      const shell = await readCache(() => caches.open(current.shellCache));
      const interfacePresent: boolean[] = [];
      const shellFiles = current.shell.map((url, index) => ({ url, index }));
      await Promise.all(
        Array.from({ length: 2 }, async () => {
          while (shellFiles.length) {
            const { url, index } = shellFiles.shift()!;
            interfacePresent[index] = await readCache(async () => {
              const response = await shell.match(url);
              if (!response?.ok) return false;
              const sha256 = current.hashes?.[url];
              if (!sha256) return true;
              try {
                await resources.verify(await response.arrayBuffer(), { sha256 });
                return true;
              } catch (error) {
                if ((error as { offlineReason?: string }).offlineReason !== 'integrity')
                  throw error;
                return false;
              }
            });
          }
        })
      );
      const complete = present.every(Boolean) && interfacePresent.every(Boolean);
      if (generation !== checkGeneration || downloading) return;
      if (complete !== lastComplete) {
        diagnostics.offline('storage', complete ? 'ready' : 'unavailable', {
          cacheReason: complete ? 'none' : 'unavailable',
          fileCount: present.filter(Boolean).length,
          byteCount: current.files.reduce((sum, f, i) => sum + (present[i] ? f.bytes : 0), 0),
        });
        lastComplete = complete;
      }
      interfaceNeedsRepair = !interfacePresent.every(Boolean);
      status.textContent = interfaceNeedsRepair
        ? 'Offline app needs repair. Reload when connected.'
        : complete
          ? '✓ Available offline'
          : `Save all exercises and sounds · ${Math.ceil(current.files.reduce((sum, f) => sum + f.bytes, 0) / 1e6)} MB`;
      status.classList.toggle('is-ready', complete);
      button.hidden = complete;
      button.disabled = false;
      button.textContent = interfaceNeedsRepair ? 'Repair offline app' : 'Download for offline use';
      if (complete) rememberIntent(false);
      else if (resumeWanted && !document.hidden) void download();
    } catch (error) {
      diagnostics.offline('storage', 'failed', {}, error);
      if (generation !== checkGeneration || downloading) return;
      status.textContent =
        'Offline storage unavailable. Free some space or check browser settings, then retry.';
      button.hidden = false;
      button.disabled = false;
      button.textContent = 'Retry offline setup';
    }
  }
  async function download() {
    if (downloading || !pack) return;
    clearTimeout(retryTimer);
    rememberIntent(true);
    const epoch = session.generation();
    const current = pack,
      controller = new AbortController(),
      started = performance.now();
    downloading = controller;
    checkGeneration++;
    diagnostics.offline('download', 'started');
    button.hidden = false;
    button.disabled = false;
    button.textContent = 'Cancel download';
    progress.hidden = false;
    progress.max = current.files.reduce((sum, f) => sum + f.bytes, 0);
    progress.value = 0;
    let completed = 0;
    try {
      const cache = await readCache(() => caches.open(current.cache));
      const missing: SoundPack['files'] = [];
      for (const file of current.files) {
        controller.signal.throwIfAborted();
        const valid = await readCache(async () => {
          const r = await cache.match(file.url);
          if (!r?.ok) return false;
          try {
            await resources.verify(await r.arrayBuffer(), file);
            return true;
          } catch (error) {
            if ((error as { offlineReason?: string }).offlineReason !== 'integrity') throw error;
            controller.signal.throwIfAborted();
            await cache.delete(file.url);
            return false;
          }
        });
        if (valid) completed += file.bytes;
        else missing.push(file);
      }
      const required = missing.reduce((sum, f) => sum + f.bytes, 0);
      const estimate = await resources
        .deadline(1000, () => navigator.storage?.estimate?.())
        .catch(() => undefined);
      if (
        estimate?.quota !== undefined &&
        estimate.usage !== undefined &&
        estimate.quota - estimate.usage < required
      )
        throw Object.assign(new Error('Not enough offline storage'), {
          name: 'QuotaExceededError',
        });
      const report = () => {
        progress.value = completed;
        status.textContent = `Downloading sounds… ${Math.floor((completed / progress.max) * 100)}%`;
      };
      report();
      await Promise.allSettled(
        Array.from({ length: 2 }, async () => {
          while (missing.length) {
            controller.signal.throwIfAborted();
            const file = missing.shift()!;
            try {
              const bytes = await resources.fetchBytes(file.url, {
                ...file,
                signal: controller.signal,
                onRetry: (attempt, cacheReason) =>
                  diagnostics.offline('download', 'retrying', { retryCount: attempt, cacheReason }),
              });
              controller.signal.throwIfAborted();
              await resources.deadline(
                2000,
                () =>
                  cache.put(
                    file.url,
                    new Response(bytes, {
                      headers: {
                        'Content-Type': 'audio/flac',
                        'Content-Length': String(bytes.byteLength),
                      },
                    })
                  ),
                controller.signal
              );
              completed += file.bytes;
              report();
            } catch (error) {
              controller.abort(error);
              throw error;
            }
          }
        })
      );
      controller.signal.throwIfAborted();
      if (!active || epoch !== session.generation()) return;
      diagnostics.offline('download', 'ready', {
        durationMs: performance.now() - started,
        byteCount: completed,
        fileCount: current.files.length,
      });
      rememberIntent(false);
      retryDelay = 30000;
      downloading = null;
      await check();
    } catch (error) {
      if (!active || epoch !== session.generation()) return;
      const reason = error as { offlineReason?: string; name?: string };
      const cancelled = controller.signal.reason?.name === 'AbortError';
      diagnostics.offline(
        'download',
        cancelled ? 'paused' : 'failed',
        {
          durationMs: performance.now() - started,
          byteCount: completed,
          ...(cancelled ? { cacheReason: 'cancelled' } : {}),
        },
        error
      );
      if (cancelled) {
        rememberIntent(false);
        status.textContent = 'Download paused. Download again to continue.';
      } else if (reason.name === 'QuotaExceededError') {
        status.textContent = 'Not enough storage. Free some space, then resume.';
      } else {
        status.textContent =
          'Download incomplete. Saved files are kept; retrying when the connection improves.';
        if (
          reason.offlineReason === 'network' ||
          reason.offlineReason === 'timeout' ||
          reason.name === 'TypeError'
        )
          schedule();
      }
      button.textContent = 'Resume download';
      button.disabled = false;
    } finally {
      if (epoch === session.generation()) {
        downloading = null;
        progress.hidden = true;
      }
    }
  }
  button.onclick = () => {
    if (downloading) {
      rememberIntent(false);
      clearTimeout(retryTimer);
      downloading.abort();
      return;
    }
    if (interfaceNeedsRepair) {
      location.reload();
      return;
    }
    if (!pack) {
      void initialize();
      return;
    }
    // A user-requested offline download is the appropriate moment to ask for persistence.
    void resources
      .deadline(3000, () => navigator.storage?.persist?.())
      .then((persistent) => diagnostics.offline('storage', 'ready', { persistent }))
      .catch((error) => diagnostics.offline('storage', 'failed', {}, error));
    void download();
  };
  update.onclick = () =>
    update.dataset.release ? applyUpdate(update.dataset.release) : location.reload();
  const rpc = () =>
    session.call<{ ready: boolean; shellCache?: string; reason?: string }>(
      'prepare-update',
      {},
      40000
    );
  async function checkUpdate(force = false) {
    if (
      !active ||
      !pack ||
      updating ||
      document.hidden ||
      (!force && Date.now() - lastUpdate < 15000) ||
      !navigator.serviceWorker.controller
    )
      return;
    const epoch = session.generation();
    updating = true;
    lastUpdate = Date.now();
    const started = performance.now();
    diagnostics.offline('update', 'started');
    try {
      const reply = await rpc();
      if (!active || epoch !== session.generation()) return;
      // Finish worker replacement before offering a navigation. Otherwise a
      // newly refreshed tab can close while its replacement is still activating.
      await resources.deadline(15000, () => registration?.update(), session.signal());
      await session.settle(registration);
      if (!active || epoch !== session.generation()) return;
      diagnostics.offline('update', reply.ready ? 'ready' : 'failed', {
        durationMs: performance.now() - started,
        ...(reply.reason ? { cacheReason: reply.reason } : {}),
      });
      if (reply.ready) {
        update.hidden = reply.shellCache === pack.shellCache;
        if (!update.hidden && reply.shellCache) {
          update.dataset.release = reply.shellCache;
          freshness.offer(reply.shellCache);
        }
      }
    } catch (error) {
      if (active && epoch === session.generation())
        diagnostics.offline('update', 'failed', {}, error);
    } finally {
      if (epoch === session.generation()) updating = false;
    }
    if (!active || epoch !== session.generation()) return;
  }
  function initialize(): Promise<void> {
    if (initializing) return initializing;
    const epoch = session.generation(),
      signal = session.signal(),
      started = performance.now();
    diagnostics.offline('setup', 'started');
    initializing = (async () => {
      try {
        if (navigator.serviceWorker.controller)
          registration = await resources.deadline(
            2000,
            () => navigator.serviceWorker.getRegistration(),
            signal
          );
        else {
          registration = await resources.deadline(
            15000,
            () =>
              navigator.serviceWorker.register(`${base}sw.js`, {
                scope: base,
                updateViaCache: 'none',
              }),
            signal
          );
          diagnostics.observeOffline(registration);
          await resources.deadline(60000, () => navigator.serviceWorker.ready, signal);
          if (!navigator.serviceWorker.controller)
            await resources.deadline(
              5000,
              (inner) =>
                new Promise<void>((resolve, reject) => {
                  const cleanup = () => {
                    navigator.serviceWorker.removeEventListener('controllerchange', done);
                    inner.removeEventListener('abort', abort);
                  };
                  const done = () => {
                      cleanup();
                      resolve();
                    },
                    abort = () => {
                      cleanup();
                      reject(inner.reason);
                    };
                  navigator.serviceWorker.addEventListener('controllerchange', done, {
                    once: true,
                  });
                  inner.addEventListener('abort', abort, { once: true });
                }),
              signal
            );
        }
        const bytes = await resources.fetchBytes(inventoryURL, {
          signal,
          timeoutMs: 8000,
          idleMs: 5000,
          attempts: 2,
        });
        if (!active || epoch !== session.generation()) return;
        const candidate = JSON.parse(new TextDecoder().decode(bytes)) as SoundPack;
        if (
          (expectedShell && candidate.shellCache !== expectedShell) ||
          !candidate.shellCache?.startsWith('dorego-shell-') ||
          !candidate.cache?.startsWith('dorego-sounds-') ||
          !Array.isArray(candidate.files) ||
          !Array.isArray(candidate.shell) ||
          !candidate.files.every((file) => {
            const url = new URL(file.url, location.href);
            return (
              url.origin === location.origin &&
              url.pathname.startsWith(base + 'samples/') &&
              Number.isSafeInteger(file.bytes) &&
              file.bytes > 0 &&
              file.bytes <= 64 * 1024 * 1024 &&
              (!file.sha256 || /^[a-f0-9]{64}$/.test(file.sha256))
            );
          }) ||
          !candidate.shell.every((path) => {
            const url = new URL(path, location.href);
            return url.origin === location.origin && url.pathname.startsWith(base);
          })
        )
          throw Object.assign(Error('Invalid offline inventory'), { offlineReason: 'integrity' });
        pack = candidate;
        navigator.serviceWorker.controller?.postMessage({
          type: 'using-cache',
          shellCache: pack.shellCache,
          cache: pack.cache,
        });
        if (registration) diagnostics.observeOffline(registration);
        await check();
        if (!active || epoch !== session.generation()) return;
        diagnostics.offline('setup', 'ready', { durationMs: performance.now() - started });
        retryDelay = 30000;
        void checkUpdate();
      } catch (error) {
        if (!active || epoch !== session.generation()) return;
        diagnostics.offline('setup', 'failed', { durationMs: performance.now() - started }, error);
        status.textContent =
          'Offline setup unavailable. Retry when your connection or storage improves.';
        button.hidden = false;
        button.disabled = false;
        button.textContent = 'Retry offline setup';
        schedule();
      }
    })().finally(() => {
      if (epoch === session.generation()) initializing = null;
    });
    return initializing;
  }
  const wake = (force = false) => {
    if (!active) return;
    if (!pack) void initialize();
    else {
      void check();
      void checkUpdate(force);
    }
  };
  window.addEventListener('online', () => {
    retryDelay = 30000;
    if (resumeWanted && pack) void download();
    wake(true);
  });
  window.addEventListener('offline', () => {
    if (!downloading) void check();
  });
  window.addEventListener('pagehide', () => {
    active = false;
    checkGeneration++;
    clearTimeout(retryTimer);
    session.abort();
    initializing = null;
    updating = false;
    lastUpdate = 0;
    // Preserve download intent for reopen, while stopping work owned by this document.
    downloading?.abort(Object.assign(new Error('Page suspended'), { offlineReason: 'timeout' }));
    downloading = null;
    progress.hidden = true;
  });
  window.addEventListener('pageshow', () => {
    if (!active) session.reset();
    active = true;
    wake(true);
  });
  window.addEventListener('focus', () => wake());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake(true);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    session.reset();
    initializing = null;
    updating = false;
    lastUpdate = 0;
    checkGeneration++;
    downloading?.abort(Object.assign(new Error('Worker replaced'), { offlineReason: 'timeout' }));
    downloading = null;
    progress.hidden = true;
    if (pack)
      navigator.serviceWorker.controller?.postMessage({
        type: 'using-cache',
        shellCache: pack.shellCache,
        cache: pack.cache,
      });
    wake();
  });
  setInterval(() => {
    if (!document.hidden) void checkUpdate();
  }, 60000);
  void initialize();
}
