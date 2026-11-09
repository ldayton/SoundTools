import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:4347";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
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
        "4347",
        "--strictPort",
      ],
      { stdio: "ignore" },
    );
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1680, height: 1000 },
  });
  await page.addInitScript(() => (Math.random = () => 0));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await page.locator("#mode").selectOption("sight");
  await page.locator(".hymn-paper svg").first().waitFor();
  await page.locator("#hymn-length").selectOption("0");
  assert.ok(
    (await page.locator(".hymn-score").boundingBox())!.y < 300,
    "music begins near the top",
  );
  await page.locator(".hymn-keyboard-toggle").click();
  const wideCount = await page.locator(".hymn-piano [data-piano]").count();
  const keyWidth = (await page
    .locator(".hymn-piano .white-key")
    .first()
    .boundingBox())!.width;
  assert.ok(
    (await page
      .locator(".hymn-paper svg")
      .last()
      .locator(".abcjs-note")
      .count()) > 1,
    "no orphan closing note",
  );
  const notes = await page.locator(".hymn-paper .abcjs-note").count();
  const lyrics = (await page.locator(".abcjs-lyric").allTextContents())
    .join("")
    .replace(/\s/g, "");
  const count = await page.locator(".hymn-count").textContent();
  await page.getByLabel("Score size", { exact: true }).selectOption("1.2");
  assert.equal(await page.locator(".hymn-paper .abcjs-note").count(), notes);
  assert.equal(await page.locator(".hymn-count").textContent(), count);
  await page.getByLabel("Score size", { exact: true }).selectOption("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    count,
    "resize preserves bookmark",
  );
  assert.equal(
    await page.locator(".hymn-paper .abcjs-note").count(),
    notes,
    "wrapping preserves notes",
  );
  assert.equal(
    (await page.locator(".abcjs-lyric").allTextContents())
      .join("")
      .replace(/\s/g, ""),
    lyrics,
    "wrapping preserves lyrics",
  );
  assert.equal(await page.locator(".hymn-piano .piano-octave").count(), 2);
  assert.ok(
    (await page.locator(".hymn-piano [data-piano]").count()) < wideCount,
  );
  await page.locator(".hymn-piano [data-piano]").first().click();
  const feedback = await page.locator(".hymn-feedback").boundingBox();
  const keyboard = await page.locator(".hymn-piano").boundingBox();
  assert.ok(feedback!.height <= 64, "phone alert is compact");
  assert.ok(
    keyboard!.y - feedback!.y - feedback!.height < 20,
    "keyboard immediately follows feedback",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no horizontal page overflow",
  );
  await page.locator("#hymn-arrangement").selectOption("original");
  await page.waitForTimeout(300);
  assert.ok(
    (await page.locator(".hymn-paper .abcjs-staff").count()) > 1,
    "grand staff renders",
  );
  assert.match((await page.locator(".hymn-range-hint").textContent())!, /G2/);
  assert.ok(await page.locator(".hymn-range-hint").isVisible());
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.waitForTimeout(300);
  assert.equal(
    (await page.locator(".hymn-piano .white-key").first().boundingBox())!.width,
    keyWidth,
  );
  await page.locator("#mode").selectOption("piano");
  await page.getByText("Practice options", { exact: true }).click();
  for (const [field, note] of [
    ["low", "C2"],
    ["high", "B6"],
  ]) {
    await page.locator(`#${field}-spin`).click();
    await page
      .locator(`#${field}-spin-picker`)
      .getByRole("button", { name: note, exact: true })
      .click();
  }
  await page.locator("#low-spin").click();
  await page.keyboard.press("Escape");
  assert.ok(
    await page.locator("#low-spin").isVisible(),
    "Escape closes only the note picker",
  );
  await page
    .getByRole("button", { name: "Close options", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("#piano [data-piano]").length === 60,
  );
  assert.ok(
    await page.locator("#piano-midi-required").isHidden(),
    "visible C2 must be playable",
  );
  assert.ok(
    (await page.locator("#notation").boundingBox())!.height < 420,
    "single note stays bounded",
  );
  const question = await page.locator("#notation").innerHTML();
  const position = await page.locator("#counter").textContent();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#piano-midi-required").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#notation").innerHTML(),
    question,
    "resize retains exact written representation",
  );
  assert.equal(await page.locator("#counter").textContent(), position);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.locator("#piano-midi-required").waitFor({ state: "hidden" });
  await page
    .locator('#piano [data-piano="36"]')
    .click({ position: { x: 18, y: 110 } });
  assert.equal(await page.locator("#feedback").textContent(), "Yes — C2");
  assert.deepEqual(errors, []);
  console.log(
    "Responsive score, keyboard, note/lyric preservation and compact feedback passed",
  );
} finally {
  await browser.close();
  server?.kill();
}
