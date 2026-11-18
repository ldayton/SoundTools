import { captureFailure, closeBrowser, launchBrowser, createContext, newPage } from '../../../scripts/ci/browser-harness.cjs';
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  midiAction,
  closeNavigation,
} from "../../../packages/music-practice/browser-tests/helpers";
const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4431";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const home = await mkdtemp(join(tmpdir(), "songalong-piano-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await launchBrowser({
    args: engine === "chromium" ? ["--mute-audio"] : [],
    env:
      engine === "webkit"
        ? { ...process.env, CFFIXED_USER_HOME: home }
        : process.env,
  });
  const context = await createContext(browser, {
    viewport: { width: 1680, height: 1050 },
  });
  const page = await context.newPage();
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
    const probe = ((window as any).pianoProbe = {
      starts: 0,
      stops: 0,
      strikes: [] as string[],
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.starts++;
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (
      ...args: Parameters<typeof stop>
    ) {
      probe.stops++;
      return stop.apply(this, args);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      if (this.matches(".piano-key.is-playing"))
        probe.strikes.push((this as HTMLElement).dataset.piano!);
      return animate.apply(this, args);
    };
  });
  await page.goto(
    `http://127.0.0.1:${port}/piano/hymns/jesus-loves-me?mode=playback&tempo=200`,
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  const c = page.locator('[data-piano="60"]'),
    d = page.locator('[data-piano="62"]');
  const center = async (locator: typeof c) => {
    const b = (await locator.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height - 12 };
  };
  const pc = await center(c),
    pd = await center(d);
  const before = await page.locator(".hymn-count").textContent();
  await page.mouse.move(pc.x, pc.y);
  await page.mouse.down();
  await expect(c).toHaveClass(/is-held/);
  await expect(c).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => (window as any).pianoProbe.starts))
    .toBeGreaterThan(0);
  const starts = await page.evaluate(() => (window as any).pianoProbe.starts);
  const stops = await page.evaluate(() => (window as any).pianoProbe.stops);
  await page.mouse.move(pd.x, pd.y);
  await expect(c).not.toHaveClass(/is-held/);
  await expect(d).toHaveClass(/is-held/);
  await page.mouse.up();
  await expect(d).not.toHaveClass(/is-held/);
  await expect
    .poll(() => page.evaluate(() => (window as any).pianoProbe.stops))
    .toBeGreaterThan(stops);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    before,
    "auditioning in playback does not grade",
  );
  await c.focus();
  await page.keyboard.down("Enter");
  await expect(c).toHaveClass(/is-held/);
  await page.keyboard.up("Enter");
  await expect(c).not.toHaveClass(/is-held/);
  // Pointer cancellation and losing focus release sound and pressed appearance.
  await page.mouse.move(pc.x, pc.y);
  await page.mouse.down();
  await c.evaluate((e) =>
    e.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
    ),
  );
  await page.mouse.up();
  await expect(c).not.toHaveClass(/is-held/);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(c).not.toHaveClass(/is-held/);
  await page.mouse.up();
  // MIDI feedback stays live while playback input is not being graded.
  await midiAction(page, "Connect MIDI keyboard");
  await closeNavigation(page);
  const send = async (data: number[]) =>
    page.evaluate((d) => (window as any).midiTest.send(d), data);
  await send([0x90, 60, 100]);
  await expect(c).toHaveClass(/is-held/);
  await send([0xb0, 64, 127]);
  await send([0x80, 60, 0]);
  await expect(c).not.toHaveClass(/is-held/);
  await expect(c).toHaveClass(/is-sustained/);
  await send([0xb0, 64, 0]);
  await expect(c).not.toHaveClass(/is-sustained/);
  await send([0x90, 60, 100]);
  await send([0x91, 60, 100]);
  await send([0x80, 60, 0]);
  await expect(c).toHaveClass(/is-held/);
  await send([0x81, 60, 0]);
  await expect(c).not.toHaveClass(/is-held/);
  // Two real touch pointers can independently play and release a chord.
  if (engine === "chromium") {
    const cdp = await context.newCDPSession(page);
    const tc = await center(c),
      td = await center(d);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, ...tc },
        { id: 2, ...td },
      ],
    });
    await expect(c).toHaveClass(/is-held/);
    await expect(d).toHaveClass(/is-held/);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [{ id: 1, ...tc }],
    });
    await expect(c).not.toHaveClass(/is-held/);
    await expect(d).toHaveClass(/is-held/);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(d).not.toHaveClass(/is-held/);
    await cdp.detach();
  }
  await page.locator(".hymn-pause").click();
  await expect
    .poll(() => page.locator(".piano-key.is-playing").count())
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const notes = (window as any).pianoProbe.strikes as string[];
        return new Set(notes).size < notes.length;
      }),
    )
    .toBe(true);
  await page.locator(".piano-toggle").click();
  await page.locator(".piano-toggle").click();
  await expect
    .poll(() => page.locator(".piano-key.is-playing").count())
    .toBeGreaterThan(0);
  await page.locator(".hymn-pause").click();
  await expect(page.locator(".piano-key.is-playing")).toHaveCount(0);
  await page.locator(".hymn-go-start").click();
  await expect(page.locator(".piano-key.is-playing")).toHaveCount(0);
  await send([0x90, 60, 100]);
  await page.evaluate(() => (window as any).midiTest.remove("roland"));
  await expect(
    page.locator(".piano-key.is-held,.piano-key.is-sustained"),
  ).toHaveCount(0);
  assert.ok(
    (await page.evaluate(() => (window as any).pianoProbe.starts)) > starts,
  );
  await page.screenshot({ path: `../../work/songalong-piano-${engine}.png` });

  // Coaching remains distinct from physical key state in Wait for me.
  await page.goto(
    `http://127.0.0.1:${port}/piano/hymns/amazing-grace?mode=wait&arrangement=melody`,
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  const wrong = await center(c);
  await page.mouse.move(wrong.x, wrong.y);
  await page.mouse.down();
  await expect(c).toHaveClass(/is-wrong/);
  await expect(c).toHaveClass(/is-held/);
  await expect(d).toHaveClass(/is-right/);
  await expect(d).toHaveAttribute("aria-pressed", "false");
  await expect(c.locator(".piano-hint-label")).toBeVisible();
  await page.mouse.up();
  await expect(c).not.toHaveClass(/is-held/);
  const count = await page.locator(".hymn-count").textContent();
  const right = await center(d);
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await expect(d).toHaveClass(/is-held/);
  await expect(page.locator(".hymn-count")).not.toHaveText(count!);
  await page.setViewportSize({ width: 393, height: 660 });
  await expect(d).not.toHaveClass(/is-held/);
  await expect(page.locator(".practice-piano")).toBeHidden();
  await expect(page.locator(".piano-toggle")).toHaveCount(0);
  await page.mouse.up();
  await page.screenshot({
    path: `../../work/songalong-piano-${engine}-mobile.png`,
  });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.locator('#sight-reading[data-playback-only="false"]').waitFor();
  await expect(d).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await d.focus();
  await expect(d).toBeFocused();
  await page.keyboard.down("Enter");
  await expect(d).toHaveClass(/is-held/);
  assert.equal(await d.evaluate((e) => e.getAnimations().length), 0);
  await page.keyboard.up("Enter");
  await expect(d).not.toHaveClass(/is-held/);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `../../work/songalong-piano-${engine}-desktop.png`,
  });
  assert.deepEqual(errors, []);
  await context.close();
  // A quick release before a cold sample arrives must not produce a delayed ghost note.
  const cold = await newPage(browser, {
    viewport: { width: 1400, height: 1000 },
  });
  let allowSamples!: () => void;
  const gate = new Promise<void>((r) => {
    allowSamples = r;
  });
  await cold.route("**/*.flac", async (route) => {
    await gate;
    await route.continue();
  });
  await cold.addInitScript(() => {
    (window as any).starts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      (window as any).starts++;
      return start.apply(this, args);
    };
  });
  await cold.goto(
    `http://127.0.0.1:${port}/piano/hymns/amazing-grace?mode=playback`,
  );
  await cold.locator(".hymn-paper svg").first().waitFor();
  await cold.locator('[data-piano="60"]').click();
  allowSamples();
  await expect
    .poll(() =>
      cold.evaluate(
        () =>
          performance
            .getEntriesByType("resource")
            .filter((e) => e.name.endsWith(".flac")).length,
      ),
    )
    .toBeGreaterThan(0);
  await cold.waitForTimeout(200);
  assert.equal(await cold.evaluate(() => (window as any).starts), 0);
  await cold.close();
  console.log(
    `${engine}: held/drag/release, keyboard, MIDI/pedal, repeated playback, pause/seek/disconnect and cold-release cancellation pass`,
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
  await rm(home, { recursive: true, force: true });
}
