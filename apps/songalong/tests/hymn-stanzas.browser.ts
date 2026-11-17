import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { iphone14Pro, macBookAir13 } from "../../../scripts/test-devices.cjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  openPracticeOptions,
  closePracticeOptions,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";

const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4390";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`;
const home = await mkdtemp(join(tmpdir(), "songalong-stanzas-"));
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
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  const page = await browser.newPage({
    ...macBookAir13,
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  });
  const visit = async (id: string, query = "") => {
    // Let outgoing sample preloads settle before replacing the document. WebKit
    // reports even caught, teardown-cancelled fetches as pageerror (Playwright #44015).
    // This waits for network teardown safety, not for UI readiness.
    await page.waitForLoadState("networkidle");
    await page.goto(`${base}/piano/hymns/${id}${query}`);
    await page.locator(".hymn-paper svg").first().waitFor();
    await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  };
  const lyricWords = () =>
    page.locator(".hymn-paper .abcjs-lyric").allTextContents();
  await visit("jesus-loves-me");
  const checks = page.locator("#hymn-stanzas input[type=checkbox]");
  assert.equal(await checks.count(), 3);
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [true, false, false],
  );
  const firstHeight = await page
    .locator(".hymn-paper svg")
    .first()
    .evaluate((e) => e.getBoundingClientRect().height);
  await checks.nth(1).check();
  await checks.nth(2).check();
  assert.equal(
    (await lyricWords()).filter((w) => w.trim().startsWith("Yes")).length,
    3,
    "Shared chorus appears once",
  );
  assert(
    (await page
      .locator(".hymn-paper svg")
      .first()
      .evaluate((e) => e.getBoundingClientRect().height)) > firstHeight,
    "Extra stanzas create extra lyric lines",
  );
  await checks.nth(0).uncheck();
  assert.equal(
    (await lyricWords()).filter((w) => w.trim().startsWith("Yes")).length,
    3,
    "Chorus remains when stanza one is hidden",
  );
  await page.waitForLoadState("networkidle");
  await page.reload();
  await checks.nth(2).waitFor();
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [false, true, true],
  );
  const score = page.locator(".sequence-score");
  await score.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const position = await page.locator(".hymn-count").textContent();
  await checks.nth(0).check();
  await expect(page.locator(".hymn-count")).toHaveText(position!);
  await score.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await checks.nth(0).uncheck();
  await expect(
    page.getByRole("slider", { name: "Selection end", exact: true }),
  ).toHaveAttribute("aria-valuenow", "2");
  await page.locator(".hymn-clear-passage").click();
  await practiceOption(page, "#hymn-mode", "playback");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await checks.nth(0).check();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await checks.nth(0).uncheck();
  await checks.nth(1).uncheck();
  await checks.nth(2).uncheck();
  assert.equal(await page.locator(".abcjs-lyric").count(), 0);
  await page.waitForLoadState("networkidle");
  await page.reload();
  await checks.nth(2).waitFor();
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [false, false, false],
  );
  await visit("amazing-grace");
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [true, false, false],
    "Another hymn starts with only its first stanza",
  );
  await visit("in-christ-alone", "?stanzas=3");
  await expect
    .poll(async () => (await lyricWords()).filter((w) => w.trim()).at(-1) || "")
    .toMatch(/stand/);
  const lastStanzaNotes = await page.locator(".hymn-paper .abcjs-note").count();
  await checks.nth(0).check();
  assert(
    (await page.locator(".hymn-paper .abcjs-note").count()) > lastStanzaNotes,
    "The Oh ending returns when an earlier stanza is shown",
  );
  await checks.nth(0).uncheck();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect
    .poll(async () => (await lyricWords()).filter((w) => w.trim()).at(-1) || "")
    .toMatch(/stand/);
  const references: Record<string, string> = {
    "in-christ-alone": "3ch6eXkQWU8",
    "jesus-loves-me": "-jABcYKhDrI",
    "amazing-grace": "9ZXxIyjTY1s",
    "ill-fly-away": "192W0bhJNEg",
    "o-come-all-ye-faithful": "AuwoGmsUWhU",
  };
  for (const [id, video] of Object.entries(references)) {
    await visit(id);
    await page
      .getByRole("button", { name: "About this hymn", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Reference recording", exact: true }),
    ).toHaveAttribute("href", `https://www.youtube.com/watch?v=${video}`);
  }
  for (const viewport of [macBookAir13.viewport, iphone14Pro.viewport]) {
    await page.setViewportSize(viewport);
    for (const hymn of hymns) {
      await visit(
        hymn.id,
        "?stanzas=" + hymn.stanzas.map((s) => s.number).join(","),
      );
      assert.equal(
        (await page.locator(".hymn-paper .abcjs-lyric").count()) > 0,
        true,
        hymn.id,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        hymn.id + " no page overflow",
      );
      assert.equal(
        await page.locator(".sequence-feedback.error").count(),
        0,
        hymn.id,
      );
      const collisions = await page
        .locator(".abcjs-lyric")
        .evaluateAll((es) => {
          const words = es
            .filter((e) => e.textContent?.trim())
            .map((e) => ({
              text: e.textContent!,
              box: e.getBoundingClientRect(),
            }));
          return words
            .filter(
              (w, i) =>
                i > 0 &&
                Math.abs(w.box.y - words[i - 1].box.y) < 2 &&
                w.box.x < words[i - 1].box.right - 1,
            )
            .map((w) => w.text);
        });
      assert.deepEqual(collisions, [], hymn.id + " lyric overlap");
    }
  }
  await visit("amazing-grace", "?stanzas=1,2,3");
  await openPracticeOptions(page);
  const bounds = await page.locator(".hymn-stanza-checkbox").evaluateAll((es) =>
    es.map((e) => ({
      left: e.getBoundingClientRect().left,
      right: e.getBoundingClientRect().right,
    })),
  );
  assert(
    bounds.every((b) => b.left >= 0 && b.right <= iphone14Pro.viewport.width),
    "Labels never widen the options sheet",
  );
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/hymn-stanzas-${engine}-mobile-options.png`,
  });
  await closePracticeOptions(page);
  await page.screenshot({ path: `work/hymn-stanzas-${engine}-mobile.png` });
  await page.setViewportSize(macBookAir13.viewport);
  await openPracticeOptions(page);
  await page.screenshot({ path: `work/hymn-stanzas-${engine}-desktop.png` });
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: stanza defaults, shared choruses, persistence, playback continuity, all hymn layouts, compact labels and reference links passed`,
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
