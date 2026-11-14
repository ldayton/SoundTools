import {
  practiceOption,
  selectPractice,
  midiAction,
  openPracticeOptions,
  closePracticeOptions,
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
const port = process.env.TEST_PORT || "4357";
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
  await page.goto(base + "piano/keys?key=G&low=C4&high=B5&clef=grand");
  await page.locator("#notation svg").waitFor();
  assert.equal(
    await page.locator("#page-title").textContent(),
    "Find piano keys",
  );
  assert.equal(await page.locator("#key").inputValue(), "G");
  assert.equal(await page.locator("#staffLayout").inputValue(), "grand");
  await midiAction(page, "Connect MIDI keyboard");
  await page.locator(".keyboard-menu[data-state=connected]").waitFor();
  assert.equal(
    (await page.locator(".keyboard-menu").getAttribute("aria-expanded")) ===
      "true",
    false,
  );
  // Same connection object and port survive route changes.
  await selectPractice(page, "patterns");
  await page.locator(".pattern-count").waitFor();
  assert.equal(
    await page.locator(".keyboard-menu").getAttribute("data-state"),
    "connected",
  );
  await page.evaluate(() => (window as any).midiTest.send([0x90, 60, 100]));
  await page.evaluate(() => (window as any).midiTest.send([0x80, 60, 0]));
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 8");
  await selectPractice(page, "piano");
  await page.goBack();
  await page.locator(".pattern-count").waitFor();
  assert.equal(await page.locator(".pattern-count").textContent(), "2 / 8");
  await selectPractice(page, "sight");
  await practiceOption(page, "#hymn-arrangement", "bass");
  assert.match(page.url(), /\/piano\/hymns\/amazing-grace\?/);
  assert.equal(new URL(page.url()).searchParams.get("section"), null);
  await page.reload();
  await page.locator(".hymn-paper svg").first().waitFor();
  assert.equal(await page.locator("#hymn-section").count(), 0);
  assert.equal(await page.locator("#hymn-arrangement").inputValue(), "bass");
  // The initial canonical hymn URL replaces the category URL: Back must actually leave hymns.
  await selectPractice(page, "piano");
  await selectPractice(page, "sight");
  await page.locator("#hymn-search").waitFor({ state: "attached" });
  await page.goBack();
  await page.locator('nav a[data-mode="piano"][aria-current]').waitFor();
  // A question and its round position survive a trip to another exercise.
  await selectPractice(page, "staff");
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await page.locator('[data-letter="E"]').click();
  await page.waitForFunction(
    () => document.querySelector("#counter")?.textContent === "2 / 12",
  );
  const notation = await page.locator("#notation").getAttribute("aria-label");
  await page.evaluate(() => {
    (window as any).shellElements = {
      workspace: document.getElementById("exercise-content"),
      midi: document.getElementById("midi-panel"),
    };
  });

  await selectPractice(page, "signature");
  await selectPractice(page, "staff");
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  assert.equal(
    await page.locator("#notation").getAttribute("aria-label"),
    notation,
  );
  // Editing another activity's settings must not discard the suspended staff round.
  await selectPractice(page, "piano");
  await practiceOption(page, "#key", "F");
  await selectPractice(page, "staff");
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  assert.equal(
    await page.locator("#notation").getAttribute("aria-label"),
    notation,
  );
  // App-wide controls have a single home; visiting settings preserves the current question.
  assert.ok(await page.locator(".settings-page").isHidden());
  assert.ok(await page.locator("#offline-status").isHidden());
  await page.locator("a[data-settings]").click();
  assert.equal(new URL(page.url()).pathname, "/settings");
  assert.equal(await page.locator("#page-title").textContent(), "Settings");
  assert.ok(await page.locator("#exercise-content").isHidden());
  await page
    .getByRole("checkbox", { name: "Share diagnostic information" })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () =>
        (window as any).shellElements.workspace ===
          document.getElementById("exercise-content") &&
        (window as any).shellElements.midi ===
          document.getElementById("midi-panel") &&
        document.querySelectorAll("#midi-panel").length === 1,
    ),
    "navigation and React updates retain one workspace and one MIDI connection form",
  );
  await page.goBack();
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  await page.locator("a[data-settings]").click();
  await page.reload();
  await page.locator(".settings-page").waitFor();
  assert.equal(new URL(page.url()).pathname, "/settings");
  await selectPractice(page, "staff");
  // Keyboard-opened mobile navigation traps and restores focus with Mantine's defaults.
  await page.setViewportSize({ width: 390, height: 844 });
  const navTrigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await navTrigger.focus();
  await navTrigger.press("Enter");
  const drawer = page.getByRole("dialog");
  await drawer.waitFor();
  await page.screenshot({ path: `/tmp/notecards-shell-drawer-${engine}.png` });
  await page.keyboard.press("Tab");
  assert.ok(
    await drawer.evaluate((e) => e.contains(document.activeElement)),
    "drawer traps focus",
  );
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  assert.ok(
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .evaluate((e) => e === document.activeElement),
    "Escape returns focus to the navigation trigger",
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await drawer.waitFor();
  await page.setViewportSize({ width: 1280, height: 844 });
  await drawer.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => !document.body.hasAttribute("data-scroll-locked"),
    ),
    "resizing dismisses the drawer and releases scroll locking",
  );
  await page.setViewportSize({ width: 390, height: 844 });

  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await selectPractice(page, "rhythm");
  await page.locator(".rhythm-start").waitFor();
  await page.locator(".rhythm-start").click();
  await selectPractice(page, "piano");
  await selectPractice(page, "rhythm");
  assert.match((await page.locator(".rhythm-start").textContent())!, /Start/);
  for (const width of [320, 390, 760, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  // Options preserve their controls across collapse, resize and React header updates.
  await selectPractice(page, "piano");
  await openPracticeOptions(page);
  const optionsContent = page.locator(
    ".practice-options:visible .practice-options-content",
  );
  await page.evaluate(() => {
    (window as any).optionsField = document.getElementById("key");
  });
  await page
    .getByRole("button", { name: "Collapse practice options", exact: true })
    .click();
  const reopenOptions = page.getByRole("button", {
    name: "Expand practice options",
    exact: true,
  });
  await reopenOptions.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.id === "practice-options-reopen",
  );
  await reopenOptions.press("Enter");
  await optionsContent.waitFor();
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("options-toggle"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Expand practice options", exact: true })
    .waitFor();
  await openPracticeOptions(page);
  await page
    .getByRole("button", { name: "Collapse practice options", exact: true })
    .press("Enter");
  await page
    .locator(".practice-options:visible .practice-options-content")
    .waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page
    .getByRole("button", { name: "Collapse practice options", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => (window as any).optionsField === document.getElementById("key"),
    ),
    "options headers never replace the exercise's controls",
  );
  // Wide-screen options sit beside every exercise, with shared field dimensions and actions.
  for (const mode of ["piano", "staff", "patterns", "sight", "rhythm"]) {
    await selectPractice(page, mode);
    const options = page.locator(".practice-options:visible");
    await options.waitFor();
    await openPracticeOptions(page);
    const task = page.locator(".practice:visible,.sequence-practice:visible");
    const optionBox = (await options.boundingBox())!;
    const taskBox = (await task.boundingBox())!;
    assert.ok(
      optionBox.x >= taskBox.x + taskBox.width,
      `${mode}: options to the right of exercise`,
    );
    assert.ok(
      Math.abs(optionBox.y - taskBox.y) < 2,
      `${mode}: top edges align`,
    );
    const fields = await options
      .locator("select:visible,.pitch-picker-control:visible")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, right: box.right, height: box.height };
        }),
      );
    assert.ok(fields.length > 0);
    assert.ok(
      fields.every(
        (field) =>
          field.height > 0 &&
          field.x >= optionBox.x &&
          field.right <= optionBox.x + optionBox.width + 1,
      ),
      `${mode}: controls fit the options panel`,
    );
    if (mode === "patterns" || mode === "sight") {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await page
        .getByRole("button", { name: "Start again", exact: true })
        .click();
    }
    if (mode === "staff") {
      await practiceOption(page, "#low", "E2");
      await practiceOption(page, "#high", "E2");
      assert.equal(await page.locator("#staff-low-spin").inputValue(), "E2");
      await page.locator("#staff-high-spin").click();
      assert.equal(
        await page.locator("#staff-high-spin-picker [data-value]").count(),
        18,
      );
      await page
        .locator("#staff-high-spin-picker")
        .getByRole("button", { name: "A4", exact: true })
        .click();
      await page.locator("#staff-high-spin").click();
      await page.keyboard.press("Escape");
      await page
        .locator("#staff-high-spin-picker")
        .waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        "staff-high-spin",
        "Escape returns focus to the pitch field",
      );
      await page.locator("#staff-high-spin").click();
      await closePracticeOptions(page);
      await page
        .locator("#staff-high-spin-picker")
        .waitFor({ state: "hidden" });
      await openPracticeOptions(page);
      assert.equal(
        await page.locator("#staff-high-spin").getAttribute("aria-expanded"),
        "false",
        "collapsing options closes their overlay",
      );
    }
    if (mode === "rhythm") {
      await page.locator(".rhythm-start").click();
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      assert.match(
        (await page.locator(".sequence-feedback:visible").textContent())!,
        /Stopped/,
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Start", exact: true })
          .isVisible(),
      );
    }
  }
  // A complete React form controls the engine and restores its saved configuration.
  await practiceOption(page, "#rhythm-level", "eighths");
  await practiceOption(page, "#rhythm-tempo", "115");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await practiceOption(page, "#rhythm-tempo", "125");
  assert.ok(
    await page.getByRole("button", { name: "Start", exact: true }).isVisible(),
    "changing settings stops the active attempt",
  );
  await selectPractice(page, "piano");
  await selectPractice(page, "rhythm");
  await openPracticeOptions(page);
  assert.equal(await page.locator("#rhythm-level").inputValue(), "eighths");
  assert.equal(await page.locator("#rhythm-tempo").inputValue(), "125");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await openPracticeOptions(page);
  assert.equal(await page.locator("#rhythm-level").inputValue(), "eighths");
  assert.equal(await page.locator("#rhythm-tempo").inputValue(), "125");
  await page.setViewportSize({ width: 390, height: 844 });
  await openPracticeOptions(page);
  const rhythmSelect = page.getByRole("combobox", {
    name: "Rhythm",
    exact: true,
  });
  await rhythmSelect.focus();
  await rhythmSelect.press("Tab");
  assert.ok(
    await page
      .locator("#rhythm-tempo")
      .evaluate((element) => element === document.activeElement),
    "standard tab navigation moves from rhythm to tempo",
  );
  await rhythmSelect.selectOption("pulse");
  assert.equal(await rhythmSelect.inputValue(), "pulse");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Tempo", exact: true })
      .inputValue(),
    "125",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(base + "piano/not-a-real-page");
  await page.locator(".route-missing").waitFor();
  await page.locator(".route-missing a").click();
  await page.locator("#notation svg").waitFor();
  await page.goto(base + "piano/hymns/not-a-hymn");
  await page.locator(".route-missing").waitFor();
  // A cold, delayed module import must not take over a different active exercise.
  const lateContext = await browser.newContext({ serviceWorkers: "block" });
  const late = await lateContext.newPage();
  const lateErrors: string[] = [];
  late.on("pageerror", (e) => lateErrors.push(e.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await late.route(/\/assets\/patterns-[^/]+\.js$/, async (request) => {
    await gate;
    await request.continue();
  });
  await late.goto(base + "piano/keys");
  await late.locator("#notation svg").waitFor();
  await selectPractice(late, "patterns");
  await late.getByText("Loading practice…", { exact: true }).waitFor();
  await selectPractice(late, "rhythm");
  await late.getByRole("button", { name: "Start", exact: true }).click();
  release();
  await late.locator("#pattern-level").waitFor({ state: "attached" });
  assert.equal(
    await late.locator("#page-title").textContent(),
    "Rhythm reading",
  );
  assert.ok(
    await late.getByRole("button", { name: "Stop", exact: true }).isVisible(),
  );
  assert.ok(await late.locator("#patterns-practice").isHidden());
  assert.deepEqual(lateErrors, []);
  await lateContext.close();
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: deep links, history, MIDI continuity, retained questions, mobile navigation, paused rhythm and unknown routes passed.`,
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
