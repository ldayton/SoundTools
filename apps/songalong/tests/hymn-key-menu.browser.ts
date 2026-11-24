import { expect } from "@playwright/test";
import { selectedHymnRange } from "../../../packages/music-practice/browser-tests/helpers";
import {
  playbackHymn,
  playbackSourceKey,
  playbackFittedKey,
  playbackRangeLabel,
} from "../../../packages/music-practice/test-fixtures/hymns";
import { hymnRangeKeys } from "../../../packages/music-practice/src/hymn-range";
import { hymnKeyLabel } from "../../../packages/music-practice/src/hymn-transpose";
const lowRange = hymnRangeKeys(
  playbackSourceKey,
  { low: 62, high: 74 },
  38,
  91,
).choices.find((choice) => choice.key === "B")!.range;
import {
  waitForServer,
  captureFailure,
  closeBrowser,
  launchBrowser,
  createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import {
  hymnKeyOptions,
  openPracticeOptions,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";
const require = createRequire(import.meta.url);
const {
  macBookAir13,
  iphone14Pro,
} = require("../../../scripts/test-devices.cjs");
const engine = process.env.TEST_BROWSER || "chromium";
const port =
  process.env.TEST_PORT ||
  ({ chromium: "4386", firefox: "4387", webkit: "4388" }[engine] ?? "4386");
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}`;
const vite = require
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
let browser;
const home = await mkdtemp(join(tmpdir(), "songalong-key-menu-"));
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  for (const [device, profile] of Object.entries({
    macBookAir13,
    iphone14Pro,
  })) {
    const context = await createContext(browser, {
      ...(profile as object),
      ...(engine === "firefox" ? { isMobile: false } : {}),
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      base + `/piano/hymns/${playbackHymn.slug}?key=B&low=38&high=91`,
    );
    await openPracticeOptions(page);
    const field = page.locator("#hymn-key");
    await expect(field).toHaveValue(`B major (${lowRange})`);
    let options = await hymnKeyOptions(page);
    assert.equal(options.length, 12);
    assert(options.every((option) => option.range && !option.disabled));
    assert.equal(
      options.find((option) => option.value === "B")!.range,
      lowRange,
    );
    for (const option of options) {
      await practiceOption(page, "#hymn-key", option.value!);
      assert.equal(
        await selectedHymnRange(page),
        option.range,
        "Preview matches the chosen octave",
      );
      assert(
        (await field.inputValue()).endsWith(`(${option.range})`),
        "Selected label includes the chosen note range",
      );
    }
    await page.locator("#hymn-octave-up").click();
    await practiceOption(page, "#hymn-key", "B");
    assert.equal(
      await selectedHymnRange(page),
      lowRange,
      "Reselecting a key uses its previewed lowest octave",
    );

    await practiceOption(page, "#hymn-low", "60");
    await practiceOption(page, "#hymn-high", "72");
    options = await hymnKeyOptions(page);
    assert.deepEqual(
      options
        .filter((option) => !option.disabled)
        .map((option) => option.value),
      [playbackFittedKey],
    );
    assert.equal(
      options.find((option) => option.value === "original")!.range,
      playbackRangeLabel("original"),
    );
    assert.equal(
      options.find((option) => option.value === playbackFittedKey)!.range,
      "C4–C5",
    );
    await field.click();
    const menu = page.getByRole("listbox", { name: "Key", exact: true });
    const excluded = menu.locator('[role="option"][value="original"]');
    assert.equal(await excluded.getAttribute("aria-disabled"), "true");
    assert(await excluded.locator(".hymn-key-option-range").isVisible());
    assert.equal(
      await excluded
        .locator(".hymn-key-option-range")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(134, 142, 150)",
    );
    await page.screenshot({
      path: `work/hymn-key-menu-${device}-${engine}.png`,
    });
    const box = (await menu.boundingBox())!;
    assert(
      box.x >= 0 && box.x + box.width <= profile.viewport.width + 1,
      "Menu fits the device width",
    );
    await field.press("ArrowDown");
    await field.press("Enter");
    assert.equal(
      await field.inputValue(),
      `${hymnKeyLabel(playbackFittedKey)} (${playbackRangeLabel(playbackFittedKey)})`,
      "Keyboard skips excluded keys",
    );

    const group = page.getByRole("region", {
      name: "Key & range",
      exact: true,
    });
    assert.equal(await group.locator("#hymn-key").count(), 1);
    assert.equal(await group.locator("#hymn-low").count(), 1);
    assert.equal(await group.locator("#hymn-high").count(), 1);
    assert.equal(await group.locator("#hymn-octave-up").count(), 1);
    await practiceOption(page, "#hymn-high", "60");
    options = await hymnKeyOptions(page);
    assert.equal(options.length, 12);
    assert(
      options.every((option) => option.disabled && option.range),
      "All excluded keys still show ranges",
    );
    assert.equal(await field.inputValue(), "");
    assert.equal(await field.getAttribute("placeholder"), "No matching key");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `${engine} ${device}: menu ranges, disabled entries, lowest octaves, selected labels with ranges and grouped controls passed`,
    );
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server?.kill();
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
