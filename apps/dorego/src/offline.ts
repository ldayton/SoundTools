import { diagnostics } from './diagnostics';
import { createResources } from '@ldayton/browser-offline';

type SoundPack = {
  cache: string;
  files: { url: string; bytes: number; sha256?: string }[];
  shellCache: string;
  shell: string[];
};
const resources = createResources();
export function setupOffline() {
  const button = document.querySelector<HTMLButtonElement>('#offline-download')!;
  const update = document.querySelector<HTMLButtonElement>('#offline-update')!;
  const status = document.querySelector<HTMLElement>('#offline-status')!;
  const progress = document.querySelector<HTMLProgressElement>('#offline-progress')!;
  const base = import.meta.env.BASE_URL;
  let pack: SoundPack | undefined,
    downloading: AbortController | null = null;
  let active = true;
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
                if ((error as { offlineReason?: string }).offlineReason !== 'integrity') throw error;
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
      const interfacePresent = await readCache(() =>
        Promise.all(current.shell.map(async (url) => (await shell.match(url))?.ok))
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
      status.textContent = complete
        ? '✓ Available offline'
        : `Save all exercises and sounds · ${Math.ceil(current.files.reduce((sum, f) => sum + f.bytes, 0) / 1e6)} MB`;
      status.classList.toggle('is-ready', complete);
      button.hidden = complete;
      button.disabled = false;
      button.textContent = 'Download for offline use';
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
      downloading = null;
      progress.hidden = true;
    }
  }
  button.onclick = () => {
    if (downloading) {
      rememberIntent(false);
      clearTimeout(retryTimer);
      downloading.abort();
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
  update.onclick = () => location.reload();
  function rpc(): Promise<{ ready: boolean; shellCache?: string; reason?: string }> {
    return resources.deadline(
      40000,
      (signal) =>
        new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          const abort = () => {
            channel.port1.close();
            reject(signal.reason);
          };
          signal.addEventListener('abort', abort, { once: true });
          channel.port1.onmessage = ({ data }) => {
            signal.removeEventListener('abort', abort);
            channel.port1.close();
            resolve(data);
          };
          try {
            navigator.serviceWorker.controller!.postMessage({ type: 'prepare-update' }, [
              channel.port2,
            ]);
          } catch (error) {
            signal.removeEventListener('abort', abort);
            channel.port1.close();
            reject(error);
          }
        })
    );
  }
  async function checkUpdate() {
    if (
      !pack ||
      updating ||
      document.hidden ||
      Date.now() - lastUpdate < 15000 ||
      !navigator.serviceWorker.controller
    )
      return;
    updating = true;
    lastUpdate = Date.now();
    const started = performance.now();
    diagnostics.offline('update', 'started');
    try {
      const reply = await rpc();
      diagnostics.offline('update', reply.ready ? 'ready' : 'failed', {
        durationMs: performance.now() - started,
        ...(reply.reason ? { cacheReason: reply.reason } : {}),
      });
      if (reply.ready) update.hidden = reply.shellCache === pack.shellCache;
    } catch (error) {
      diagnostics.offline('update', 'failed', {}, error);
    } finally {
      updating = false;
    }
    void registration
      ?.update()
      .catch((error) => diagnostics.offline('worker', 'failed', {}, error));
  }
  function initialize(): Promise<void> {
    if (initializing) return initializing;
    const started = performance.now();
    diagnostics.offline('setup', 'started');
    initializing = (async () => {
      try {
        // Existing cached pages do not wait on a potentially hanging sw.js update.
        if (navigator.serviceWorker.controller) {
          registration = await resources.deadline(2000, () =>
            navigator.serviceWorker.getRegistration()
          );
        }
        if (!navigator.serviceWorker.controller) {
          registration = await resources.deadline(15000, () =>
            navigator.serviceWorker.register(`${base}sw.js`, {
              scope: base,
              updateViaCache: 'none',
            })
          );
          diagnostics.observeOffline(registration);
          await resources.deadline(15000, () => navigator.serviceWorker.ready);
          if (!navigator.serviceWorker.controller)
            await resources.deadline(
              5000,
              (signal) =>
                new Promise<void>((resolve, reject) => {
                  const done = () => {
                      cleanup();
                      resolve();
                    },
                    abort = () => {
                      cleanup();
                      reject(signal.reason);
                    },
                    cleanup = () => {
                      navigator.serviceWorker.removeEventListener('controllerchange', done);
                      signal.removeEventListener('abort', abort);
                    };
                  navigator.serviceWorker.addEventListener('controllerchange', done, {
                    once: true,
                  });
                  signal.addEventListener('abort', abort, { once: true });
                })
            );
        }
        const bytes = await resources.fetchBytes(`${base}offline-pack.json`, {
          timeoutMs: 8000,
          idleMs: 5000,
          attempts: 2,
        });
        const candidate = JSON.parse(new TextDecoder().decode(bytes)) as SoundPack;
        if (!candidate.shellCache?.startsWith('dorego-shell-') || !candidate.cache?.startsWith('dorego-sounds-') || !Array.isArray(candidate.files) || !Array.isArray(candidate.shell) ||
          !candidate.files.every(file => {const url=new URL(file.url,location.href);return url.origin===location.origin&&url.pathname.startsWith(base+'samples/')&&Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=64*1024*1024&&(!file.sha256||/^[a-f0-9]{64}$/.test(file.sha256));}) ||
          !candidate.shell.every(path => {const url=new URL(path,location.href);return url.origin===location.origin&&url.pathname.startsWith(base);}))
          throw Object.assign(Error('Invalid offline inventory'),{offlineReason:'integrity'});
        pack = candidate;
        navigator.serviceWorker.controller?.postMessage({
          type: 'using-cache',
          shellCache: pack.shellCache,
          cache: pack.cache,
        });
        if (registration) diagnostics.observeOffline(registration);
        await check();
        diagnostics.offline('setup', 'ready', { durationMs: performance.now() - started });
        retryDelay = 30000;
        void checkUpdate();
      } catch (error) {
        diagnostics.offline('setup', 'failed', { durationMs: performance.now() - started }, error);
        status.textContent =
          'Offline setup unavailable. Retry when your connection or storage improves.';
        button.hidden = false;
        button.disabled = false;
        button.textContent = 'Retry offline setup';
        schedule();
      }
    })().finally(() => (initializing = null));
    return initializing;
  }
  const wake = () => {
    if (!pack) void initialize();
    else {
      void check();
      void checkUpdate();
    }
  };
  window.addEventListener('online', () => {
    retryDelay = 30000;
    if (resumeWanted && pack) void download();
    wake();
  });
  window.addEventListener('offline', () => {
    if (!downloading) void check();
  });
  window.addEventListener('pagehide', () => {
    active = false;
    checkGeneration++;
    // Preserve download intent for reopen, while stopping work owned by this document.
    downloading?.abort(Object.assign(new Error('Page suspended'), { offlineReason: 'timeout' }));
  });
  window.addEventListener('pageshow', () => { active = true; wake(); });
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
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
