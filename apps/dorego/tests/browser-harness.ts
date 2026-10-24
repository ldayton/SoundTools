import { chromium, firefox, webkit, type Browser, type LaunchOptions } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const browserName = process.env.TEST_BROWSER || 'chromium';
const engines = { chromium, firefox, webkit };
if (!(browserName in engines)) throw new Error(`Unknown TEST_BROWSER: ${browserName}`);
export async function launchTestBrowser(options: LaunchOptions = {}): Promise<Browser> {
  // Firefox 157 shares the installed browser's protected app-data root on macOS 27.
  // Give only the test process its own state root; no user permissions or profile changes.
  // https://github.com/microsoft/playwright/issues/42768
  const stateDir =
    browserName === 'firefox' && process.platform === 'darwin'
      ? await mkdtemp(join(tmpdir(), 'dorego-firefox-state-'))
      : undefined;
  try {
    const browser = await engines[browserName as keyof typeof engines].launch({
      headless: process.env.HEADED !== '1',
      ...options,
      ...(stateDir ? { env: { ...process.env, ...options.env, CFFIXED_USER_HOME: stateDir } } : {}),
    });
    if (stateDir)
      browser.on('disconnected', () => {
        void rm(stateDir, { recursive: true, force: true }).catch(() => {});
      });
    return browser;
  } catch (error) {
    if (stateDir) await rm(stateDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
