import { macBookAir13, iphone14Pro } from "../../../scripts/test-devices.cjs";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  midiAction,
  closeNavigation,
  openPracticeOptions,
  closePracticeOptions,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";
const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4387";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const home = await mkdtemp(join(tmpdir(), "songalong-workspace-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Preview exited");
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await { chromium, firefox, webkit }[engine]!.launch({
    args: engine === "chromium" ? ["--mute-audio"] : [],
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  const page = await browser.newPage({
    ...macBookAir13,
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination) {
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(mute, this.context.destination);
        return connect.call(this, mute);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
    (window as any).audioStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      (window as any).audioStarts++;
      return start.apply(this, args);
    };
  });
  await page.goto(`http://127.0.0.1:${port}/piano/hymns/amazing-grace`);
  await page.locator(".hymn-paper svg").first().waitFor();
  // Header toggles stay mounted and anchored while either desktop panel changes.
  assert.equal(await page.title(), "SongAlong");
  assert.equal(
    await page.locator("#sight-reading .presentation-feedback").count(),
    0,
  );
  assert.equal(await page.locator(".hymn-next").count(), 0);
  await expect(page.locator("#sight-reading .presentation-header")).toHaveCount(
    0,
  );
  await expect(
    page.locator("#sight-reading .presentation-progress"),
  ).toHaveCount(0);
  await expect(page.locator("#hymn-scroll-hint")).toHaveCount(0);
  const pianoBottom = () =>
    page
      .locator(".practice-piano:visible")
      .evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
  await expect.poll(pianoBottom).toBe(1034);
  const beforeScroll = await pianoBottom();
  await page.locator(".sequence-score").evaluate((el) => {
    el.scrollTop = 120;
  });
  assert.equal(
    await pianoBottom(),
    beforeScroll,
    "Score scrolling never moves the piano dock",
  );
  await page.locator(".sequence-score").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator("#hymn-low").click();
  const picker = page.locator("#hymn-low-picker");
  await expect(
    picker.getByRole("button", { name: "C2", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "B6", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "C1", exact: true }),
  ).toHaveCount(0);
  await expect(
    picker.getByRole("button", { name: "C7", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await practiceOption(page, "#hymn-mode", "playback");
  const tempo = page.locator("#hymn-tempo");
  assert.ok(
    (await tempo.boundingBox())!.width <= 112,
    "Tempo occupies one compact field",
  );
  const tempoControl = page
    .locator(".mantine-NumberInput-root")
    .filter({ has: tempo });
  await tempoControl.locator('[data-direction="up"]').click();
  await expect(tempo).toHaveValue("85 BPM");
  assert.match(page.url(), /tempo=85/);
  await tempoControl.locator('[data-direction="down"]').click();
  await expect(tempo).toHaveValue("80 BPM");
  await practiceOption(page, "#hymn-mode", "wait");
  const navigationToggle = page.locator("header .nav-toggle");
  const optionsToggle = page.locator("#practice-options-reopen");
  const toolbarGeometry = () =>
    Promise.all([
      navigationToggle.boundingBox(),
      optionsToggle.boundingBox(),
      page.locator("#hymn-mode").boundingBox(),
    ]);
  const expandedGeometry = await toolbarGeometry();
  const resizeHandle = page.getByRole("separator", {
    name: "Resize navigation",
    exact: true,
  });
  const navigation = page.locator(".mantine-AppShell-navbar");
  const handleBox = (await resizeHandle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(320, handleBox.y + 100, { steps: 5 });
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "320");
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await navigation.boundingBox())!.width))
    .toBe(320);
  assert.deepEqual(
    await toolbarGeometry(),
    expandedGeometry,
    "Resizing navigation never moves top-bar controls",
  );
  await resizeHandle.press("Home");
  await expect
    .poll(async () => Math.round((await navigation.boundingBox())!.width))
    .toBe(224);
  await resizeHandle.press("ArrowRight");
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "240");
  await resizeHandle.press("Home");
  await expect
    .poll(async () => Math.round((await navigation.boundingBox())!.width))
    .toBe(224);

  const headerGeometry = () =>
    page
      .locator(
        ".hymn-toolbar, .hymn-toolbar-appearance, .hymn-toolbar-playback, .hymn-toolbar-piano, #hymn-mode, #hymn-tempo, #hymn-size, .hymn-go-start, .hymn-pause",
      )
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().toJSON()),
      );
  const beforeMode = await headerGeometry();
  await expect(tempo).toBeDisabled();
  await practiceOption(page, "#hymn-mode", "playback");
  await expect(tempo).toBeEnabled();
  assert.deepEqual(
    await headerGeometry(),
    beforeMode,
    "Switching mode never moves toolbar controls",
  );
  await practiceOption(page, "#hymn-mode", "wait");
  assert.deepEqual(await headerGeometry(), beforeMode);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();

  for (const toggle of [navigationToggle, optionsToggle]) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    assert.deepEqual(await toolbarGeometry(), expandedGeometry);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    assert.deepEqual(await toolbarGeometry(), expandedGeometry);
  }
  await expect(page.locator(".sequence-score .sequence-title")).toHaveText(
    "Amazing Grace",
  );
  await expect(page.locator(".hymn-score-credits")).toContainText(
    "John Newton",
  );
  await expect(page.getByText("Input", { exact: true })).toHaveCount(0);
  const size = page.getByRole("spinbutton", {
    name: "Staff size in pixels",
    exact: true,
  });
  await expect(size).toHaveValue("40 px");
  const firstSystemHeight = () =>
    page
      .locator(".hymn-paper svg")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
  const originalHeight = await firstSystemHeight();
  const sizeControl = page
    .locator(".mantine-NumberInput-root")
    .filter({ has: size });
  await sizeControl.locator('[data-direction="up"]').click();
  await expect(size).toHaveValue("41 px");
  await expect.poll(firstSystemHeight).not.toBe(originalHeight);
  const pixels = await size.inputValue();
  await page.getByPlaceholder("Search songs").fill("silent");
  await page.getByRole("option", { name: "Silent Night", exact: true }).click();
  await expect(size).toHaveValue(pixels);
  await page.getByPlaceholder("Search songs").fill("amazing");
  await page
    .getByRole("option", { name: "Amazing Grace", exact: true })
    .click();
  await expect(size).toHaveValue(pixels);
  await page.getByRole("button", { name: "Volume", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Piano volume", exact: true }),
  ).toHaveAttribute("aria-orientation", "vertical");
  await page.keyboard.press("Escape");
  const whiteWidth = await page
    .locator(".white-key:visible")
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  await midiAction(page, "Connect MIDI keyboard");
  await closeNavigation(page);
  await expect(page.locator(".keyboard-menu")).toHaveAttribute(
    "data-state",
    "connected",
  );
  await page.setViewportSize(iphone14Pro.viewport);
  await page
    .getByRole("button", {
      name: /^Expand (practice|playback) options$/,
      exact: true,
    })
    .waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  // AppShell animates the desktop navbar offset after a viewport resize.
  // Compare the drawer against settled mobile geometry, not that animation.
  await expect
    .poll(async () =>
      Math.round(
        (await page.locator(".practice-workspace-content").boundingBox())!
          .width,
      ),
    )
    .toBe(iphone14Pro.viewport.width - 32);
  const scoreY = (await page.locator(".sequence-score").boundingBox())!.y;
  const count = await page.locator(".hymn-count").textContent();
  await openPracticeOptions(page);
  const dialog = page.getByRole("dialog", {
    name: /^(Practice|Playback) options$/,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#hymn-low-wheel")).toHaveAttribute(
    "aria-valuemax",
    "59",
  );
  await expect.poll(pianoBottom).toBe(iphone14Pro.viewport.height - 16);
  assert.equal(
    (await page.locator(".sequence-score").boundingBox())!.y,
    scoreY,
    "Opening options never pushes score",
  );
  await page.evaluate(() => {
    (window as any).midiTest.send([0x90, 62, 100]);
    (window as any).midiTest.send([0x80, 62, 0]);
  });
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    count,
    "MIDI cannot answer behind options",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: /^Expand (practice|playback) options$/,
      exact: true,
    }),
  ).toBeFocused();
  assert.equal(
    await page
      .locator(".white-key:visible")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
    whiteWidth,
    "Piano key widths survive resizing",
  );
  await practiceOption(page, "#hymn-mode", "playback");
  await openPracticeOptions(page);
  await expect(
    page.getByRole("dialog", { name: "Playback options", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#hymn-count-in")).toBeVisible();
  await closePracticeOptions(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => (window as any).audioStarts > 0);
  await openPracticeOptions(page);
  await expect(page.locator(".hymn-pause")).toHaveAttribute(
    "aria-label",
    "Resume",
  );
  await closePracticeOptions(page);
  const beforeAudition = await page.evaluate(() => (window as any).audioStarts);
  const pausedCount = await page.locator(".hymn-count").textContent();
  const audition = page.locator('.hymn-piano [data-piano="60"]');
  await expect(audition).toHaveAttribute("aria-disabled", "false");
  await audition.hover();
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => (window as any).audioStarts))
    .toBeGreaterThan(beforeAudition);
  await page.mouse.up();
  await expect(audition).not.toHaveClass(/is-held/);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    pausedCount,
    "Auditioning never advances playback",
  );
  await openPracticeOptions(page);
  const starts = await page.evaluate(() => (window as any).audioStarts);
  await page.waitForTimeout(350);
  assert.equal(
    await page.evaluate(() => (window as any).audioStarts),
    starts,
    "Opening options pauses scheduled playback",
  );
  await practiceOption(page, "#hymn-mode", "wait");
  await openPracticeOptions(page);
  await expect(page.locator("#hymn-count-in")).toHaveCount(0);
  await practiceOption(page, "#hymn-arrangement", "bass");
  await practiceOption(page, "#hymn-view", "right");
  await expect(page.locator("#hymn-hands")).toHaveValue("right");
  await expect(page.locator("#hymn-hands option[value=both]")).toBeDisabled();
  await practiceOption(page, "#hymn-view", "both");
  await practiceOption(page, "#hymn-hands", "left");
  await closePracticeOptions(page);
  await page.setViewportSize(macBookAir13.viewport);
  await expect(
    page.getByRole("complementary", { name: /^(Practice|Playback) options$/ }),
  ).toBeVisible();
  await expect(page.locator("#hymn-hands")).toHaveValue("left");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () =>
      Math.round(
        (await page.locator(".practice-workspace-content").boundingBox())!.x,
      ),
    )
    .toBe(240);
  await mkdir("../../work", { recursive: true });
  await page.screenshot({
    path: `../../work/songalong-workspace-${engine}-both-hands.png`,
  });
  for (const width of [
    320, 360, 375, 390, 393, 430, 479, 480, 767, 768, 960, 1680,
  ]) {
    await page.setViewportSize({
      width,
      height:
        width === macBookAir13.viewport.width
          ? macBookAir13.viewport.height
          : iphone14Pro.viewport.height,
    });
    const hideControls = page.getByRole("button", {
      name: "Hide controls",
      exact: true,
    });
    if (await hideControls.isVisible()) await hideControls.click();
    await expect
      .poll(() =>
        page
          .locator(".mantine-AppShell-header")
          .evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBe(56);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    if (width < 768) {
      await expect(page.locator("#hymn-mode")).toBeHidden();
      await expect(page.locator("#hymn-size")).toBeHidden();
      await expect(page.locator("#hymn-tempo")).toBeHidden();
      const compactGeometry = await page
        .locator("header button:visible")
        .evaluateAll((elements) =>
          elements.map((el) => el.getBoundingClientRect().toJSON()),
        );
      await page
        .getByRole("button", { name: "Show controls", exact: true })
        .click();
      await expect
        .poll(() =>
          page
            .locator(".mantine-AppShell-header")
            .evaluate((el) => el.getBoundingClientRect().height),
        )
        .toBe(220);
      await expect(page.locator("header [data-direction]")).toHaveCount(0);
      for (const mode of ["playback", "wait"] as const) {
        const before = await page
          .locator("header button:visible, header input:visible")
          .evaluateAll((elements) =>
            elements.map((el) => el.getBoundingClientRect().toJSON()),
          );
        await practiceOption(page, "#hymn-mode", mode);
        assert.deepEqual(
          await page
            .locator("header button:visible, header input:visible")
            .evaluateAll((elements) =>
              elements.map((el) => el.getBoundingClientRect().toJSON()),
            ),
          before,
          `${width}px: mode changes never move controls`,
        );
        assert.ok(
          await page.evaluate(() => {
            const header = document
              .querySelector(".mantine-AppShell-header")!
              .getBoundingClientRect();
            const controls = [
              ...document.querySelectorAll("header button, header input"),
            ]
              .filter((el) => el.getClientRects().length)
              .map((el) => el.getBoundingClientRect());
            const fields = [
              ...document.querySelectorAll(".toolbar-number-touch > button"),
            ].map((el) => el.getBoundingClientRect());
            return (
              fields.length === 4 &&
              fields.every((r) => r.height >= 42 && r.width >= 36) &&
              controls.every(
                (a, i) =>
                  a.left >= 0 &&
                  a.right <= innerWidth &&
                  a.top >= header.top &&
                  a.bottom <= header.bottom &&
                  controls
                    .slice(i + 1)
                    .every(
                      (b) =>
                        a.right <= b.left + 1 ||
                        b.right <= a.left + 1 ||
                        a.bottom <= b.top + 1 ||
                        b.bottom <= a.top + 1,
                    ),
              )
            );
          }),
          `${width}px: all controls fit without overlaps`,
        );
        await expect
          .poll(() =>
            page
              .locator("#hymn-mode .mantine-Button-label")
              .evaluate((el) => el.scrollWidth <= el.clientWidth),
          )
          .toBe(true);
      }
      await hideControls.click();
      assert.deepEqual(
        await page
          .locator("header button:visible")
          .evaluateAll((elements) =>
            elements.map((el) => el.getBoundingClientRect().toJSON()),
          ),
        compactGeometry,
        "Collapsing restores the same compact row",
      );
    } else {
      await expect(page.locator("#hymn-mode")).toBeVisible();
      await expect(page.locator("#hymn-size")).toBeVisible();
      await expect(page.locator("#hymn-tempo")).toBeVisible();
    }
  }

  await page.setViewportSize(iphone14Pro.viewport);
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-tempo", "195");
  await page.locator("#hymn-tempo-up").click();
  await expect(page.locator("#hymn-tempo")).toHaveValue("200 BPM");
  await expect(page.locator("#hymn-tempo-up")).toBeDisabled();
  await page.locator("#hymn-tempo-down").click();
  await expect(page.locator("#hymn-tempo")).toHaveValue("195 BPM");
  await practiceOption(page, "#hymn-size", "79");
  await page.locator("#hymn-size-up").click();
  await expect(page.locator("#hymn-size")).toHaveValue("80 px");
  await expect(page.locator("#hymn-size-up")).toBeDisabled();
  await page.locator("#hymn-size-down").click();
  await expect(page.locator("#hymn-size")).toHaveValue("79 px");
  await practiceOption(page, "#hymn-mode", "wait");
  await expect(page.locator("#hymn-tempo-up")).toBeDisabled();
  await expect(page.locator("#hymn-tempo-down")).toBeDisabled();
  await page.setViewportSize(macBookAir13.viewport);
  await expect(page.locator("#hymn-size")).toHaveValue("79 px");
  await expect(page.locator('header [data-direction="up"]')).toHaveCount(2);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: SongAlong drawer geometry/focus, MIDI blocking, playback pause, constant piano widths, hand constraints and desktop restoration pass`,
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(home, { recursive: true, force: true }).catch((error) => {
    if (!["EACCES", "EPERM"].includes(error.code)) throw error;
  });
}
