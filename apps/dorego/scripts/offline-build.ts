import { workerSource } from '@ldayton/browser-offline';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { offlineWorker } from './offline-worker';

// Only the web sound bank belongs in an offline download, never the 401 MB originals.
export function offlineBuild(): Plugin {
  let base = '/';
  return {
    name: 'dorego-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const sounds = ['bitklavier-web-v1', 'vsco-cello'].flatMap((folder) =>
        readdirSync(resolve('public/samples', folder))
          .filter((file) => file.endsWith('.flac'))
          .sort()
          .map((file) => `samples/${folder}/${file}`)
      );
      const hash = createHash('sha256');
      const files = sounds.map((path) => {
        const data = readFileSync(resolve('public', path));
        hash.update(path).update(data);
        return { url: base + path, bytes: data.length };
      });
      const soundCache = `dorego-sounds-${hash.digest('hex').slice(0, 16)}`;
      const soundPack = JSON.stringify({ cache: soundCache, files });
      const shell = [
        base,
        ...Object.keys(bundle)
          .filter((path) => path !== 'index.html' && !path.endsWith('.map'))
          .map((path) => base + path),
        ...[
          'manifest.webmanifest',
          'icon.svg',
          'icon-192.png',
          'icon-512.png',
          'apple-touch-icon.png',
          'offline-pack.json',
          'samples/bitklavier/NOTICE.txt',
          'samples/vsco-cello/NOTICE.txt',
        ].map((path) => base + path),
      ];
      const version = createHash('sha256')
        .update(soundPack)
        .update(readFileSync(resolve('scripts/offline-worker.ts')))
        .update(workerSource());
      for (const entry of Object.values(bundle))
        version.update(entry.type === 'chunk' ? entry.code : entry.source);
      for (const path of [
        'manifest.webmanifest',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
      ])
        version.update(readFileSync(resolve('public', path)));
      const shellCache = `dorego-shell-${version.digest('hex').slice(0, 16)}`;
      const pack = JSON.stringify({ cache: soundCache, files, shellCache, shell });
      const worker = offlineWorker({ shell: shellCache, sounds: soundCache, files: shell, base });
      this.emitFile({ type: 'asset', fileName: 'offline-pack.json', source: pack });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
    },
  };
}
