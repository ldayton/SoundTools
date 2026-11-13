import {
  selectPractice,
  practiceOption,
  midiAction,
  closePracticeOptions,
  openPracticeOptions,
  setPianoVisible,
} from "./navigation-helpers";
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
  await selectPractice(page, "sight");
  await page.locator(".hymn-paper svg").first().waitFor();
  const sidebarToggle = page.locator("#sight-reading .options-toggle");
  assert.equal(
    await sidebarToggle.getAttribute("aria-expanded"),
    "true",
    "options default open",
  );
  const initialTask = (await page.locator(".sequence-practice").boundingBox())!;
  const initialToggle = (await sidebarToggle.boundingBox())!;
  await closePracticeOptions(page);
  const collapsedTask = (await page
    .locator(".sequence-practice")
    .boundingBox())!;
  const collapsedToggle = (await sidebarToggle.boundingBox())!;
  assert.equal(
    collapsedTask.y,
    initialTask.y,
    "collapse does not move exercise down",
  );
  assert.ok(
    Math.abs(collapsedToggle.x - initialToggle.x) < 2,
    "right toggle stays docked",
  );
  assert.equal(collapsedToggle.y, initialToggle.y);
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  assert.ok(
    await page.locator(".app-sidebar").evaluate((e: HTMLElement) => e.inert),
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  assert.ok(
    !(await page.locator(".app-sidebar").evaluate((e: HTMLElement) => e.inert)),
  );
  await openPracticeOptions(page);

  await practiceOption(page, "#hymn-length", "2");
  await page.waitForFunction(() => {
    const score = document.querySelector<HTMLElement>(".sequence-score")!;
    const paper = document.querySelector<HTMLElement>(".hymn-paper")!;
    return (
      paper.clientHeight > 0 && score.clientHeight <= paper.clientHeight + 2
    );
  });
  const options = await page
    .locator(".practice-options")
    .boundingBox();
  const practice = await page
    .locator("#sight-reading .sequence-practice")
    .boundingBox();
  assert.ok(
    options!.x >= practice!.x + practice!.width,
    "desktop options sit to the right of the music",
  );
  assert.ok(
    Math.abs(practice!.y - options!.y) < 2,
    "options do not push music down",
  );
  const transport = await page
    .locator(".sequence-transport:visible")
    .boundingBox();
  assert.ok(
    transport!.y + transport!.height < 1000,
    "short scores keep transport on screen",
  );
  await practiceOption(page, "#hymn-length", "0");
  await closePracticeOptions(page);
  assert.ok(
    (await page.locator(".sequence-score").boundingBox())!.y < 340,
    "music begins near the top beneath its instruction",
  );
  await setPianoVisible(page, true);
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
  await practiceOption(page, '[aria-label="Score size"]', "1.2");
  assert.equal(await page.locator(".hymn-paper .abcjs-note").count(), notes);
  assert.equal(await page.locator(".hymn-count").textContent(), count);
  await practiceOption(page, '[aria-label="Score size"]', "1");
  await closePracticeOptions(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(
    await sidebarToggle.getAttribute("aria-expanded"),
    "false",
    "mobile options start closed independently of desktop",
  );
  const mobileToggle = (await sidebarToggle.boundingBox())!;
  const mobilePanel = (await page
    .locator(".practice-options")
    .boundingBox())!;
  assert.ok(
    Math.abs(mobileToggle.width - mobilePanel.width) < 1,
    "mobile label uses the full row",
  );
  assert.ok(await sidebarToggle.locator(".options-toggle-label").isVisible());
  await sidebarToggle.click();
  assert.equal(await sidebarToggle.getAttribute("aria-expanded"), "true");
  assert.ok(
    await page.locator(".practice-options-content").isVisible(),
  );
  await sidebarToggle.click();
  assert.equal(await sidebarToggle.getAttribute("aria-expanded"), "false");
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
  const feedback = await page.locator(".sequence-feedback").boundingBox();
  const keyboard = await page.locator(".hymn-piano").boundingBox();
  const scoreBox = (await page.locator(".sequence-score").boundingBox())!;
  assert.ok(feedback!.height <= 64, "phone alert is compact");
  assert.ok(
    feedback!.y + feedback!.height <= scoreBox.y,
    "instruction is above the score",
  );
  assert.ok(
    Math.abs(
      feedback!.x + feedback!.width / 2 - scoreBox.x - scoreBox.width / 2,
    ) < 2,
    "instruction is centered over the score",
  );
  assert.ok(
    keyboard!.y -
      (await page.locator(".sequence-transport:visible").boundingBox())!.y -
      (await page.locator(".sequence-transport:visible").boundingBox())!
        .height <
      48,
    "keyboard follows the shared controls",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no horizontal page overflow",
  );
  await practiceOption(page, "#hymn-arrangement", "original");
  await page.waitForTimeout(300);
  assert.ok(
    (await page.locator(".hymn-paper .abcjs-staff").count()) > 1,
    "grand staff renders",
  );
  assert.match((await page.locator(".hymn-range-hint").textContent())!, /G2/);
  assert.ok(await page.locator(".hymn-range-hint").isVisible());
  await closePracticeOptions(page);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.waitForTimeout(300);
  assert.equal(
    (await page.locator(".hymn-piano .white-key").first().boundingBox())!.width,
    keyWidth,
  );
  await selectPractice(page, "piano");
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
  await closePracticeOptions(page);
  await page.waitForFunction(
    () => document.querySelectorAll("#piano [data-piano]").length === 60,
  );
  assert.ok(
    await page.locator("#piano-midi-required").isHidden(),
    "visible C2 must be playable",
  );
  assert.ok(
    (await page.locator("#notation").boundingBox())!.height < 560,
    "extreme ledger range fits without shrinking the staff",
  );
  const question = await page.locator("#notation").innerHTML();
  const position = await page.locator("#counter").textContent();
  await closePracticeOptions(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#piano-midi-required").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#notation").innerHTML(),
    question,
    "resize retains exact written representation",
  );
  assert.equal(await page.locator("#counter").textContent(), position);
  await closePracticeOptions(page);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.locator("#piano-midi-required").waitFor({ state: "hidden" });
  await page
    .locator('#piano [data-piano="36"]')
    .click({ position: { x: 18, y: 110 } });
  assert.equal(await page.locator("#feedback").textContent(), "Yes — C2");
  // Both engraving engines use the same physical staff size in every view.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ["piano", "staff", "signature", "patterns", "sight"]) {
      await selectPractice(page, mode);
      const gap = await page.waitForFunction(() => {
        const svg = [
          ...document.querySelectorAll<SVGSVGElement>("#exercise-content svg"),
        ].find(
          (s) =>
            s.getBoundingClientRect().width > 0 &&
            s.querySelector(".vf-stave,.abcjs-staff"),
        );
        if (!svg) return false;
        const lines = [
          ...svg.querySelectorAll<SVGGraphicsElement>(
            ".vf-stave path,.abcjs-staff path",
          ),
        ].filter((p) => {
          const b = p.getBBox();
          return b.width > 100 && b.height < 2;
        });
        if (lines.length < 2) return false;
        const measured =
          lines[1].getBoundingClientRect().y -
          lines[0].getBoundingClientRect().y;
        return Math.abs(measured - 10) < (innerWidth <= 360 ? 0.4 : 0.15)
          ? measured
          : false;
      });
      assert.ok(
        await gap.jsonValue(),
        `${width}px ${mode}: staff-line spacing is 10px`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
  }
  await setPianoVisible(page, false);
  await selectPractice(page, "patterns");
  assert.equal(
    await page.locator(".piano-toggle:visible").getAttribute("aria-expanded"),
    "false",
  );
  assert.ok(
    await page.locator("#patterns-practice .practice-piano").isHidden(),
  );
  await setPianoVisible(page, true);
  await selectPractice(page, "sight");
  assert.equal(
    await page.locator(".piano-toggle:visible").getAttribute("aria-expanded"),
    "true",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator(".hymn-paper svg").first().waitFor();
  assert.equal(
    await page.locator(".piano-toggle:visible").getAttribute("aria-expanded"),
    "true",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Responsive score, keyboard, note/lyric preservation and compact feedback passed",
  );
} finally {
  await browser.close();
  server?.kill();
}
