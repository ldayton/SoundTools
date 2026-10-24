import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { offlineBuild } from './scripts/offline-build';

let revision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local';
if (revision === 'local') try { revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
function sourceFiles(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.name === 'node_modules' ? [] : entry.isDirectory() ? sourceFiles(dir + '/' + entry.name) : [dir + '/' + entry.name]).sort(); }
const sourceHash = createHash('sha256');
for (const file of [...sourceFiles('src'), ...sourceFiles('scripts'), ...sourceFiles('../../packages'), 'vite.config.ts', '../../package-lock.json', 'index.html', 'render.html']) sourceHash.update(file).update(readFileSync(file));
const fingerprint = sourceHash.digest('hex').slice(0,12);

export default defineConfig(({ mode }) => ({
  define: { __DOREGO_BUILD__: JSON.stringify(revision + '-' + fingerprint), 'import.meta.env.VITE_DEPLOY_ENV': JSON.stringify(process.env.VERCEL_ENV || 'development') },
  base: mode === 'pages' ? '/DoReGo/' : '/',
  plugins: [offlineBuild(revision + '-' + fingerprint)],
  optimizeDeps: { include: ['@ldayton/browser-diagnostics'] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/browser-diagnostics/] },
    sourcemap: 'hidden',
    rollupOptions: { input: { main: resolve('index.html'), render: resolve('render.html') } },
  },
}));
