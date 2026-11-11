import {
  practiceOption,
  selectPractice,
  midiAction,
} from "./navigation-helpers";
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
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await type.launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await context.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
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
  await selectPractice(page, "sight");
  await page.locator("#hymn-arrangement").waitFor({ state: "attached" });
  await practiceOption(page, "#hymn-length", "2");
  for (const stage of ["melody", "bass", "chords", "broken", "original"]) {
    await practiceOption(page, "#hymn-arrangement", stage);
    assert.ok((await page.locator(".hymn-paper .sight-current").count()) > 0);
    await page.locator(".hymn-next").click();
    assert.equal(await page.locator("#hymn-section").inputValue(), "1");
    await page.locator(".hymn-prev").click();
    assert.equal(await page.locator("#hymn-section").inputValue(), "0");
  }
  await practiceOption(page, "#hymn-arrangement", "bass");
  await practiceOption(page, "#hymn-section", "2");
  await page.reload();
  await page.locator("#hymn-arrangement").waitFor({ state: "attached" });
  assert.equal(await page.locator("#hymn-arrangement").inputValue(), "bass");
  assert.equal(await page.locator("#hymn-section").inputValue(), "2");
  await selectPractice(page, "rhythm");
  await page.locator(".rhythm-start").waitFor();
  const tap = page.locator(".rhythm-tap");
  await tap.click();
  assert.equal(
    await page.locator(".rhythm-tap-response").textContent(),
    "Press Start",
  );
  assert.equal(
    await tap.evaluate((e) => getComputedStyle(e).userSelect),
    "none",
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    const widths = await page
      .locator(".rhythm-bar svg")
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().width));
    assert.equal(widths.length, 4);
    assert.ok(
      widths.every((w) => Math.abs(w - widths[0]) < 1),
      `equal bar widths at ${width}px: ${widths}`,
    );
    const above =
      (await tap.boundingBox())!.y -
      ((await page.locator("#rhythm-practice .sequence-score").boundingBox())!
        .y +
        (await page.locator("#rhythm-practice .sequence-score").boundingBox())!
          .height);
    const below =
      (await page
        .locator("#rhythm-practice .sequence-transport")
        .boundingBox())!.y -
      ((await tap.boundingBox())!.y + (await tap.boundingBox())!.height);
    assert.ok(Math.abs(above - below) < 1, "tap spacing is balanced");
  }
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await practiceOption(page, "#rhythm-tempo", "120");
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  await page.locator(".rhythm-start").click();
  assert.match(
    (await page.locator(".sequence-feedback:visible").textContent())!,
    /Count-in/,
  );
  await tap.click();
  assert.equal(
    await page.locator(".rhythm-tap-response").textContent(),
    "Wait…",
  );
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.clock.runFor(4000);
  for (let i = 0; i < 16; i++) {
    await on(60);
    await off(60);
    await page.clock.runFor(500);
  }
  await page.clock.runFor(250);
  assert.match(
    (await page.locator(".sequence-feedback:visible").textContent())!,
    /16 of 16 on the beat · 0 missed · 0 extra/,
  );
  await page.locator(".rhythm-start").click();
  await page.clock.runFor(500);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(20000);
  assert.match(
    (await page.locator(".sequence-feedback:visible").textContent())!,
    /Stopped/,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (const mode of ["patterns", "rhythm", "sight"]) {
    await selectPractice(page, mode);
    await page.setViewportSize({ width: 320, height: 844 });
    if (mode === "patterns") await page.locator(".pattern-count").waitFor();
    if (mode === "rhythm") await page.locator(".rhythm-start").waitFor();
    if (mode === "sight")
      await page.locator("#hymn-arrangement").waitFor({ state: "attached" });
    await page.clock.runFor(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: interval MIDI, hymn stages/sections/persistence, rhythm timing/count-in/interruption and mobile layouts passed.`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code !== "EACCES" && e.code !== "EPERM") throw e;
    },
  );
}
