import { chromium, firefox, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  practiceOption,
  openPracticeOptions,
  closePracticeOptions,
  midiAction,
  closeNavigation,
} from "../../../packages/music-practice/browser-tests/helpers";
const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4378";
const base = `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const home = await mkdtemp(join(tmpdir(), "songalong-passage-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await { chromium, firefox, webkit }[engine]!.launch({
    args: engine === "chromium" ? ["--mute-audio"] : [],
    env:
      engine === "webkit"
        ? { ...process.env, CFFIXED_USER_HOME: home }
        : process.env,
  });
  const page = await browser.newPage({
    viewport: { width: 1680, height: 1050 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript({
    content: await readFile(
      new URL(
        "../../../packages/music-practice/test-fixtures/midi.js",
        import.meta.url,
      ),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    const probe = ((window as any).passageProbe = { notes: 0, clicks: 0 });
    window.addEventListener(
      "pointerdown",
      (event) => {
        (window as any).passagePointerId = event.pointerId;
      },
      true,
    );
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.notes++;
      return start.apply(this, args);
    };
    const click = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<typeof click>
    ) {
      probe.clicks++;
      return click.apply(this, args);
    };
  });
  const note = (index: number) =>
    page.locator(`[data-passage-note="${index}"]`).first();
  const center = async (index: number) => {
    // Engraving is replaced after responsive/option changes. Wait for stable visible geometry.
    let previous: { x: number; y: number } | undefined,
      stable = 0;
    for (let attempt = 0; attempt < 120; attempt++) {
      await note(index).evaluate((el) =>
        el.scrollIntoView({ block: "nearest", inline: "nearest" }),
      );
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
      const box = await note(index).boundingBox(),
        viewport = await score.boundingBox();
      if (!box || !viewport) continue;
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const visible =
        point.y > Math.max(0, viewport.y) &&
        point.y <
          Math.min(viewport.y + viewport.height, page.viewportSize()!.height);
      stable =
        visible &&
        previous &&
        Math.abs(previous.x - point.x) < 0.5 &&
        Math.abs(previous.y - point.y) < 0.5
          ? stable + 1
          : 0;
      if (stable >= 3) return point;
      previous = point;
    }
    throw Error(`Note ${index} never reached stable, visible geometry`);
  };
  const click = async (index: number) => {
    const p = await center(index);
    await page.mouse.click(p.x, p.y);
  };
  const drag = async (a: number, b: number) => {
    const from = await center(a);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y);
    const to = await center(b);
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
  };
  const status = page.locator(".hymn-passage-status");
  const score = page.locator(".sequence-score");
  const start = page.getByRole("slider", {
    name: "Selection start",
    exact: true,
  });
  const end = page.getByRole("slider", { name: "Selection end", exact: true });
  const undo = async () => {
    await score.focus();
    await page.keyboard.press("Meta+z");
  };
  const probe = () =>
    page.evaluate(
      () => (window as any).passageProbe as { notes: number; clicks: number },
    );
  await page.goto(
    base +
      "/piano/hymns/amazing-grace?mode=wait&countIn=0.5&loopCountIn=1&tempo=200&arrangement=melody",
  );
  await note(0).waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  await closeNavigation(page);
  await click(4);
  await expect(page.locator(".hymn-count")).toHaveText("5 / 35");
  await expect(page.locator(".hymn-clear-passage")).toBeHidden();
  assert.deepEqual(
    await probe(),
    { notes: 0, clicks: 0 },
    "a seek does not make sound",
  );
  await page.locator(".hymn-pause").click(); // Pause Wait for me.
  await click(2);
  await expect(page.locator(".hymn-pause")).toHaveAttribute(
    "aria-label",
    "Resume",
  );
  await expect(page.locator(".hymn-count")).toHaveText("3 / 35");
  await page.locator(".hymn-pause").click();
  await score.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".hymn-count")).toHaveText("4 / 35");
  await page.keyboard.press("Home");
  await expect(page.locator(".hymn-count")).toHaveText("1 / 35");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(start).toHaveAttribute("aria-valuenow", "1");
  await expect(end).toHaveAttribute("aria-valuenow", "2");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(end).toHaveAttribute("aria-valuenow", "3");
  await undo();
  await expect(end).toHaveAttribute("aria-valuenow", "2");
  await undo();
  await expect(start).toBeHidden();
  // Preview follows the pointer continuously and keeps each system's vertical band fixed.
  const a = await center(1),
    b = await center(3);
  const top = (await score.boundingBox())!.y;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y);
  const band = page.locator(".passage-shade").first();
  const first = await band.evaluate((e) => ({
    right: e.getBoundingClientRect().right,
    y: e.getAttribute("y"),
    h: e.getAttribute("height"),
  }));
  await page.mouse.move(a.x + 11, a.y);
  assert.ok(
    Math.abs(
      (await band.boundingBox())!.x +
        (await band.boundingBox())!.width -
        first.right -
        3,
    ) < 1,
  );
  await page.mouse.move(b.x, b.y, { steps: 10 });
  assert.deepEqual(
    await band.evaluate((e) => [e.getAttribute("y"), e.getAttribute("height")]),
    [first.y, first.h],
  );
  assert.equal(
    (await score.boundingBox())!.y,
    top,
    "drag controls do not move the score",
  );
  await page.mouse.up();
  await expect(status).toHaveText("Bar 1");
  await expect(start).toHaveAttribute("aria-valuetext", "Bar 1, beat 1");
  await expect(end).toHaveAttribute("aria-valuetext", "Bar 1, beat 3½");
  await end.focus();
  await page.keyboard.press("ArrowRight");
  await expect(end).toHaveAttribute("aria-valuenow", "5");
  await expect(end).toBeFocused();
  await undo();
  await expect(status).toHaveText("Bar 1");
  // Drag an endpoint; ordinary clicks within a passage retain it.
  let handle = (await end.boundingBox())!;
  const target = await center(4);
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height - 12,
  );
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
  await expect(end).toHaveAttribute("aria-valuenow", "5");
  await click(2);
  await expect(end).toHaveAttribute("aria-valuenow", "5");
  await undo();
  await expect(status).toHaveText("Bar 1");
  // Escape and lost pointer capture restore the prior range instead of leaving input blocked.
  let from = await center(5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(status).toHaveText("Bar 1");
  await expect(page.locator(".hymn-cancel-passage")).toBeHidden();
  from = await center(5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y);
  await page.locator(".hymn-paper").evaluate((el) => {
    const pointerId = (window as any).passagePointerId;
    if (!el.hasPointerCapture(pointerId))
      throw new Error("The active drag must own pointer capture");
    el.releasePointerCapture(pointerId);
  });
  await page.mouse.move(from.x + 21, from.y);
  await page.mouse.up();
  await expect(status).toHaveText("Bar 1");
  await expect(page.locator(".hymn-cancel-passage")).toBeHidden();
  const bar2 = await center(5);
  await page.mouse.dblclick(bar2.x, bar2.y);
  await expect(status).toHaveText("Bar 2");
  await expect(start).toHaveAttribute("aria-valuenow", "5");
  await expect(end).toHaveAttribute("aria-valuenow", "6");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await undo();
  await expect(status).toHaveText("Bar 2");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await drag(1, 2);
  const send = async (n: number) =>
    page.evaluate((p) => {
      (window as any).midiTest.send([0x90, p, 100]);
      (window as any).midiTest.send([0x80, p, 0]);
    }, n);
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  await expect(page.locator(".hymn-count")).toHaveText("1 / 2");
  await send(67);
  await expect(page.locator(".hymn-count")).toHaveText("2 / 2");
  await send(71);
  await expect(page.locator(".hymn-count")).toHaveText("1 / 2");
  assert.deepEqual(
    await probe(),
    { notes: 0, clicks: 0 },
    "Wait for me never counts in, including loops",
  );
  // Playback uses the same range and optionally counts in each time round.
  await practiceOption(page, "#hymn-mode", "playback");
  await closePracticeOptions(page);
  await page.locator(".hymn-pause").click();
  await expect
    .poll(async () => (await probe()).clicks)
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(async () => (await probe()).notes)
    .toBeGreaterThanOrEqual(6);
  await page.locator(".hymn-pause").click();
  await openPracticeOptions(page);
  await page.locator("#hymn-loop-count-in").uncheck();
  await closePracticeOptions(page);
  const before = await probe();
  await page.locator(".hymn-pause").click();
  await expect
    .poll(async () => (await probe()).clicks)
    .toBeGreaterThan(before.clicks);
  const resumeClicks = (await probe()).clicks;
  await expect
    .poll(async () => (await probe()).notes)
    .toBeGreaterThanOrEqual(before.notes + 6);
  assert.equal(
    (await probe()).clicks,
    resumeClicks,
    "resume counts in once; subsequent loops run straight through",
  );
  await page.locator(".hymn-pause").click();
  await click(1);
  await expect(start).toBeVisible();
  const pausedNotes = (await probe()).notes;
  await click(10);
  await expect(start).toBeHidden();
  await expect(page.locator(".hymn-pause")).toHaveAttribute(
    "aria-label",
    "Resume",
  );
  assert.equal(
    (await probe()).notes,
    pausedNotes,
    "seeking while paused stays silent",
  );
  await page.locator(".hymn-pause").click();
  await click(4);
  await expect(page.locator(".hymn-pause")).toHaveAttribute(
    "aria-label",
    "Pause",
  );
  await page.locator(".hymn-pause").click();
  await page.screenshot({
    path: `../../work/songalong-passage-${engine}-desktop.png`,
  });
  // Mobile taps seek. Horizontal finger dragging creates a range; handles survive relayout.
  await practiceOption(page, "#hymn-mode", "wait");
  await closePracticeOptions(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const p0 = await center(0);
  await page.touchscreen.tap(p0.x, p0.y);
  await expect(start).toBeHidden();
  if (engine === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const to = await center(1),
      point = await center(0);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, ...point }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: point.x + 32, y: point.y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, ...to }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(end).toHaveAttribute("aria-valuenow", "2");
    handle = (await end.boundingBox())!;
    const thumb = { x: handle.x + 22, y: handle.y + handle.height - 12 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, ...thumb }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: thumb.x - 10, y: thumb.y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(end).toHaveAttribute("aria-valuenow", "2");
    await expect(page.locator(".hymn-cancel-passage")).toBeHidden();
    await cdp.detach();
  } else {
    // Native touch-drag injection is Chromium-only. Cover the same narrow-screen
    // range and handle behavior through the supported keyboard path elsewhere;
    // mouse drags are already exercised above on every engine.
    await score.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(end).toHaveAttribute("aria-valuenow", "2");
  }
  await end.focus();
  await page.keyboard.press("ArrowRight");
  await expect(end).toHaveAttribute("aria-valuenow", "3");
  const label = await status.textContent();
  await page.screenshot({
    path: `../../work/songalong-passage-${engine}-mobile.png`,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await expect(status).toHaveText(label!);
  await expect(end).toHaveAttribute("aria-valuenow", "3");
  await expect(end).toBeFocused();
  // Changing the musical content clears ranges and their undo history.
  await practiceOption(page, "#hymn-key", "F");
  await closePracticeOptions(page);
  await undo();
  await expect(start).toBeHidden();
  // Preserve coverage of full grand-staff bands and musical spans across system breaks.
  await practiceOption(page, "#hymn-arrangement", "bass");
  await closePracticeOptions(page);
  await score.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const geometry = await page.locator(".passage-shade").evaluateAll((nodes) =>
    nodes.map((n) => {
      const b = n.getBoundingClientRect(),
        staves = [...n.closest("svg")!.querySelectorAll(".abcjs-staff")].map(
          (s) => s.getBoundingClientRect(),
        );
      return {
        count: staves.length,
        full:
          b.top <= Math.min(...staves.map((s) => s.top)) &&
          b.bottom >= Math.max(...staves.map((s) => s.bottom)),
      };
    }),
  );
  assert.ok(geometry.some((g) => g.count > 1));
  assert.ok(geometry.every((g) => g.full));
  await practiceOption(page, "#hymn-arrangement", "melody");
  await closePracticeOptions(page);
  const secondLineLast = Number(
    await page
      .locator(".hymn-paper svg")
      .nth(1)
      .locator("[data-passage-note]")
      .last()
      .getAttribute("data-passage-note"),
  );
  await drag(0, secondLineLast);
  assert.ok((await page.locator(".passage-shade").count()) >= 2);
  assert.equal(
    await note(34).evaluate((n) => getComputedStyle(n).opacity),
    "1",
    "unselected music remains readable",
  );
  // A final-note loop stays in this hymn, and Pause prevents another round starting.
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await score.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+ArrowRight");
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-count-in", "0");
  await closePracticeOptions(page);
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  const lastBefore = (await probe()).notes;
  await page.locator(".hymn-pause").click();
  await expect
    .poll(async () => (await probe()).notes, { timeout: 15000 })
    .toBeGreaterThanOrEqual(lastBefore + 3);
  await expect(page.locator(".sequence-title")).toHaveText("Amazing Grace");
  await page.locator(".hymn-pause").click();
  const stopped = (await probe()).notes;
  await page.waitForTimeout(400);
  assert.equal((await probe()).notes, stopped);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: click/tap seek, smooth ranges, mouse/touch/keyboard handles, measure selection, undo, cancellation, labels, loop count-ins and responsive persistence pass`,
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(home, { recursive: true, force: true });
}
