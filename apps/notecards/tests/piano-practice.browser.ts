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
  await page.locator("#mode").selectOption("patterns");
  await page.locator(".pattern-count").filter({ hasText: "1 / 4" }).waitFor();
  assert.equal(
    await page
      .locator(".pattern-paper .sight-current")
      .first()
      .evaluate((e) => getComputedStyle(e).fill),
    "rgb(176, 101, 62)",
  );
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
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
  assert.equal(await page.locator(".pattern-count").textContent(), "1 / 4");
  await off(61);
  for (const note of [60, 62, 64, 65]) await on(note);
  assert.equal(await page.locator(".pattern-count").textContent(), "Complete");
  for (const note of [60, 62, 64, 65]) await off(note);
  await page.locator(".pattern-next").click();
  await on(62);
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 4");
  await off(62);
  await page.locator("#pattern-hand").selectOption("left");
  assert.equal(await page.locator(".pattern-count").textContent(), "1 / 4");
  await page.locator("#mode").selectOption("sight");
  await page.locator("#hymn-arrangement").waitFor();
  await page.locator("#hymn-length").selectOption("2");
  for (const stage of ["melody", "bass", "chords", "broken", "original"]) {
    await page.locator("#hymn-arrangement").selectOption(stage);
    assert.ok((await page.locator(".hymn-paper .sight-current").count()) > 0);
    await page.locator(".hymn-next").click();
    assert.equal(await page.locator("#hymn-section").inputValue(), "1");
    await page.locator(".hymn-prev").click();
    assert.equal(await page.locator("#hymn-section").inputValue(), "0");
  }
  await page.locator("#hymn-arrangement").selectOption("bass");
  await page.locator("#hymn-section").selectOption("2");
  await page.reload();
  await page.locator("#hymn-arrangement").waitFor();
  assert.equal(await page.locator("#hymn-arrangement").inputValue(), "bass");
  assert.equal(await page.locator("#hymn-section").inputValue(), "2");
  await page.locator("#mode").selectOption("rhythm");
  await page.locator(".rhythm-start").waitFor();
  await page.clock.install();
  await page.locator("#rhythm-tempo").selectOption("120");
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
  await page.locator(".rhythm-start").click();
  assert.match(
    (await page.locator(".hymn-feedback:visible").textContent())!,
    /Count-in/,
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
    (await page.locator(".hymn-feedback:visible").textContent())!,
    /16 of 16 on the beat · 0 missed · 0 extra/,
  );
  await page.locator(".rhythm-start").click();
  await page.clock.runFor(500);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(20000);
  assert.match(
    (await page.locator(".hymn-feedback:visible").textContent())!,
    /Paused/,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  for (const mode of ["patterns", "rhythm", "sight"]) {
    await page.locator("#mode").selectOption(mode);
    await page.setViewportSize({ width: 320, height: 844 });
    if (mode === "patterns") await page.locator(".pattern-count").waitFor();
    if (mode === "rhythm") await page.locator(".rhythm-start").waitFor();
    if (mode === "sight") await page.locator("#hymn-arrangement").waitFor();
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
