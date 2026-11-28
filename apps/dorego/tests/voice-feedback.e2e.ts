import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { waitForServer, launchBrowser, captureFailure, closeBrowser } from '../../../scripts/ci/browser-harness.cjs';
import { verifyVoiceFeedback } from './voice-feedback.browser';
const vite = createRequire(import.meta.url).resolve('vite/package.json').replace(/package.json$/, 'bin/vite.js');
const port = Number(process.env.TEST_PORT || 4709);
const base = `http://127.0.0.1:${port}/DoReGo/`;
const server = spawn(process.execPath, [vite, 'preview', '--mode', 'pages', '--outDir', 'dist-pages', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser();
  await verifyVoiceFeedback(browser, base);
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill('SIGTERM');
}
