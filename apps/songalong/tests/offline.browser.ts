import {
  captureFailure,
  closeBrowser,
  launchBrowser,
  createOfflineContext as createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const engine = process.env.TEST_BROWSER || "chromium";
const home = await mkdtemp(join(tmpdir(), "songalong-offline-"));
const browser = await launchBrowser({
  env: { ...process.env, CFFIXED_USER_HOME: home },
});
const server = await preview("songalong", 4422);
try {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto(
    server.base +
      "/piano/hymns/amazing-grace?arrangement=bass&view=both&hands=left",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
    {},
    { timeout: 60000 },
  );
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  assert.ok(
    await page.evaluate(async () =>
      (await caches.keys()).some((k) => k.startsWith("songalong-shell-")),
    ),
  );
  await context.setOffline(true);
  await page.goto(
    server.base +
      "/piano/hymns/amazing-grace?arrangement=bass&view=both&hands=left",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  await page.reload();
  await page.locator(".hymn-paper svg").first().waitFor();
  assert.equal(await page.locator("#hymn-hands").inputValue(), "left");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Share diagnostic information", { exact: true })
    .waitFor();
  // Both instrument banks must decode and sound from the verified cache after a cold navigation.
  await page.addInitScript(() => {
    (window as any).offlineInstrumentStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      if (this.buffer && this.buffer.duration > 2)
        (window as any).offlineInstrumentStarts++;
      return start.apply(this, args);
    };
  });
  for (const arrangement of ["piano", "guitar-edition"]) {
    await page.goto(
      server.base +
        `/piano/hymns/amazing-grace?mode=playback&arrangement=${arrangement}&tempo=100`,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => (window as any).offlineInstrumentStarts > 0,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  }
  console.log(
    `${engine}: SongAlong verified cache, offline hymn deep link, reload, hand settings, settings page and both instrument voices pass`,
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
  await rm(home, { recursive: true, force: true }).catch((e) => {
    if (!["EACCES", "EPERM"].includes(e.code)) throw e;
  });
}
