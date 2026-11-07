import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const name = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[name];
if (!type) throw Error("Unknown browser");
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const port = process.env.TEST_PORT || "4322";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}/`;
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
let browser;
const fixed = await mkdtemp(join(tmpdir(), "notecards-browser-"));
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
  await context.addInitScript(() => {
    Math.random = () => 0;
  });
  const page = await context.newPage(),
    errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(base);
  const ready = () => page.locator('[data-letter="E"]:enabled').waitFor();
  const next = () =>
    page.waitForFunction(() =>
      [
        "Name the highlighted note.",
        "Name this note.",
        "Find this note.",
      ].includes(document.querySelector("#feedback")?.textContent || ""),
    );
  await ready();
  assert.equal(await page.locator("#mode").inputValue(), "staff");
  await page.locator("#mode").selectOption("name");
  assert.equal(
    await page.locator('[data-string-toggle][aria-pressed="true"]').count(),
    6,
  );
  assert.equal(await page.locator("#nameNotes").inputValue(), "all");
  assert.ok(await page.locator("#key").isHidden());
  await page.getByText("Practice options", { exact: true }).click();
  for (const string of [1, 2, 3, 4, 5])
    await page.locator(`[data-string-toggle="${string}"]`).click();
  await page.locator("#minFret").selectOption("2");
  await page.locator("#maxFret").selectOption("2");
  await page.getByRole("button", { name: "Flat", exact: true }).click();
  await page.locator('[data-letter="G"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F♯/);
  await next();
  await page.locator("#nameNotes").selectOption("naturals");
  assert.match(
    (await page.locator("#feedback").textContent())!,
    /No natural notes/,
  );
  await page.locator("#nameNotes").selectOption("all");
  await ready();
  await page.getByRole("button", { name: "Sharp", exact: true }).click();
  await page.locator('[data-letter="F"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F♯/);
  await page.locator("#minFret").selectOption("0");
  await page.locator("#maxFret").selectOption("5");
  await page.locator("#nameNotes").selectOption("naturals");
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator('[data-letter="E"]').focus();
  assert.equal(
    await page.locator(".is-target").getAttribute("aria-label"),
    "Highlighted: String 6, open",
  );
  await page.keyboard.press("=");
  await page.keyboard.press("E");
  assert.match((await page.locator("#feedback").textContent())!, /That’s E/);
  await page.keyboard.press("F");
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  await next();
  await page.keyboard.press("F");
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F/);
  await next();
  await page.locator("#mode").selectOption("find");
  await page.locator('[data-fret="1"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /E is open/);
  assert.equal(await page.locator('[data-fret="0"]').textContent(), "✓");
  assert.equal(await page.locator('[data-fret="1"]').textContent(), "×");
  await next();
  await page.locator('[data-fret="0"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-fret"),
    ),
    "1",
  );
  await page.keyboard.down("Enter");
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F/);
  await next();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-fret"),
    ),
    "0",
  );
  await page.keyboard.down("Enter"); // Repeat event after the next card is ready.
  assert.equal(await page.locator("#progress").getAttribute("value"), "2");
  await page.keyboard.up("Enter");
  // Complete a fresh location session using the known C-major low-E positions.
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#maxFret").selectOption("4");
  await page.locator("#maxFret").selectOption("5");
  const frets: Record<string, number> = { E: 0, F: 1, G: 3, A: 5 };
  for (let i = 0; i < 12; i++) {
    const note = (await page.locator("#target-name").textContent())!;
    await page.locator(`[data-fret="${frets[note]}"]`).click();
    if (i < 11) await next();
  }
  await page.locator("#continue").waitFor();
  assert.equal(await page.locator("#result").textContent(), "12 of 12 correct");
  await page.locator("#continue").click();
  assert.equal(await page.locator("#progress").getAttribute("value"), "0");
  await page.locator("#mode").selectOption("tab");
  await ready();
  assert.equal(await page.locator(".vf-tabnote").count(), 1);
  await page.keyboard.press("E");
  assert.match((await page.locator("#feedback").textContent())!, /Yes — E/);
  await next();
  await page.locator("#mode").selectOption("staff-find");
  assert.equal(await page.locator(".vf-stavenote").count(), 1);
  await page.locator('[data-fret="0"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes/);
  await next();
  await page.locator("#mode").selectOption("staff");
  await ready();
  assert.equal(await page.locator("#low").inputValue(), "E3");
  await page.locator("#key").selectOption("G");
  await ready();
  await page.keyboard.press("E");
  await next();
  await page.keyboard.press("+");
  await page.keyboard.press("F");
  assert.match((await page.locator("#feedback").textContent())!, /Yes — F♯/);
  // Find supports every octave of the target; staff-to-fretboard accepts only the exact pitch.
  await page.locator("#mode").selectOption("find");
  await page.locator("#maxFret").selectOption("12");
  await page.getByRole("button", { name: "Higher frets" }).click();
  await page.getByRole("button", { name: "Higher frets" }).click();
  await page.locator('[data-fret="12"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /Yes — E/);
  await next();
  await page.locator("#mode").selectOption("staff-find");
  await page.locator("#maxFret").selectOption("12");
  await page.getByRole("button", { name: "Higher frets" }).click();
  await page.getByRole("button", { name: "Higher frets" }).click();
  await page.locator('[data-fret="12"]').click();
  assert.match((await page.locator("#feedback").textContent())!, /E is open/);
  await next();
  // Empty key/string/fret combinations in keyed modes recover without getting stuck.
  await page.locator("#mode").selectOption("find");
  await page.locator("#key").selectOption("G");
  await page.locator("#minFret").selectOption("1");
  await page.locator("#maxFret").selectOption("1");
  assert.match((await page.locator("#feedback").textContent())!, /No notes/);
  assert.ok(await page.locator('[data-letter="E"]').isDisabled());
  await page.locator("#maxFret").selectOption("5");
  await next();
  await page.locator("#maxFret").selectOption("12");
  assert.ok(await page.locator('[data-string-toggle="6"]').isDisabled());
  assert.equal(
    await page.locator('[data-string-toggle="6"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator('[data-string-toggle="5"]').click();
  assert.equal(
    await page.locator('[data-string-toggle="5"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#mode").selectOption("find");
  assert.equal(await page.locator("#maxFret").inputValue(), "12");
  await page.reload();
  await page.locator("[data-fret]").first().waitFor();
  assert.equal(await page.locator("#mode").inputValue(), "find");
  await mkdir("work", { recursive: true });
  for (const mode of ["name", "find", "tab", "staff-find", "staff"]) {
    await page.locator("#mode").selectOption(mode);
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      mode + " fits mobile",
    );
    if (mode === "find" || mode === "staff-find")
      for (const button of await page.locator("[data-fret]").all()) {
        const b = await button.boundingBox();
        assert.ok(b && b.width >= 40 && b.height >= 44, "Touch target fits");
      }
    await page.screenshot({
      path: `work/guitar-${name}-${mode}-mobile.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator("#mode").selectOption("name");
  await page.screenshot({
    path: `work/guitar-${name}-desktop.png`,
    fullPage: true,
  });
  // Extreme key spelling: high-E fret 12 is F-flat in C-flat major, written F-flat6.
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#mode").selectOption("staff-find");
  await page.locator('[data-string-toggle="1"]').click();
  await page.locator('[data-string-toggle="6"]').click();
  await page.locator("#minFret").selectOption("12");
  await page.locator("#key").selectOption("Cb");
  const edge = await page.locator(".vf-stavenote rect").evaluate((rect) => ({
    top: Number(rect.getAttribute("y")) * 2.2,
    bottom:
      (Number(rect.getAttribute("y")) + Number(rect.getAttribute("height"))) *
      2.2,
  }));
  assert.ok(
    edge.top >= -25 && edge.bottom <= 300,
    "Extreme spelling stays inside the SVG",
  );
  await page.screenshot({
    path: `work/guitar-${name}-high-ledger.png`,
    fullPage: true,
  });
  // A backgrounded correction must not consume another card.
  await page.locator("#mode").selectOption("name");
  await page.locator("#minFret").selectOption("0");
  await ready();
  await page.evaluate(
    "Object.defineProperty(document, 'hidden', {configurable:true,get:()=>true})",
  );
  await page.locator('[data-letter="E"]').click();
  await page.waitForTimeout(1800);
  assert.equal(await page.locator("#counter").textContent(), "1 / 12");
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  await page.evaluate(
    "Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))",
  );
  await next();
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  await page.locator("#roundLength").selectOption("24");
  await page.locator("#maxFret").selectOption("0");
  assert.equal(await page.locator("#counter").textContent(), "1 / 24");
  assert.equal(await page.locator("#progress").getAttribute("max"), "24");
  for (let i = 0; i < 24; i++) {
    await page.locator('[data-letter="E"]:enabled').click();
    if (i < 23) await next();
  }
  await page.locator("#continue").waitFor();
  assert.equal(await page.locator("#result").textContent(), "24 of 24 correct");
  await page.locator("#continue").click();
  assert.equal(await page.locator("#counter").textContent(), "1 / 24");
  await page.reload();
  await ready();
  await page.getByText("Practice options", { exact: true }).click();
  assert.equal(await page.locator("#roundLength").inputValue(), "24");
  await page.screenshot({
    path: `work/guitar-${name}-round-length.png`,
    fullPage: true,
  });
  const storageContext = await browser.newContext();
  await storageContext.addInitScript(
    "Storage.prototype.setItem = () => {throw Error('Storage unavailable');}",
  );
  const storagePage = await storageContext.newPage();
  storagePage.on("pageerror", (e) => errors.push(e.message));
  await storagePage.goto(base);
  await storagePage.locator('[data-letter="E"]:enabled').waitFor();
  await storagePage.locator('[data-letter="E"]').click();
  assert.equal(
    await storagePage.locator("#saved").textContent(),
    "Progress can’t be saved in this browser.",
  );
  await storageContext.close();
  assert.deepEqual(errors, []);
  assert.ok(
    !requests.some((u) => /googleapis|gstatic|jsdelivr/.test(u)),
    "No external font dependency",
  );
  console.log(
    `PASS ${name}: five modes, pitch/location grading, mobile windows, keyboard/touch, full session, profiles, persistence and empty ranges.`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS can protect browser-created home folders from cleanup.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
