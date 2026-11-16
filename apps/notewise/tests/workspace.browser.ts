import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import {
  selectPractice,
  openPracticeOptions,
  closePracticeOptions,
  setPianoVisible,
  midiAction,
} from "../../../packages/music-practice/browser-tests/helpers";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4458";
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
const fixed = await mkdtemp(join(tmpdir(), "notewise-workspace-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server?.exitCode != null) throw Error("Preview exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await type.launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: "block",
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
  await page.goto(base + "guitar/staff?low=E3&high=E3&key=C");
  await page.locator("#notation svg").waitFor();
  assert.equal(
    await page.locator("main #page-title").textContent(),
    "Read staff notes",
  );
  assert.equal(await page.locator("header #page-title").count(), 0);
  assert.equal(await page.locator("header #restart-round").count(), 1);
  assert.equal(
    await page.locator("#exercise-content #restart-round").count(),
    0,
  );
  assert.equal(await page.locator("#progress").count(), 0);
  await page.keyboard.press("E");
  await page.waitForFunction(
    () =>
      document.querySelector("#counter")?.getAttribute("data-answered") === "1",
  );
  const modes = [
    "patterns",
    "scales",
    "intervals",
    "rhythm",
    "guitar-scales",
    "piano",
    "name",
    "find",
    "staff-find",
    "tab",
    "signature",
    "staff",
  ];
  for (const mode of modes) {
    await selectPractice(page, mode);
    await page.waitForFunction(
      () =>
        document.querySelector("#saved")?.textContent ===
        "Saved on this device.",
    );
    await page.locator("#exercise-content .practice-surface:visible").waitFor();
    const expected = [
      "patterns",
      "scales",
      "intervals",
      "rhythm",
      "guitar-scales",
    ].includes(mode)
      ? (
          {
            patterns: "patterns-practice",
            scales: "scales-practice",
            intervals: "intervals-practice",
            rhythm: "rhythm-practice",
            "guitar-scales": "guitar-scales-practice",
          } as Record<string, string>
        )[mode]
      : "flashcards";
    const hosts = await page
      .locator("header [data-activity-toolbar]")
      .evaluateAll((es) =>
        es.map((e) => (e as HTMLElement).dataset.activityToolbar),
      );
    assert.deepEqual(hosts, [expected], `Only ${mode}'s toolbar is attached`);
    assert.equal(
      await page.locator("header #piano-volume").count(),
      0,
      "Volume slider opens on request",
    );
    assert.equal(
      await page.getByRole("button", { name: "Volume", exact: true }).count(),
      1,
    );
    assert.equal(
      await page.locator("#exercise-content .sequence-transport").count(),
      0,
    );
  }
  // Required answer keys cannot disappear with the optional reference preference.
  await selectPractice(page, "patterns");
  await setPianoVisible(page, false);
  await selectPractice(page, "piano");
  await page.locator("#piano .white-key").first().waitFor();
  const keyWidth = await page
    .locator("#piano .white-key")
    .first()
    .evaluate((e) => e.getBoundingClientRect().width);
  assert.equal(keyWidth, 32);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#piano .piano-octave").nth(1).waitFor();
  assert.equal(
    await page
      .locator("#piano .white-key")
      .first()
      .evaluate((e) => e.getBoundingClientRect().width),
    keyWidth,
  );
  await selectPractice(page, "staff");
  const counter = await page.locator("#counter").getAttribute("data-answered");
  const before = await page.getByRole("banner").boundingBox();
  await openPracticeOptions(page);
  await page
    .getByRole("dialog", { name: "Practice options", exact: true })
    .waitFor();
  await page.keyboard.press("E");
  assert.equal(
    await page.locator("#counter").getAttribute("data-answered"),
    counter,
    "Options block answers",
  );
  const low = page.locator("#staff-low-spin");
  await low.press("Enter");
  const picker = page.locator("#staff-low-spin-picker");
  await page.waitForFunction(
    () => !!document.activeElement?.closest("#staff-low-spin-picker"),
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(
      () => !!document.activeElement?.closest("#staff-low-spin-picker"),
    ),
    "Tab stays in the nested picker",
  );
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("dialog", { name: "Practice options", exact: true })
      .isVisible(),
    true,
    "Escape closes the picker, preserving the options drawer",
  );
  await closePracticeOptions(page);
  assert.deepEqual(
    await page.getByRole("banner").boundingBox(),
    before,
    "Options never move the toolbar",
  );
  for (const [mode, title] of [
    ["scales", "Scales & degrees"],
    ["rhythm", "Rhythm reading"],
    ["guitar-scales", "Scales"],
  ]) {
    await selectPractice(page, mode);
    await page.locator("main #page-title").filter({ hasText: title }).waitFor();
    assert.equal(
      await page
        .getByRole("dialog", { name: "Practice options", exact: true })
        .isVisible(),
      false,
    );
    if (mode === "scales") {
      await openPracticeOptions(page);
      await page
        .locator("#scales-option-keys")
        .getByRole("checkbox")
        .first()
        .waitFor();
      assert.equal(
        await page.getByRole("button", { name: /^Keys ·/ }).count(),
        0,
      );
      await closePracticeOptions(page);
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${mode} fits on mobile`,
    );
  }
  await selectPractice(page, "rhythm");
  for (const width of [320, 390, 768, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    const fields = await page
      .locator(".notewise-header :is(button,input):visible")
      .evaluateAll((es) =>
        es.map((e) => ({
          left: e.getBoundingClientRect().left,
          right: e.getBoundingClientRect().right,
        })),
      );
    assert.ok(
      fields.every((b) => b.left >= 0 && b.right <= width),
      `Toolbar fits at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const tempo = page.locator("header #rhythm-tempo");
  await tempo.fill("96");
  await tempo.press("Enter");
  await page.locator("header .rhythm-start").click();
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await selectPractice(page, "patterns");
  await setPianoVisible(page, true);
  await midiAction(page, "Connect MIDI keyboard");
  await page.locator(".keyboard-menu[data-state=connected]").waitFor();
  await page
    .locator(".mantine-Drawer-content:visible")
    .waitFor({ state: "hidden" });
  await page.evaluate(() => (window as any).midiTest.send([0x90, 60, 100]));
  await page.locator('.pattern-piano [data-piano="60"].is-held').waitFor();
  await page.evaluate(() => (window as any).midiTest.send([0x80, 60, 0]));
  await page
    .locator('.pattern-piano [data-piano="60"].is-held')
    .waitFor({ state: "hidden" });
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/workspace-${engine}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.screenshot({
    path: `work/workspace-${engine}-desktop.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: every module, toolbar ownership, counter, modal input gating, fixed keys, MIDI animation, tempo and mobile layout passed.`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch((error) => {
    // macOS may protect Firefox's synthetic home Downloads directory.
    if (error.code !== "EACCES") throw error;
  });
}
