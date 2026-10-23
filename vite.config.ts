import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { offlineBuild } from './scripts/offline-build';

let revision = 'local';
try { revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
function sourceFiles(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(dir + '/' + entry.name) : [dir + '/' + entry.name]).sort(); }
const sourceHash = createHash('sha256');
for (const file of [...sourceFiles('src'), ...sourceFiles('scripts'), 'vite.config.ts', 'package-lock.json', 'index.html', 'render.html']) sourceHash.update(file).update(readFileSync(file));
const fingerprint = sourceHash.digest('hex').slice(0,12);

export default defineConfig(({ mode }) => ({
  define: { __DOREGO_BUILD__: JSON.stringify(revision + '-' + fingerprint) },
  base: mode === 'pages' ? '/DoReGo/' : '/',
  plugins: [offlineBuild()],
  build: {
    sourcemap: 'hidden',
    rollupOptions: { input: { main: resolve('index.html'), render: resolve('render.html') } },
  },
}));
