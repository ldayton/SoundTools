import assert from "node:assert/strict";
import { build } from "esbuild";
import { expect } from "@playwright/test";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import type * as Fixture from "../../../packages/music-practice/test-fixtures/piano-fingering-view";
declare global {
  interface Window {
    PianoFingeringFixture: typeof Fixture;
  }
}
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
      viewport: { width: 900, height: 700 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bundle = await build({
    entryPoints: [
      new URL(
        "../../../packages/music-practice/test-fixtures/piano-fingering-view.ts",
        import.meta.url,
      ).pathname,
    ],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "PianoFingeringFixture",
    platform: "browser",
  });
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const kind of ["single", "multiple", "chord"] as const) {
    const result = await page.evaluate(
      (kind) => window.PianoFingeringFixture.renderPianoFingeringFixture(kind),
      kind,
    );
    assert.ok(result.unchanged);
    assert.ok(result.soundingNotes > 0);
    assert.equal(result.marks.filter((m) => m.hand === "left").length, 4);
    assert.equal(
      result.marks.filter((m) => m.hand === "right").length,
      kind === "single" ? 4 : 0,
    );
    assert.ok(
      result.marks.every((m) => m.finger >= 1 && m.finger <= 5 && m.label),
    );
    await expect(page.locator(".hymn-fingering").first()).toBeVisible();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: generated piano fingers preserve music and withhold unsupported whole-hand suggestions",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
}
