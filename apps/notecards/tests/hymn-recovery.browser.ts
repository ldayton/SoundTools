import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { midiAction, openPracticeOptions } from "./navigation-helpers";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:4358";
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [
        vite,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4358",
        "--strictPort",
      ],
      { stdio: "ignore" },
    );
const fixed = await mkdtemp(join(tmpdir(), "hymn-recovery-"));
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await { chromium, firefox, webkit }[
    process.env.TEST_BROWSER || "chromium"
  ]!.launch({ env: { ...process.env, CFFIXED_USER_HOME: fixed } });
  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
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
    await page.goto(
      base +
        "/piano/hymns/amazing-grace?arrangement=bass&hands=both&view=both&mode=wait&key=original",
    );
    await page.locator(".hymn-count").filter({ hasText: "1 /" }).waitFor();
    await openPracticeOptions(page);
    const show = await page.locator(".hymn-view-field").boundingBox(),
      practice = await page.locator(".hymn-hands-field").boundingBox();
    assert.ok(show && practice);
    assert.equal(show.y, practice.y);
    assert.ok(show.x < practice.x);
    const ties = page.getByRole("checkbox", {
      name: "Re-strike tied notes",
      exact: true,
    });
    assert.equal(await ties.isChecked(), false);
    const tieCount = await page.locator(".hymn-paper .abcjs-tie").count();
    assert.ok(tieCount > 0);
    await midiAction(page, "Connect MIDI keyboard");
    await page
      .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
      .waitFor({ state: "attached" });
    const send = (n: number, on = true) =>
      page.evaluate(
        ({ n, on }) =>
          (window as any).midiTest.send([on ? 0x90 : 0x80, n, on ? 100 : 0]),
        { n, on },
      );
    const note = async (n: number) => {
      await send(n);
      await send(n, false);
    };
    const step = async () =>
      Number(
        (await page.locator(".hymn-count").textContent())?.split(" / ")[0],
      );
    await send(43);
    await note(62);
    assert.equal(await step(), 2);
    await note(66);
    assert.equal(await step(), 2);
    await send(43, false);
    await send(67);
    assert.equal(
      await step(),
      2,
      "the melody alone cannot finish a retry over carried bass",
    );
    assert.ok(
      await page.locator('.hymn-piano [data-piano="43"].is-right').count(),
    );
    await send(43);
    assert.equal(await step(), 3);
    await send(67, false);
    await note(71);
    assert.equal(
      await step(),
      4,
      "normal progress does not need another bass strike",
    );
    await send(43, false);
    await openPracticeOptions(page);
    await ties.check();
    assert.match(page.url(), /ties=repeat/);
    assert.equal(await step(), 1);
    assert.equal(
      await page.locator(".hymn-paper .abcjs-tie").count(),
      tieCount,
      "tie notation stays visible",
    );
    await send(43);
    await note(62);
    assert.equal(await step(), 2);
    await send(67);
    assert.equal(
      await step(),
      2,
      "a written continuation requires another bass attack when enabled",
    );
    await send(43, false);
    await send(43);
    assert.equal(await step(), 3);
    await send(67, false);
    await send(43, false);
    await page
      .getByRole("combobox", { name: "Practise hands", exact: true })
      .selectOption("right");
    await note(62);
    assert.equal(await step(), 2);
    await note(66);
    await note(67);
    assert.equal(
      await step(),
      3,
      "right-hand-only retry does not ask for the unpractised bass",
    );
    await page.reload();
    await openPracticeOptions(page);
    assert.equal(await ties.isChecked(), true);
    assert.equal(await page.locator("#hymn-hands").inputValue(), "right");
    await page.setViewportSize({ width: 390, height: 844 });
    await openPracticeOptions(page);
    const alignment = await ties.evaluate((el) => {
      const input = el.getBoundingClientRect();
      const label = document
        .querySelector(`label[for="${el.id}"]`)!
        .getBoundingClientRect();
      return {
        labelToRight: label.left >= input.right,
        verticallyAligned:
          Math.abs((label.top + label.bottom - input.top - input.bottom) / 2) <
          2,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.deepEqual(alignment, {
      labelToRight: true,
      verticallyAligned: true,
      overflow: false,
    });
    await page.screenshot({ path: "/tmp/hymn-recovery-mobile.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: hand controls share a row; MIDI retries recover sustained bass; optional tied attacks preserve engraving; single-hand scope, persistence and mobile checkbox alignment",
    );
  } finally {
    await browser.close();
  }
} finally {
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can protect browser-created Downloads after the browser exits.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
