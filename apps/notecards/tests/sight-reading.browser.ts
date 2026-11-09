import { chromium, firefox, webkit } from "playwright";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import hymns from "../src/hymns.json";
const engine = process.env.TEST_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4341";
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
if (!process.env.TEST_BASE_URL) {
  const root = new URL("../dist/", import.meta.url);
  const pack = JSON.parse(
    await readFile(new URL("offline-pack.json", root), "utf8"),
  );
  for (const file of pack.files) {
    const bytes = await readFile(
      new URL(file.url === "/" ? "index.html" : file.url.slice(1), root),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      "Offline integrity: " + file.url,
    );
  }
}
const fixed = await mkdtemp(join(tmpdir(), "notecards-sight-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await browserType.launch({
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
  await page.locator("#mode").selectOption("sight");
  await page.locator(".hymn-count").filter({ hasText: /\d/ }).waitFor();
  await page.locator("#hymn-length").selectOption("0");
  assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
  assert.equal(await page.evaluate(() => (window as any).midiTest.calls()), 0);
  const input = page.getByRole("combobox", { name: "Hymn", exact: true });
  const choose = async (title: string) => {
    await input.click();
    await input.fill(title);
    await page.locator("#hymn-results [role=option]").first().waitFor();
    await input.press("ArrowDown");
    await input.press("Enter");
    assert.equal(await page.locator(".hymn-title").textContent(), title);
  };
  // A second search must replace the selected title, even while the input still has focus.
  await choose("Amazing Grace");
  await input.click();
  await input.pressSequentially("silent");
  assert.equal(await input.inputValue(), "silent");
  await input.press("Enter");
  assert.equal(await page.locator(".hymn-title").textContent(), "Silent Night");
  await choose("Amazing Grace");
  const send = async (data: number[], stale = false) =>
    page.evaluate(
      ({ data, stale }) =>
        (window as any).midiTest.send(
          data,
          "roland",
          stale ? 0 : performance.now(),
        ),
      { data, stale },
    );
  const on = (n: number) => send([0x90, n, 100]);
  const off = (n: number) => send([0x80, n, 0]);
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
  const feedbackBoxBefore = await page.locator(".hymn-feedback").boundingBox();
  await on(61);
  assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
  assert.match(
    (await page.locator(".hymn-feedback").textContent())!,
    /You played C♯4 \/ D♭4; play D4/,
  );
  const feedbackBoxAfter = await page.locator(".hymn-feedback").boundingBox();
  assert.equal(
    feedbackBoxAfter!.height,
    feedbackBoxBefore!.height,
    "Feedback must not move the controls",
  );
  assert.equal(
    await page.locator(".hymn-feedback").getAttribute("data-kind"),
    "wrong",
  );
  assert.equal(
    await page.locator(".hymn-feedback").getAttribute("aria-atomic"),
    "true",
  );
  assert.ok(
    await page
      .locator(".hymn-feedback")
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 14),
  );
  await off(61);
  await send([0x90, 62, 100], true);
  assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
  await off(62);
  await on(62);
  await on(67); // Legato: the D remains physically held.
  assert.equal(await page.locator(".hymn-count").textContent(), "3 / 35");
  await page.locator(".hymn-pause").click();
  await on(71);
  assert.equal(await page.locator(".hymn-count").textContent(), "3 / 35");
  await page.locator(".hymn-pause").click();
  await on(71);
  assert.equal(await page.locator(".hymn-count").textContent(), "3 / 35");
  await off(71);
  await on(71);
  assert.equal(await page.locator(".hymn-count").textContent(), "4 / 35");
  for (const n of [62, 67, 71]) await off(n);
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator(".hymn-count").filter({ hasText: "4 / 35" }).waitFor();
  await page.locator(".hymn-keyboard-toggle").click();
  await page.locator('.hymn-piano [data-piano="67"]').click();
  assert.equal(await page.locator(".hymn-count").textContent(), "5 / 35");
  await page.locator("#hymn-arrangement").selectOption("original");
  const initial = await page.locator(".hymn-count").textContent();
  assert.match(initial!, /^1 \/ /);
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor();
  for (const n of [43, 55, 59]) await on(n);
  assert.equal(await page.locator(".hymn-count").textContent(), initial);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.waitForTimeout(200);
  await on(62);
  assert.match((await page.locator(".hymn-count").textContent())!, /^2 \/ /);
  for (const n of [43, 55, 59, 62]) await off(n);
  await page.locator(".hymn-restart").click();
  for (const n of [43, 55, 59, 62]) {
    const key = page.locator(`.hymn-piano [data-piano="${n}"]`);
    const box = await key.boundingBox();
    await key.click({ position: { x: box!.width / 2, y: box!.height * 0.85 } });
  }
  assert.match((await page.locator(".hymn-count").textContent())!, /^2 \/ /);
  assert.equal(await page.locator(".sight-key-selected").count(), 0);
  // All songs in both arrangements must render with lyrics, at desktop and phone widths.
  for (const width of [2048, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const chords of [false, true]) {
      await page
        .locator("#hymn-arrangement")
        .selectOption(chords ? "original" : "melody");
      for (const hymn of hymns) {
        await choose(hymn.title);
        await page.locator(".hymn-restart").click();
        assert.match(
          (await page.locator(".hymn-count").textContent())!,
          /^1 \/ [1-9]\d*$/,
        );
        assert.ok(
          (await page.locator(".hymn-paper .abcjs-lyric").count()) > 0,
          hymn.title,
        );
        assert.ok(
          (await page.locator(".sight-current").count()) > 0,
          hymn.title,
        );
        assert.equal(
          await page
            .locator(".hymn-score")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          true,
          hymn.title,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          hymn.title,
        );
        assert.doesNotMatch(
          (await page.locator(".hymn-feedback").textContent())!,
          /couldn’t/,
        );
        if (hymn.id === "praise-god-from-whom-all-blessings-flow") {
          const crowded = await page
            .locator(".abcjs-lyric")
            .evaluateAll((els) => {
              const words = els
                .filter((e) => e.textContent?.trim())
                .map((e) => ({
                  text: e.textContent!,
                  box: e.getBoundingClientRect(),
                }));
              const collisions: string[] = [];
              for (let i = 1; i < words.length; i++) {
                const previous = words[i - 1],
                  current = words[i];
                if (
                  Math.abs(previous.box.y - current.box.y) < 2 &&
                  current.box.x - previous.box.right < 4
                )
                  collisions.push(
                    previous.text +
                      " / " +
                      current.text +
                      ": " +
                      (current.box.x - previous.box.right),
                  );
              }
              return collisions;
            });
          assert.deepEqual(
            crowded,
            [],
            `Lyric spacing at ${width}px, chords=${chords}`,
          );
        }
      }
    }
  }
  await input.click();
  await input.fill("zzzzzz");
  await page.getByText("No hymns found. Try another title.").waitFor();
  await input.press("Escape");
  assert.equal(await input.getAttribute("aria-expanded"), "false");
  await input.click();
  await input.fill("doxology");
  await input.press("Enter");
  assert.equal(
    await page.locator(".hymn-title").textContent(),
    "Praise God From Whom All Blessings Flow",
  );
  await choose("Amazing Grace");
  await page.locator("#hymn-arrangement").selectOption("melody");
  await page.locator(".hymn-keyboard-toggle").click(); // close to keep the review screenshot focused on the score
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/sight-reading-${engine}-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.screenshot({
    path: `work/sight-reading-${engine}-desktop.png`,
    fullPage: true,
  });
  // Complete the melody, including ties: first D, then this known transcription.
  const sequence = [
    62, 67, 71, 67, 71, 69, 67, 64, 62, 62, 67, 71, 67, 71, 69, 74, 71, 74, 71,
    74, 71, 67, 62, 64, 67, 67, 64, 62, 62, 67, 71, 67, 71, 69, 67,
  ];
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .count()
    .then(async (n) => {
      if (
        n &&
        (await page
          .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
          .isVisible())
      )
        await page
          .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
          .click();
    });
  for (const n of sequence) {
    await on(n);
    await off(n);
  }
  assert.equal(await page.locator(".hymn-count").textContent(), "Complete");
  await page.locator(".hymn-next").click();
  assert.equal(
    await page.locator(".hymn-title").textContent(),
    "Jesus Loves Me",
  );
  // New feature and its entire library are available offline, including lazy-loaded code.
  if (!process.env.TEST_BASE_URL) {
    await page.waitForFunction(
      () =>
        document.querySelector("#offline-status")?.textContent ===
        "Available offline",
    );
    await context.setOffline(true);
    await page.reload();
    await page
      .locator(".hymn-title")
      .filter({ hasText: "Jesus Loves Me" })
      .waitFor();
    await choose("Amazing Grace");
    assert.equal(
      await page.locator(".hymn-count").textContent(),
      "Complete",
      "completed bookmark survives offline reload",
    );
    await page.locator(".hymn-restart").click();
    assert.equal(await page.locator(".hymn-count").textContent(), "1 / 35");
    await context.setOffline(false);
    // A fresh tab can enter hymns for the first time offline: not merely reuse an in-memory module.
    const cold = await browser.newContext();
    const firstUse = await cold.newPage();
    await firstUse.goto(base);
    await firstUse.waitForFunction(
      () =>
        document.querySelector("#offline-status")?.textContent ===
        "Available offline",
    );
    await cold.setOffline(true);
    await firstUse.locator("#mode").selectOption("sight");
    await firstUse.locator(".hymn-count").filter({ hasText: /\d/ }).waitFor();
    await firstUse.locator("#hymn-length").selectOption("0");
    await firstUse
      .locator(".hymn-count")
      .filter({ hasText: "1 / 35" })
      .waitFor();
    await cold.close();
    await page.bringToFront();
  }
  await page.locator("#mode").selectOption("piano");
  await page.locator("#piano [data-piano]").first().waitFor();
  assert.ok(await page.locator("#midi-panel").isVisible());
  assert.ok(await page.locator("#sight-reading").isHidden());
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: hymn search, all 40 scores at desktop/mobile widths, MIDI legato/chords, pause, reload, completion and offline passed.`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can protect the browser-created Downloads directory even after exit.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
