import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import {
  practiceOption,
  closePracticeOptions,
  midiAction,
} from "./navigation-helpers";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const fixed = await mkdtemp(join(tmpdir(), "hymn-playback-"));
const browser = await { chromium, firefox, webkit }[engine]!.launch({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    const probe = ((window as any).playbackProbe = {
      starts: [] as number[],
      stops: 0,
      clicks: [] as number[],
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.starts.push(args[0] || 0);
      return start.apply(this, args);
    };
    const click = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<typeof click>
    ) {
      probe.clicks.push(args[0] || 0);
      return click.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (
      ...args: Parameters<typeof stop>
    ) {
      probe.stops++;
      return stop.apply(this, args);
    };
  });
  await page.goto(
    base +
      "/piano/hymns/amazing-grace?bars=0&mode=wait&countIn=0&tempo=200&arrangement=melody",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  const note = (i: number) =>
    page.locator(`[data-passage-note="${i}"]`).first();
  const center = async (i: number) => {
    // Resolve after redraw; center in the window so the fixed header cannot cover the target.
    for (let attempt = 0; attempt < 5; attempt++) {
      await note(i).evaluate((element) =>
        element.scrollIntoView({ block: "center", inline: "nearest" }),
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      const bounds = await note(i).boundingBox();
      if (bounds)
        return {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
    }
    throw new Error(`Note ${i} did not settle after the responsive redraw`);
  };
  const select = async (a: number, b: number) => {
    const from = await center(a);
    await page.mouse.click(from.x, from.y);
    await page
      .getByRole("button", { name: "Cancel selection", exact: true })
      .waitFor();
    assert.ok(
      (await page.locator(".hymn-keyboard-toggle").isHidden()) ||
        (await page.locator(".hymn-keyboard-toggle").isDisabled()),
      "selection cannot change piano presentation",
    );
    const to = await center(b);
    await page.mouse.click(to.x, to.y);
    await page
      .getByRole("button", { name: "Clear selection", exact: true })
      .waitFor();
  };
  await select(1, 2);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
  );
  assert.match((await page.locator(".hymn-count").textContent())!, /1 \/ 2/);
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  // Amazing Grace in G: the selected two melody attacks are G4, B4.
  const send = async (n: number) =>
    page.evaluate((pitch) => {
      (window as any).midiTest.send([0x90, pitch, 100]);
      (window as any).midiTest.send([0x80, pitch, 0]);
    }, n);
  assert.equal(
    await page
      .getByRole("button", { name: "Select passage", exact: true })
      .count(),
    0,
    "selection needs no mode button",
  );
  assert.ok(await page.locator(".passage-shade").count());
  assert.equal(
    await page
      .locator(".hymn-paper .sight-current")
      .first()
      .getAttribute("data-passage-note"),
    "1",
  );
  assert.equal(
    await page
      .locator(".hymn-paper .sight-current")
      .first()
      .evaluate((n) => getComputedStyle(n).opacity),
    "1",
    "current note is not faded by the selection",
  );
  assert.equal(
    await page
      .locator(".hymn-paper .sight-current")
      .first()
      .evaluate((n) => getComputedStyle(n).fill),
    "rgb(176, 101, 62)",
  );
  await send(67);
  assert.equal(
    await page
      .locator(".hymn-paper .sight-current")
      .first()
      .getAttribute("data-passage-note"),
    "2",
  );
  assert.match((await page.locator(".hymn-count").textContent())!, /2 \/ 2/);
  await send(71);
  assert.match(
    (await page.locator(".hymn-count").textContent())!,
    /1 \/ 2/,
    "wait mode loops only the selection",
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(150);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  assert.equal(await page.locator(".hymn-loop").isVisible(), false);
  const a = await center(1),
    b = await center(3);
  const scoreTop = await page
    .locator(".sequence-score")
    .evaluate((n) => n.getBoundingClientRect().top);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y);
  const firstEdge = await page
    .locator(".passage-shade")
    .first()
    .evaluate((n) => n.getBoundingClientRect().right);
  await page.mouse.move(a.x + 11, a.y);
  const nextEdge = await page
    .locator(".passage-shade")
    .first()
    .evaluate((n) => n.getBoundingClientRect().right);
  assert.ok(
    Math.abs(nextEdge - firstEdge - 3) < 1,
    "the preview follows small pointer movements without snapping to another note",
  );

  const bandHeight = await page
    .locator(".passage-shade")
    .first()
    .evaluate((n) => [n.getAttribute("y"), n.getAttribute("height")]);
  await page.mouse.move(b.x, b.y, { steps: 10 });
  assert.deepEqual(
    await page
      .locator(".passage-shade")
      .first()
      .evaluate((n) => [n.getAttribute("y"), n.getAttribute("height")]),
    bandHeight,
    "line shading keeps a fixed vertical span as selection expands",
  );
  assert.ok(
    await page.locator(".passage-shade").count(),
    "default dragging paints a live preview",
  );
  assert.equal(
    await page
      .locator(".sequence-score")
      .evaluate((n) => n.getBoundingClientRect().top),
    scoreTop,
    "selection controls never move the score under the pointer",
  );
  const movingEdge = await page
    .locator(".passage-shade")
    .last()
    .evaluate((n) => n.getBoundingClientRect().right);
  await page.mouse.up();
  const snappedEdge = await page
    .locator(".passage-shade")
    .last()
    .evaluate((n) => n.getBoundingClientRect().right);
  assert.ok(
    Math.abs(snappedEdge - movingEdge) > 1,
    "release snaps the free edge to the note boundary",
  );
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
  );
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-count-in", "0");
  const playButton = page.getByRole("button", { name: "Play", exact: true });
  assert.equal(
    await playButton.isEnabled(),
    true,
    "committed passage can be played immediately",
  );
  assert.equal(
    await page.locator(".sequence-transport .hymn-pause").first().textContent(),
    "Play",
    "primary playback stays first alongside passage controls",
  );
  const controlRows = await page.evaluate(() => {
    const play = document.querySelector(".hymn-pause")!.getBoundingClientRect();
    const clear = document
      .querySelector(".hymn-clear-passage")!
      .getBoundingClientRect();
    return { playBottom: play.bottom, clearTop: clear.top };
  });
  assert.ok(
    controlRows.clearTop >= controlRows.playBottom,
    "selection controls have their own row below Play",
  );

  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => (window as any).playbackProbe.starts.length >= 6,
  );
  assert.equal(await page.locator("#hymn-section").count(), 0);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
  );
  await page.getByRole("checkbox", { name: "Loop", exact: true }).uncheck();
  await page.waitForFunction(
    () => document.querySelector(".hymn-count")?.textContent === "Complete",
  );
  const first = await center(0);
  await page.mouse.click(first.x, first.y);
  await page.getByRole("button", { name: "Cancel selection" }).click();
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–4 selected/,
    "cancel leaves the previous passage intact",
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await select(2, 1);
  assert.match(
    (await page.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
    "tap selection works in either order on narrow screens",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `/tmp/hymn-passage-${engine}.png` });
  await practiceOption(page, "#hymn-key", "F");
  assert.equal(
    await page.locator(".hymn-clear-passage").isVisible(),
    false,
    "changing the score clears stale ranges",
  );
  const last = await page
    .locator("[data-passage-note]")
    .evaluateAll((nodes) =>
      Math.max(
        ...nodes.map((n) => Number(n.getAttribute("data-passage-note"))),
      ),
    );
  await note(last).press("Enter");
  await note(last).press("Enter");
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  const before = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    (n) => (window as any).playbackProbe.starts.length >= n + 3,
    before,
  );
  assert.equal(
    await page.locator("#hymn-section").count(),
    0,
    "a loop ending at the hymn boundary never changes the hymn",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const stoppedAt = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => (window as any).playbackProbe.starts.length),
    stoppedAt,
    "pausing cancels loop restarts",
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  await practiceOption(page, "#hymn-arrangement", "bass");
  await note(0).press("Enter");
  await note(2).press("Enter");
  const shadeGeometry = await page
    .locator(".passage-shade")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const rect = n.getBoundingClientRect();
        const staves = [
          ...n.closest("svg")!.querySelectorAll(".abcjs-staff"),
        ].map((s) => s.getBoundingClientRect());
        return {
          fullHeight:
            rect.top <= Math.min(...staves.map((s) => s.top)) &&
            rect.bottom >= Math.max(...staves.map((s) => s.bottom)),
          staves: staves.length,
        };
      }),
    );
  assert.ok(
    shadeGeometry.some((s) => s.staves > 1),
    "both staves receive a continuous musical-span band",
  );
  assert.ok(
    shadeGeometry.every((s) => s.fullHeight),
    "shading covers the complete staff height",
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  await practiceOption(page, "#hymn-arrangement", "melody");
  const secondLine = await page
    .locator(".hymn-paper svg")
    .nth(1)
    .locator("[data-passage-note]")
    .last()
    .getAttribute("data-passage-note");
  await note(0).press("Enter");
  await note(Number(secondLine)).press("Enter");
  assert.ok(
    (await page.locator(".passage-shade").count()) >= 2,
    "selection follows the music across line breaks",
  );
  assert.equal(
    await page
      .locator('[data-passage-note="34"]')
      .first()
      .evaluate((n) => getComputedStyle(n).opacity),
    "1",
    "unselected notes remain readable",
  );
  await page.screenshot({ path: `/tmp/hymn-selection-bands-${engine}.png` });
  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(
    base +
      "/piano/hymns/amazing-grace?bars=0&mode=wait&countIn=0&arrangement=melody",
  );
  for (const i of [1, 2]) {
    const target = touch.locator(`[data-passage-note="${i}"]`).first();
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await touch.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  assert.match(
    (await touch.locator(".hymn-passage-status").textContent())!,
    /Notes 2–3 selected/,
    "real touch pointer events select a passage",
  );
  await touch.screenshot({ path: `/tmp/hymn-passage-touch-${engine}.png` });
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: passage mouse drag, tap selection, wait and playback loops, cancellation and responsive layout passed`,
  );
} finally {
  await browser.close();
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
