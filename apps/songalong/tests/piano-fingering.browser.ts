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
  // Module workers require a non-opaque origin. Intercept the reserved test
  // domain locally so this fixture owns no TCP port or remote request.
  await page.route("http://piano.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Piano fingering fixture</title>",
    }),
  );
  await page.goto("http://piano.test/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const kind of [
    "single",
    "multiple",
    "chord",
    "reversed-chord",
    "unsupported",
    "tied",
    "long",
  ] as const) {
    const result = await page.evaluate(
      (kind) => window.PianoFingeringFixture.renderPianoFingeringFixture(kind),
      kind,
    );
    assert.ok(result.unchanged);
    assert.equal(
      result.status,
      kind === "unsupported" ? "partial" : "complete",
    );
    if (kind === "chord" || kind === "reversed-chord") {
      const chord = result.marks
        .filter((m) => m.hand === "right")
        .sort((a, b) => a.midi - b.midi);
      assert.deepEqual(
        chord.map((m) => m.midi),
        [60, 64, 67],
      );
      assert.ok(
        chord[0].y > chord[1].y && chord[1].y > chord[2].y,
        JSON.stringify(chord),
      );
    }
    assert.ok(result.soundingNotes > 0);
    if (kind === "long")
      assert.ok(
        result.marks.some(
          (m) => m.hand === "right" && m.label?.includes("cross"),
        ),
        "long stepwise run exposes thumb-passage cues",
      );
    if (kind === "tied")
      assert.equal(
        result.marks.filter((m) => m.hand === "right" && m.midi === 60).length,
        1,
        "tied continuation adds no new attack digit",
      );
    assert.equal(result.marks.filter((m) => m.hand === "left").length, 4);
    assert.equal(
      result.marks.filter((m) => m.hand === "right").length,
      kind === "long"
        ? 16
        : kind === "single"
          ? 4
          : kind === "multiple" || kind === "tied"
            ? 5
            : kind === "chord" || kind === "reversed-chord"
              ? 3
              : 0,
    );
    assert.ok(
      result.marks.every((m) => m.finger >= 1 && m.finger <= 5 && m.label),
    );
    await expect(page.locator(".hymn-fingering").first()).toBeVisible();
  }
  const full = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoPracticeFixture(),
  );
  const hidden = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoPracticeFixture(true),
  );
  assert.ok(full.generated.length > 0);
  assert.deepEqual(
    hidden.generated,
    full.generated.filter((e) => !e.id?.startsWith("1:")),
    "hidden voices still constrain the same full-hand plan",
  );
  assert.deepEqual(
    hidden.events,
    full.events,
    "hiding notation preserves playback timing and pitches",
  );
  const editorial = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoPracticeFixture(false, true),
  );
  assert.ok(editorial.editorial.length > 0);
  assert.ok(editorial.editorial.every((e) => e?.includes("2")));
  assert.equal(
    editorial.generated.length,
    0,
    "explicit authored annotation route retains authored ink",
  );
  const generatedEdition = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoPracticeFixture(false, false, true),
  );
  assert.equal(
    generatedEdition.hintCalls,
    0,
    "legacy generated tables never become authored piano anchors",
  );
  assert.deepEqual(
    generatedEdition.generated,
    full.generated,
    "edition and ordinary piano routes share the same physical plan",
  );
  const hiddenEdition = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoPracticeFixture(true, false, true),
  );
  assert.deepEqual(
    hiddenEdition.generated,
    generatedEdition.generated.filter((e) => !e.id?.startsWith("1:")),
    "edition hidden staves retain full-source constraints",
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.PianoFingeringFixture.renderPianoEditionPlacementFixture(),
    ),
    { shifted: true, centered: true },
    "collision placement moves shift rings and digits together",
  );
  for (const [entry, unified] of [
    ["src/piano-planning-worker.ts", false],
    ["research/chirality/unified-worker.ts", true],
  ] as const) {
    const worker = await build({
      entryPoints: [
        new URL("../../../packages/music-practice/" + entry, import.meta.url)
          .pathname,
      ],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
    });
    const result = await page.evaluate(
      ({ script, unified }) =>
        window.PianoFingeringFixture.runPianoWorkerFixture(script, unified),
      { script: worker.outputFiles[0].text, unified },
    );
    assert.deepEqual(result, {
      old: "stale",
      current: "ready",
      matches: true,
      cached: true,
    });
  }
  const substitution = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoSubstitutionFixture(),
  );
  assert.equal(substitution.status, "complete");
  assert.equal(substitution.substitutions.length, 1);
  assert.equal(substitution.substitutions[0].beat, "1");
  assert.equal(substitution.substitutions[0].text, "5→1");
  assert.ok(substitution.substitutions[0].label?.includes("at beat 2"));
  assert.ok(
    substitution.substitutions[0].x > 0 && substitution.substitutions[0].y > 0,
  );
  await expect(page.locator(".piano-finger-substitution")).toBeVisible();
  for (const experimental of [false, true]) {
    const ergonomic = await page.evaluate(
      (experimental) =>
        window.PianoFingeringFixture.renderPianoErgonomicFixture(experimental),
      experimental,
    );
    assert.equal(ergonomic.status, "complete");
    assert.ok(ergonomic.unchanged);
    assert.deepEqual(
      ergonomic.marks
        .filter((m) => m.midi === 60 || m.midi === 72)
        .sort((a, b) => a.midi - b.midi),
      [
        { midi: 60, finger: 1 },
        { midi: 72, finger: 4 },
      ],
    );
    const detached = ergonomic.notes.find((n) => n.midi === 62)!;
    assert.equal(detached.hold, 0.5);
    assert.equal(detached.notation, 1);
    assert.ok(detached.voice);
    assert.equal(detached.phraseStart, true);
    assert.equal(
      ergonomic.notes.find((n) => n.midi === 64)!.phraseStart,
      false,
    );
    await expect(page.locator(".hymn-fingering").first()).toBeVisible();
  }
  const gesture = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoGestureFixture(),
  );
  assert.equal(gesture.status, "complete");
  assert.equal(gesture.gesture, -1.75);
  assert.ok(gesture.unchanged);
  assert.deepEqual(gesture.marks, [
    { midi: 64, finger: 2 },
    { midi: 67, finger: 3 },
    { midi: 72, finger: 1 },
  ]);
  await expect(page.locator(".hymn-fingering")).toHaveCount(3);
  const anchored = await page.evaluate(() =>
    window.PianoFingeringFixture.renderPianoFingeringFixture("multiple", true),
  );
  assert.ok(anchored.unchanged);
  assert.ok(
    anchored.layout.some((r) => r.status === "placed"),
    JSON.stringify(anchored.layout),
  );
  assert.ok(anchored.alignment.length > 0);
  assert.ok(
    anchored.alignment.every((p) => Math.abs(p.before - p.after) < 0.1),
    JSON.stringify(anchored.alignment),
  );
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
