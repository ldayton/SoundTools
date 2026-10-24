import { diagnostics } from './diagnostics';
type SoundPack = {
  cache: string;
  files: { url: string; bytes: number }[];
  shellCache: string;
  shell: string[];
};

export function setupOffline() {
  const button = document.querySelector<HTMLButtonElement>('#offline-download')!;
  const status = document.querySelector<HTMLElement>('#offline-status')!;
  const progress = document.querySelector<HTMLProgressElement>('#offline-progress')!;
  const base = import.meta.env.BASE_URL;
  let pack: SoundPack;
  let downloading: AbortController | null = null;
  let checkGeneration = 0;

  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !('caches' in window)) {
    status.textContent = import.meta.env.DEV
      ? 'Offline downloads are available in the built app.'
      : 'Offline downloads aren’t supported in this browser.';
    button.hidden = true;
    return;
  }

  async function check() {
    if (!pack || downloading) return;
    const generation = ++checkGeneration;
    try {
      const cache = await caches.open(pack.cache);
      const present = await Promise.all(
        pack.files.map(async (file) => (await cache.match(file.url))?.ok)
      );
      const shell = await caches.open(pack.shellCache);
      const interfacePresent = await Promise.all(
        pack.shell.map(async (url) => (await shell.match(url))?.ok)
      );
      const complete = present.every(Boolean) && interfacePresent.every(Boolean);
      if (generation !== checkGeneration || downloading) return;
      status.textContent = complete
        ? '✓ Available offline'
        : !navigator.onLine
          ? 'Internet required to download'
          : `Save all exercises and sounds · ${Math.ceil(pack.files.reduce((sum, file) => sum + file.bytes, 0) / 1e6)} MB`;
      status.classList.toggle('is-ready', complete);
      button.hidden = complete;
      button.textContent = 'Download for offline use';
      button.disabled = !navigator.onLine;
    } catch {
      if (generation !== checkGeneration || downloading) return;
      status.textContent = 'Could not check offline storage. Please try again.';
      button.hidden = false;
      button.disabled = !navigator.onLine;
    }
  }

  button.addEventListener('click', async () => {
    if (downloading) {
      downloading.abort();
      return;
    }
    if (!pack) return;
    if (!navigator.onLine) {
      await check();
      return;
    }
    const controller = new AbortController();
    checkGeneration++;
    downloading = controller;
    button.textContent = 'Cancel download';
    progress.hidden = false;
    progress.max = pack.files.reduce((sum, file) => sum + file.bytes, 0);
    progress.value = 0;
    let completed = 0;
    const report = () => {
      progress.value = completed;
      status.textContent = `Downloading sounds… ${Math.floor((completed / progress.max) * 100)}%`;
    };
    report();
    try {
      const cache = await caches.open(pack.cache);
      const remaining = [...pack.files];
      // Keep downloads light, with no decoding or interference with the audio graph.
      await Promise.allSettled(
        Array.from({ length: 2 }, async () => {
          while (remaining.length) {
            controller.signal.throwIfAborted();
            const file = remaining.shift()!;
            if (!(await cache.match(file.url))?.ok) {
              try {
                const response = await fetch(file.url, { signal: controller.signal });
                if (!response.ok) throw new Error('A recording could not be downloaded.');
                const data = await response.arrayBuffer();
                if (data.byteLength !== file.bytes) throw new Error('A recording was incomplete.');
                controller.signal.throwIfAborted();
                await cache.put(
                  file.url,
                  new Response(data, {
                    headers: {
                      'Content-Type': 'audio/flac',
                      'Content-Length': String(data.byteLength),
                    },
                  })
                );
              } catch (error) {
                controller.abort(error);
                throw error;
              }
            }
            completed += file.bytes;
            report();
          }
        })
      );
      controller.signal.throwIfAborted();
      // Persistence is best-effort. A denial does not invalidate a verified download.
      void navigator.storage?.persist?.().catch(() => false);
      downloading = null;
      await check();
    } catch (error) {
      if (navigator.onLine && controller.signal.reason?.name !== 'AbortError') diagnostics.capture(error, 'cache.download_failed');
      status.textContent = !navigator.onLine
        ? 'Internet required to download'
        : controller.signal.reason?.name === 'AbortError'
          ? 'Download paused. Download again to continue.'
          : 'Download incomplete. Check your connection and available storage, then try again.';
      button.textContent = 'Resume download';
      button.disabled = !navigator.onLine;
    } finally {
      downloading = null;
      progress.hidden = true;
    }
  });

  void (async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${base}sw.js`, {
        scope: base,
        updateViaCache: 'none',
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
        );
      const response = await fetch(`${base}offline-pack.json`);
      if (!response.ok) throw new Error('Offline list unavailable.');
      pack = await response.json();
      const announce = () =>
        navigator.serviceWorker.controller?.postMessage({
          type: 'using-cache',
          shellCache: pack.shellCache,
          cache: pack.cache,
        });
      announce();
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        announce();
        void check();
      });
      await check();
      // Adopt request handling immediately; never reload a document or interrupt audio.
      window.addEventListener('online', () => {
        void check();
        void registration.update().catch(() => {});
      });
      window.addEventListener('offline', () => void check());
      window.addEventListener('pageshow', () => void check());
      window.addEventListener('focus', () => void check());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void check();
      });
    } catch (error) {
      diagnostics.capture(error, 'cache.setup_failed');
      status.textContent = 'Offline setup unavailable. Reconnect and reload to try again.';
      button.hidden = true;
    }
  })();
}
