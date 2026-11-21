import {
  captureFailure,
  closeBrowser,
  launchBrowser,
  newPage,
} from "../../../scripts/ci/browser-harness.cjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  openPracticeOptions,
  practiceOption,
  selectPractice,
} from "../../../packages/music-practice/browser-tests/helpers";

const engine = process.env.TEST_BROWSER || "chromium";
const server = await preview("notewise", Number(process.env.TEST_PORT || 4476));
const fixed = await mkdtemp(join(tmpdir(), "notewise-backing-"));
let browser;
try {
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const starts: { time: number; rate: number }[] = [];
    (window as any).backingStarts = starts;
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      when = 0,
      ...rest: number[]
    ) {
      starts.push({ time: when, rate: this.playbackRate.value });
      return originalStart.call(this, when, ...(rest as []));
    };
    const originalConnect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination) {
        const silence = this.context.createGain();
        silence.gain.value = 0;
        originalConnect.call(silence, this.context.destination);
        return originalConnect.call(this, silence);
      }
      return originalConnect.apply(this, args as any);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(server.base + "/guitar/scales?key=A&scale=minor");
  const group = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await openPracticeOptions(page);
  await group.waitFor();
  assert.equal(
    await group.locator("select").count(),
    1,
    "only genre has a selector; the exercise key stays inherited",
  );
  assert.equal(await group.locator("[data-backing-key]").textContent(), "A");
  assert.deepEqual(
    await group
      .getByRole("combobox", { name: "Backing style", exact: true })
      .locator("option")
      .allTextContents(),
    [
      "Shuffle Blues",
      "Roots Rock",
      "Country",
      "Reggae",
      "Pocket Funk",
      "Mellow Soul",
      "Folk",
      "Traditional Gospel",
    ],
  );
  await group
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("rock");
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .fill("180");
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .press("Enter");
  await group
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".backing-track-settings")
        ?.getAttribute("data-status") === "playing",
    undefined,
    { timeout: 30000 },
  );
  await page.waitForFunction(() => (window as any).backingStarts.length > 8);
  assert.ok(
    await page.evaluate(() => (window as any).backingStarts.length > 8),
  );
  await group
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  const pausedCount = await page.evaluate(
    () => (window as any).backingStarts.length,
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => (window as any).backingStarts.length),
    pausedCount,
  );
  await practiceOption(page, "#scale-key", "0");
  assert.equal(await group.locator("[data-backing-key]").textContent(), "C");
  await group
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await page.waitForFunction(
    (offset) => (window as any).backingStarts.length > offset,
    pausedCount,
  );
  const rates = await page.evaluate(
    (offset) =>
      (window as any).backingStarts.slice(offset).map((s: any) => s.rate),
    pausedCount,
  );
  assert.ok(
    rates.length > 0 &&
      rates.every((r: number) => r >= 2 ** (-1 / 12) && r <= 2 ** (1 / 12)),
    "native-pitch recordings avoid broad resampling",
  );
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .fill("160");
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .press("Enter");
  assert.equal(await group.getAttribute("data-status"), "playing");
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .fill("180");
  await group
    .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
    .press("Enter");
  await group
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("blues");
  await group
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("rock");
  // The loop-boundary regression lives in backing-metronome.browser.ts:
  // it seeks near the real boundary, verifies the next scheduler cycle and
  // renders PCM through the seam. Do not duplicate it with an 87-second wait.
  await page.waitForFunction(
    () => document.querySelector(".backing-track-settings")?.getAttribute("data-status") === "playing",
    undefined,
    { timeout: 30000 },
  );
  await selectPractice(page, "staff");
  const leftCount = await page.evaluate(
    () => (window as any).backingStarts.length,
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => (window as any).backingStarts.length),
    leftCount,
    "leaving stops playback",
  );
  await page.goto(server.base + "/guitar/scales?key=E&scale=major");
  await openPracticeOptions(page);
  assert.equal(
    await group
      .getByRole("combobox", { name: "Backing style", exact: true })
      .inputValue(),
    "rock",
  );
  assert.equal(
    await group
      .getByRole("spinbutton", { name: "Backing tempo in beats per minute" })
      .inputValue(),
    "180",
  );
  assert.equal(
    await group.getAttribute("data-status"),
    "ready",
    "reload never autoplays",
  );
  assert.equal(await group.locator("[data-backing-key]").textContent(), "E");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await openPracticeOptions(page);
    assert.ok(await group.isVisible());
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.screenshot({
    path:
      process.env.BACKING_SCREENSHOT ||
      new URL(`../work/backing-track-mobile-${engine}.png`, import.meta.url)
        .pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPracticeOptions(page);
  await page.screenshot({
    path: new URL(
      `../work/backing-track-desktop-${engine}.png`,
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Backing tracks: real sample decoding/playback, pause, key/tempo/style, navigation, persistence and responsive layouts passed",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can retain protected Documents folders in a browser's temporary home.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
