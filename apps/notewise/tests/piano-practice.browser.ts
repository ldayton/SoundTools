import { waitForServer, captureFailure, closeBrowser, launchBrowser, createContext } from '../../../scripts/ci/browser-harness.cjs';
import {
  practiceOption,
  openPracticeOptions,
  selectPractice,
  midiAction,
} from "../../../packages/music-practice/browser-tests/helpers";
import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4350";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}/`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
const fixed = await mkdtemp(join(tmpdir(), "notecards-practice-"));
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await createContext(browser, {
    viewport: { width: 1100, height: 1000 },
  });
  await context.addInitScript({
    content: await readFile(
      new URL(
        "../../../packages/music-practice/test-fixtures/midi.js",
        import.meta.url,
      ),
      "utf8",
    ),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await selectPractice(page, "patterns");
  await page.locator(".pattern-count").filter({ hasText: "1 / 8" }).waitFor();
  assert.equal(
    await page
      .locator(".pattern-paper .sight-current")
      .first()
      .evaluate((e) => getComputedStyle(e).fill),
    "rgb(176, 101, 62)",
  );
  // This phase uses real time; runFor would install fake timers mid-connection.
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  const on = (note: number) =>
    page.evaluate(
      (note) => (window as any).midiTest.send([0x90, note, 100]),
      note,
    );
  const off = (note: number) =>
    page.evaluate(
      (note) => (window as any).midiTest.send([0x80, note, 0]),
      note,
    );
  await on(61);
  assert.equal(await page.locator(".pattern-count").textContent(), "1 / 8");
  await off(61);
  for (const note of [60, 62, 64, 65, 67, 65, 64, 62]) {
    await on(note);
    await off(note);
  }
  assert.equal(await page.locator(".pattern-count").textContent(), "Complete");
  for (const note of [60, 62, 64, 65]) await off(note);
  await page.locator(".pattern-count").filter({ hasText: "1 / 8" }).waitFor();
  await on(62);
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 8");
  await off(62);
  await practiceOption(page, "#pattern-hand", "left");
  assert.equal(await page.locator(".pattern-count").textContent(), "1 / 8");
  await page.reload();
  await page.locator(".pattern-count").filter({ hasText: "1 / 8" }).waitFor();
  assert.equal(
    await page.locator("main").evaluate((e) => (e as HTMLElement).inert),
    false,
  );
  await openPracticeOptions(page);
  assert.equal(await page.locator("#pattern-hand").inputValue(), "left");
  // The React form applies all settings to notation and MIDI matching, retaining a partial attempt.
  await practiceOption(page, "#pattern-level", "leaps");
  await practiceOption(page, "#pattern-key", "D");
  await midiAction(page, "Connect MIDI keyboard");
  await on(50); // D3: the left-hand tonic in the newly selected key.
  await off(50);
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 8");
  await selectPractice(page, "piano");
  await selectPractice(page, "patterns");
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 8");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator(".pattern-count").filter({ hasText: "2 / 8" }).waitFor();
  await openPracticeOptions(page);
  for (const [field, value] of [
    ["hand", "left"],
    ["key", "D"],
    ["level", "leaps"],
  ]) {
    assert.equal(await page.locator(`#pattern-${field}`).inputValue(), value);
  }
  await page.setViewportSize({width:320,height:844});
  await page.locator(".pattern-count").waitFor();
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: interval MIDI/persistence and mobile layouts passed.`,
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code !== "EACCES" && e.code !== "EPERM") throw e;
    },
  );
}
