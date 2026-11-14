import { savedProgress } from "./persistence-helper";
import {
  practiceOption,
  openPracticeOptions,
  closePracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEYS } from "../../../packages/music-practice/src/model";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4321";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}/`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [
        vite,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        port,
        "--strictPort",
      ],
      { stdio: "ignore" },
    );
if (server) {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Preview server exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const fixed = await mkdtemp(join(tmpdir(), "notecards-cards-"));
let browser: Awaited<ReturnType<typeof type.launch>> | undefined;
try {
  browser = await type.launch({ env: { ...process.env, CFFIXED_USER_HOME: fixed } });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Math.random = () => 0;
    // Existing staff users retain their original mode and range.
    localStorage.setItem(
      "soundtools:notewise:v1",
      JSON.stringify({
        version: 2,
        settings: { low: "E3", high: "F4", key: "C" },
        stats: {},
      }),
    );
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  assert.equal(await page.locator("#notation svg").count(), 1);
  for (const [key, modifier] of [
    ["ArrowUp", "Sharp"],
    ["+", "Sharp"],
    ["=", "Sharp"],
    ["ArrowDown", "Flat"],
    ["-", "Flat"],
  ] as const) {
    await page.keyboard.press(key);
    assert.equal(
      await page
        .getByRole("button", { name: modifier, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  await page.keyboard.press("Escape");
  // Start in C major, then switch to G major and check its F-sharp.
  assert.equal(await page.locator("#key").inputValue(), "C");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("E");
  assert.match((await page.locator("#feedback").textContent())!, /That’s E/);
  await page.keyboard.press("E");
  assert.equal(
    await page.locator("#progress").getAttribute("aria-valuenow"),
    "1",
    "One answer per card",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#feedback")?.textContent === "Name this note.",
  );
  await openPracticeOptions(page);
  await practiceOption(page, "#key", "G");
  await page.locator('[data-letter="E"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#feedback")?.textContent === "Name this note.",
  );
  await page.getByRole("button", { name: "Flat", exact: true }).click();
  await page.locator('[data-letter="G"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F♯/);
  assert.equal(await page.locator(".vf-keysignature").count(), 1);
  await practiceOption(page, "#key", "C");
  // A one-note range checks completion without prescribing the scheduler order.
  await practiceOption(page, "#high", "E3");
  for (let i = 0; i < 12; i++) {
    await page.locator(`[data-letter="E"]:enabled`).waitFor();
    await page.locator(`[data-letter="E"]`).click();
    if (i < 11)
      await page.waitForFunction(
        () =>
          document.querySelector("#feedback")?.textContent ===
          "Name this note.",
      );
  }
  await page.locator("#continue").waitFor();
  assert.equal(await page.locator("#result").textContent(), "12 of 12 correct");
  await page.getByRole("button", { name: "Keep going" }).click();
  assert.equal(await page.locator("#progress").getAttribute("aria-valuenow"), "0");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  for (const b of await page.locator("[data-letter]").all()) {
    const box = await b.boundingBox();
    assert.ok(box && box.height >= 44);
  }
  await practiceOption(page, "#key", "G");
  await page.getByRole("button", { name: "Sharp", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Sharp", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Natural", exact: true }).click();
  await page.locator('[data-letter="E"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes/);
  await page.waitForFunction(
    () =>
      document.querySelector("#feedback")?.textContent === "Name this note.",
  );
  await closePracticeOptions(page);
  await mkdir("work", { recursive: true });
  await page.screenshot({ path: "work/notecards-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "work/notecards-desktop.png", fullPage: true });
  await openPracticeOptions(page);
  await practiceOption(page, "#low", "E2");
  await practiceOption(page, "#high", "E2");
  assert.equal(await page.locator("#staff-low-spin").inputValue(), "E2");
  assert.equal(await page.locator("#staff-high-spin").inputValue(), "E2");
  assert.equal(
    await page.locator("#staff-low-spin-picker [data-value]").count(),
    18,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-letter="E"]:enabled').waitFor();
  const bounds = await page.locator(".vf-stavenote rect").evaluate((rect) => {
    const top = Number(rect.getAttribute("y")),
      height = Number(rect.getAttribute("height"));
    return { top: top * 2.2, bottom: (top + height) * 2.2 };
  });
  assert.ok(
    bounds.top >= 0 && bounds.bottom <= 300,
    "Lowest ledger note remains inside the drawing: " + JSON.stringify(bounds),
  );
  await page.screenshot({
    path: "work/notecards-range-mobile.png",
    fullPage: true,
  });
  await page.locator('[data-letter="E"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — E/);
  for (const key of KEYS) {
    await practiceOption(page, "#key", key.id);
    assert.equal(await page.locator("#key").inputValue(), key.id);
    assert.equal(await page.locator(".vf-stavenote").count(), 1);
    assert.equal(
      await page.locator(".vf-accidental").count(),
      0,
      "Use the key signature, not explicit accidentals",
    );
  }
  await practiceOption(page, "#key", "Gb");
  await page.screenshot({
    path: "work/notecards-keys-mobile.png",
    fullPage: true,
  });
  const retained = await savedProgress(page);
  assert.ok(retained.stats["staff:E3:0"].attempts > 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: notation, desktop modifier-first input, enharmonics, answer guard, full session, continuation, mobile controls, saved progress and no page errors.",
  );
} finally {
  await browser?.close();
  await rm(fixed, { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
    // macOS may protect Firefox-created folders in the temporary home.
    if (!["EACCES", "EPERM"].includes(error.code || "")) throw error;
  });
  server?.kill();
}
