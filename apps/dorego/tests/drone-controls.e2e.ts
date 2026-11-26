import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  waitForServer,
  captureFailure,
  closeBrowser,
} from '../../../scripts/ci/browser-harness.cjs';
import { launchTestBrowser } from './browser-harness';
import { verifyLiveDrone } from './live-drone';

const vite = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package.json$/, 'bin/vite.js');
const port = 4710;
const base = `http://127.0.0.1:${port}/DoReGo/`;
const server = spawn(
  process.execPath,
  [
    vite,
    'preview',
    '--mode',
    'pages',
    '--outDir',
    'dist-pages',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'ignore' }
);
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchTestBrowser();
  await verifyLiveDrone(browser, base);
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill('SIGTERM');
}
