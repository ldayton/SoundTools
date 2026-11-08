import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const port = process.env.TEST_PORT || "4335";
const base = `http://127.0.0.1:${port}/`;
// Use the real renderer and app CSS; direct module access lets us cover every card.
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Notation test server exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator("#mode").selectOption("piano");
  await mkdir("../../work", { recursive: true });
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(async () => {
      // Vite serves the authored modules; these are the same modules the app imports.
      const { drawNotation } = await import(
        /* @vite-ignore */ String("/src/notation.ts")
      );
      const { deck, KEYS } = await import(
        /* @vite-ignore */ String("/src/model.ts")
      );
      const { PIANO_POSITIONS } = await import(
        /* @vite-ignore */ String("/src/piano-model.ts")
      );
      const element = document.querySelector<HTMLDivElement>("#notation")!;
      const samples: { width: number; x: number; y: number; fits: boolean }[] =
        [];
      for (const key of KEYS) {
        for (const card of deck(
          { low: "C2", high: "B6", key: key.id },
          PIANO_POSITIONS,
        )) {
          drawNotation(element, card, key.id, false, false);
          const svg = element.querySelector("svg")!;
          const frame = svg.getBoundingClientRect();
          const content = svg.querySelector("g")!.getBoundingClientRect();
          // The five staff lines are the wide, horizontal paths, not ledger lines.
          const lines = [
            ...svg.querySelectorAll<SVGGraphicsElement>("path"),
          ].filter((path) => {
            const b = path.getBBox();
            return b.width > 200 && b.height < 2;
          });
          if (lines.length !== 5)
            throw Error(`Expected five staff lines, got ${lines.length}`);
          const line = lines[0].getBoundingClientRect();
          samples.push({
            width: line.width,
            x: line.x,
            y: line.y,
            fits:
              content.left >= frame.left - 1 &&
              content.right <= frame.right + 1 &&
              content.top >= frame.top - 1 &&
              content.bottom <= frame.bottom + 1,
          });
        }
      }
      return {
        samples,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(result.samples.length, 525);
    const first = result.samples[0];
    for (const sample of result.samples) {
      assert.ok(
        Math.abs(sample.width - first.width) < 0.1,
        `staff width changed at ${width}px`,
      );
      assert.ok(
        Math.abs(sample.x - first.x) < 0.1 &&
          Math.abs(sample.y - first.y) < 0.1,
        "staff moved",
      );
      assert.ok(sample.fits, "notation escaped its frame");
    }
    assert.equal(result.overflow, false);
    await page.screenshot({
      path: `../../work/staff-stable-${width}.png`,
      fullPage: true,
    });
    console.log(
      `${width}px: all 525 pitch/key combinations fit; staff width ${first.width.toFixed(2)}px and position remain constant`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill();
}
