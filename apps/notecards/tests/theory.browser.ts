import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import {
  selectPractice,
  openPracticeOptions,
  midiAction,
} from "./navigation-helpers";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4365",
  base = `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const fixed = await mkdtemp(join(tmpdir(), "notecards-theory-"));
let browser;
try {
  browser = await type.launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    serviceWorkers: "block",
  });
  await context.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.goto(base + "/theory/scales");
  const root = () =>
    page.locator("#scales-practice:visible,#intervals-practice:visible");
  const field = async (id: string, value: string) => {
    await openPracticeOptions(page);
    await root().locator(`[data-field="${id}"]`).selectOption(value);
  };
  const next = async () => {
    const button = root().locator(".theory-next");
    if (await button.isVisible()) await button.click();
    else await page.clock.runFor(1000);
  };
  const send = async (n: number) => {
    await page.evaluate((n) => {
      (window as any).midiTest.send([0x90, n, 100]);
      (window as any).midiTest.send([0x80, n, 0]);
    }, n);
  };
  await root().locator(".abcjs-note").first().waitFor();
  assert.deepEqual(
    await root().locator(".theory-answers button").allTextContents(),
    ["1", "3", "5"],
  );
  await root()
    .locator(".theory-answers")
    .getByRole("button", { name: "1", exact: true })
    .click();
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /C is degree 1/,
  );
  assert.equal(
    await root().locator(".theory-count").textContent(),
    "1 / 12",
    "feedback retains the answered question number",
  );
  assert.ok(
    await root().locator(".theory-next").isHidden(),
    "correct answers need no Next click",
  );
  await page.clock.runFor(599);
  assert.equal(await root().locator(".theory-count").textContent(), "1 / 12");
  await page.clock.runFor(1);
  assert.equal(
    await root().locator(".theory-count").textContent(),
    "2 / 12",
    "correct answer advances automatically",
  );
  await page.locator("#page-title").focus();
  await page.keyboard.press("3");
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Correct/,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(1000);
  assert.ok(
    await root().locator(".theory-next").isVisible(),
    "interruption leaves feedback for manual continuation",
  );
  assert.equal(await root().locator(".theory-count").textContent(), "2 / 12");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await next();
  await root()
    .locator(".theory-answers")
    .getByRole("button", { name: "5", exact: true })
    .click();
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /C is degree 1/,
  );
  await page.clock.runFor(1500);
  assert.ok(
    await root().locator(".theory-next").isVisible(),
    "mistakes do not auto-advance",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await root().locator(".theory-next").waitFor();
  assert.equal(
    await root().locator(".theory-progress").getAttribute("value"),
    "3",
  );
  for (let i = 3; i < 12; i++) {
    await next();
    await root()
      .locator(".theory-answers")
      .getByRole("button", { name: "1", exact: true })
      .click();
  }
  await next();
  assert.ok(await root().locator(".theory-summary").isVisible());
  await root().locator(".theory-continue").click();
  assert.equal(
    await root().locator(".theory-progress").getAttribute("value"),
    "0",
  );
  await field("task", "play-degree");
  await midiAction(page, "Connect MIDI keyboard", () => page.clock.runFor(250));
  await send(48); // Same pitch class, a different octave.
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Correct/,
  );
  await field("task", "build-scale");
  await page.clock.runFor(1000);
  assert.equal(
    await root().locator(".theory-progress").getAttribute("value"),
    "0",
    "old task timer cannot advance a new task",
  );
  await root().locator('[data-piano="61"]').click();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-piano"),
    ),
    "61",
    "wrong-note correction retains piano focus",
  );
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Try C4/,
  );
  await root().locator('[data-piano="60"]').click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-piano"),
    ),
    "62",
    "scale steps retain piano focus",
  );
  await send(64);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.clock.runFor(100);
  assert.equal(
    await root().locator('[data-piano="65"]').getAttribute("aria-disabled"),
    "false",
    "resize preserves input availability after note feedback",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await root().locator(".theory-steps .is-done").first().waitFor();
  assert.equal(
    await root().locator(".theory-steps .is-done").count(),
    3,
    "partial scale restored",
  );
  await midiAction(page, "Connect MIDI keyboard", () => page.clock.runFor(250));
  for (const n of [65, 67, 69, 71, 72]) await send(n);
  assert.equal(
    await root().locator(".theory-progress").getAttribute("value"),
    "1",
  );
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /C–D–E–F–G–A–B–C/,
  );
  await field("direction", "down");
  for (const n of [72, 71, 69, 67, 65, 64, 62, 60]) await send(n);
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Correct/,
  );
  await field("mode", "minor");
  for (const n of [81, 79, 77, 76, 74, 72, 71, 69]) await send(n);
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /A natural minor/,
  );
  await selectPractice(page, "intervals");
  await root().locator(".abcjs-note").first().waitFor();
  assert.deepEqual(
    await root().locator(".theory-answers button").allTextContents(),
    ["2nd", "3rd"],
  );
  await root()
    .locator(".theory-answers")
    .getByRole("button", { name: "2nd", exact: true })
    .click();
  await next();
  await root()
    .locator(".theory-answers")
    .getByRole("button", { name: "3rd", exact: true })
    .click();
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /C–D–E/,
  );
  assert.equal(
    await root()
      .getByRole("group", { name: "Intervals", exact: true })
      .getByRole("checkbox", { name: "1st", exact: true })
      .count(),
    0,
    "no unison practice option",
  );
  await field("task", "name-quality");
  await root()
    .locator(".theory-answers")
    .getByRole("button", { name: "major 3rd", exact: true })
    .click();
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Correct/,
  );
  await next();
  assert.ok(
    await root()
      .locator(".theory-answers")
      .getByRole("button", { name: "minor 3rd", exact: true })
      .isVisible(),
  );
  await page.locator("#page-title").focus();
  await page.keyboard.press("m");
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Correct/,
  );
  await next();
  await field("presentation", "together");
  assert.equal(
    await root().locator(".theory-notation .abcjs-notehead").count(),
    2,
  );
  assert.ok(
    await root().locator(".theory-direction").isHidden(),
    "simultaneous notes have no direction control",
  );
  await field("task", "build-interval");
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /In C major/,
  );
  await send(60);
  assert.ok(
    (await root().locator(".theory-walk .abcjs-note").count()) >= 2,
    "mistakes show counted staff positions",
  );
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /Try D4/,
  );
  await send(62);
  assert.match(
    (await root().locator(".theory-explanation").textContent())!,
    /C–D/,
  );
  await openPracticeOptions(page);
  await root().locator("#intervals-low").click();
  await page
    .locator("#intervals-low-picker")
    .getByRole("button", { name: "C4", exact: true })
    .click();
  await root().locator("#intervals-high").click();
  await page
    .locator("#intervals-high-picker")
    .getByRole("button", { name: "C4", exact: true })
    .click();
  assert.match(
    (await root().locator(".sequence-feedback").textContent())!,
    /No questions/,
  );
  await root().locator("#intervals-high").click();
  await page
    .locator("#intervals-high-picker")
    .getByRole("button", { name: "B5", exact: true })
    .click();
  await selectPractice(page, "scales");
  await field("task", "name-degree");
  assert.equal(
    await root().locator(".theory-progress").getAttribute("value"),
    "0",
    "independent task checkpoint",
  );
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openPracticeOptions(page);
    await page.clock.runFor(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `no overflow at ${width}`,
    );
    const task = (await root().locator(".sequence-practice").boundingBox())!,
      options = (await root().locator(".practice-options").boundingBox())!;
    if (width >= 1120)
      assert.ok(options.x >= task.x + task.width, "right sidebar");
  }
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/theory-${engine}-desktop.png`,
    fullPage: true,
  });
  const pack = JSON.parse(
    await readFile(
      new URL("../dist/offline-pack.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(
    pack.files.some((f: { url: string }) => /\/theory-[^/]+\.js$/.test(f.url)),
    "theory module included offline",
  );
  // Standard controls preserve nonempty sets, relative-key labels and each task's settings.
  await page.clock.resume();
  await root()
    .getByRole("button", { name: /^Keys ·/ })
    .click();
  const keys = root().getByRole("group", { name: "Keys", exact: true });
  await keys.getByRole("checkbox", { name: "G major", exact: true }).check();
  await keys.getByRole("checkbox", { name: "C major", exact: true }).uncheck();
  assert.ok(
    await keys
      .getByRole("checkbox", { name: "G major", exact: true })
      .isDisabled(),
  );
  await field("mode", "minor");
  assert.ok(
    await keys
      .getByRole("checkbox", { name: "E minor", exact: true })
      .isChecked(),
  );
  const degrees = root().getByRole("group", { name: "Degrees", exact: true });
  await degrees.getByRole("checkbox", { name: "2", exact: true }).check();
  for (const degree of ["1", "3", "5"])
    await degrees
      .getByRole("checkbox", { name: degree, exact: true })
      .uncheck();
  assert.ok(
    await degrees
      .getByRole("checkbox", { name: "2", exact: true })
      .isDisabled(),
  );
  assert.deepEqual(
    await root().locator(".theory-answers button").allTextContents(),
    ["2"],
  );
  await field("task", "play-degree");
  assert.equal(
    await root().locator('[data-field="mode"]').inputValue(),
    "major",
  );
  await field("task", "name-degree");
  assert.equal(
    await root().locator('[data-field="mode"]').inputValue(),
    "minor",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await openPracticeOptions(page);
  assert.equal(
    await root().locator('[data-field="mode"]').inputValue(),
    "minor",
  );
  await root()
    .getByRole("button", { name: /^Keys ·/ })
    .click();
  assert.ok(
    await root()
      .getByRole("checkbox", { name: "E minor", exact: true })
      .isChecked(),
  );
  assert.ok(
    await root()
      .getByRole("group", { name: "Degrees", exact: true })
      .getByRole("checkbox", { name: "2", exact: true })
      .isDisabled(),
  );
  await selectPractice(page, "intervals");
  await field("task", "name-quality");
  const intervalChoices = root().getByRole("group", {
    name: "Intervals",
    exact: true,
  });
  await intervalChoices
    .getByRole("checkbox", { name: "4th", exact: true })
    .check();
  const qualities = root().getByRole("group", {
    name: "Qualities",
    exact: true,
  });
  await qualities
    .getByRole("checkbox", { name: "Perfect", exact: true })
    .check();
  for (const quality of ["Major", "Minor"])
    await qualities
      .getByRole("checkbox", { name: quality, exact: true })
      .uncheck();
  assert.ok(
    await qualities
      .getByRole("checkbox", { name: "Perfect", exact: true })
      .isDisabled(),
  );
  await root()
    .getByRole("button", { name: "Advanced qualities", exact: true })
    .click();
  await qualities
    .getByRole("checkbox", { name: "Augmented", exact: true })
    .check();
  assert.ok(
    await qualities
      .getByRole("checkbox", { name: "Perfect", exact: true })
      .isEnabled(),
  );
  await field("task", "build-interval");
  assert.ok(
    await root()
      .getByRole("combobox", { name: "Key", exact: true })
      .isVisible(),
  );
  await field("quality", "basic");
  assert.ok(
    await root().getByRole("combobox", { name: "Key", exact: true }).isHidden(),
  );
  await field("task", "name-quality");
  assert.ok(
    await qualities
      .getByRole("checkbox", { name: "Perfect", exact: true })
      .isChecked(),
  );
  const advanced = root().getByRole("button", {
    name: "Advanced qualities",
    exact: true,
  });
  if ((await advanced.getAttribute("aria-expanded")) !== "true")
    await advanced.click();
  await root()
    .getByRole("checkbox", { name: "Augmented", exact: true })
    .waitFor({ state: "visible" });
  assert.ok(
    await qualities
      .getByRole("checkbox", { name: "Augmented", exact: true })
      .isChecked(),
  );
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: theory restrictions, all six tasks, MIDI, keyboard, correction, complete/continue, saved steps, notation and responsive layouts passed`,
  );
} finally {
  await browser?.close();
  await rm(fixed, { recursive: true, force: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code !== "EACCES" && e.code !== "EPERM") throw e;
    },
  );
  server.kill();
}
