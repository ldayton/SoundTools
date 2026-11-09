import { savedProgress } from "./persistence-helper";
import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4327";
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
const fixed = await mkdtemp(join(tmpdir(), "notecards-piano-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server && server.exitCode !== null) throw Error("Preview exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await type.launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  await context.addInitScript(() => (Math.random = () => 0));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await page.locator("#mode").selectOption("piano");
  const key = (midi: number) => page.locator(`[data-piano="${midi}"]`);
  const ready = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector("[data-piano]")
          ?.getAttribute("aria-disabled") === "false",
    );
  assert.equal(await page.locator("#context").textContent(), "Piano · C major");
  assert.ok((await page.locator(".piano-key").count()) > 24);
  assert.equal(
    (await page.locator(".white-key").first().boundingBox())!.width,
    36,
  );
  assert.ok((await page.locator(".black-key").count()) > 10);
  assert.ok(await page.locator("#fretboard").isHidden());
  assert.ok(await page.locator(".keyboard").isHidden());
  const rowBoxes = await page.locator(".piano-octave").evaluateAll((els) =>
    els.map((e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width };
    }),
  );
  assert.equal(rowBoxes.length, 1);
  await key(72).click(); // C5 is not C4 in staff mode.
  assert.match((await page.locator("#feedback").textContent())!, /That’s C4/);
  assert.ok(await key(60).evaluate((e) => e.classList.contains("is-right")));
  assert.ok(await key(72).evaluate((e) => e.classList.contains("is-wrong")));
  await ready();
  assert.equal(
    await page.locator(".is-right,.is-wrong,.answer-hover").count(),
    0,
  );
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#pianoPrompt").selectOption("name");
  assert.equal(await page.locator(".piano-key").count(), 12);
  assert.equal(await page.locator("#target-name").textContent(), "C");
  assert.ok(await page.locator("#notation").isHidden());
  assert.ok(await page.locator("#pitch-range").isHidden());
  await page.evaluate(() => (Math.random = () => 0.999999));
  await page.locator("#key").selectOption("Bb");
  assert.equal(await page.locator("#target-name").textContent(), "B♭");
  await key(70).click(); // The same physical key answers A-sharp and B-flat.
  assert.match((await page.locator("#feedback").textContent())!, /Yes — B♭/);
  await ready();
  assert.equal(
    await page.locator(".is-right,.is-wrong,.answer-hover").count(),
    0,
  );
  await page.evaluate(() => (Math.random = () => 0));
  const saved = await savedProgress(page);
  assert.equal(saved.profiles.piano.pianoPrompt, "name");
  await page.reload();
  await ready();
  assert.equal(await page.locator("#pianoPrompt").inputValue(), "name");
  assert.equal(await page.locator("#key").inputValue(), "Bb");
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#pianoPrompt").selectOption("staff");
  await page.locator("#low-spin").click();
  await page
    .locator("#low-spin-picker")
    .getByRole("button", { name: "B5", exact: true })
    .click();
  await page.locator("#high-spin").click();
  await page
    .locator("#high-spin-picker")
    .getByRole("button", { name: "B5", exact: true })
    .click();
  assert.equal(await key(82).count(), 1);
  await key(82).click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — B♭5/);
  await ready();
  // Staff and name profiles do not share review history.
  assert.ok((await savedProgress(page)).stats["piano-staff:B5:-1"]);
  await page.locator("#low-spin").click();
  await page
    .locator("#low-spin-picker")
    .getByRole("button", { name: "C4", exact: true })
    .click();
  await page.locator("#key").selectOption("C");
  await page.getByText("Practice options", { exact: true }).click();
  await mkdir("../../work", { recursive: true });
  await page.screenshot({
    path: `../../work/piano-desktop-${engine}.png`,
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(
      () => document.querySelectorAll(".piano-octave").length === 2,
    );
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      rows: [...document.querySelectorAll(".piano-octave")].map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, bottom: b.bottom };
      }),
      blackWidth: document.querySelector(".black-key")!.getBoundingClientRect()
        .width,
    }));
    assert.ok(dimensions.page <= dimensions.viewport);
    assert.equal(dimensions.rows[0].x, dimensions.rows[1].x);
    assert.ok(dimensions.rows[1].y > dimensions.rows[0].bottom);
    assert.ok(dimensions.blackWidth >= 24);
    // Click through actual black/white geometry near the overlap, not just button centers.
    const black = await key(61).boundingBox();
    assert.ok(black);
    await page.mouse.click(black!.x + black!.width / 2, black!.y + 15);
    assert.ok(await key(61).evaluate((e) => e.classList.contains("is-wrong")));
    await ready();
    await page.screenshot({
      path: `../../work/piano-mobile-${width}-${engine}.png`,
      fullPage: true,
    });
  }
  // Keyboard answers, no held-key duplicates and no carryover focus/selection.
  await key(60).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await key(61).evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  await ready();
  assert.equal(
    await key(60).evaluate((e) => e === document.activeElement),
    true,
  );
  // The new mode is available from the same cached shell while disconnected.
  await page.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  const beforeOffline = await page.locator("#counter").textContent();
  await context.setOffline(true);
  await page.reload();
  await ready();
  assert.equal(await page.locator("#mode").inputValue(), "piano");
  assert.equal(await page.locator("#counter").textContent(), beforeOffline);
  await page.locator("#restart-round").click();
  await key(60).click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — C4/);
  await context.setOffline(false);
  await page.locator("#mode").selectOption("staff");
  assert.ok(await page.locator("#piano").isHidden());
  assert.equal(await page.locator("#low").inputValue(), "E3");
  await page.locator('[data-letter="E"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — E/);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: piano exact octaves, accidentals, responsive geometry, keyboard input, persistence and guitar regression passed`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS may protect the browser-created Downloads directory.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
