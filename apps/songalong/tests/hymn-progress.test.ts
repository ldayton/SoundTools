import test from "node:test";
import assert from "node:assert/strict";
import {
  HymnProgress,
  hymnProgressKey,
} from "../../../packages/music-practice/src/hymn-progress";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";

test("hymn checkpoints survive reload but never leak across hands, keys, ties or changed scores", () => {
  const settings = {
    ...hymnPreferences("amazing-grace"),
    arrangement: "bass" as const,
    hands: "right" as const,
    position: 3,
  };
  const store = new HymnProgress(undefined, []);
  const saved = store.snapshot(settings, "G", 1.2, {
    content: "edition-1",
    paused: true,
    length: 10,
  });
  const reloaded = new HymnProgress(saved, [settings.hymn]);
  assert.deepEqual(reloaded.restore(settings, "G", "edition-1", 10), {
    position: 3,
    paused: true,
  });
  for (const patch of [
    { key: "D" as const },
    { octave: -1 },
    { hands: "left" as const },
    { reattackTies: true },
  ])
    assert.deepEqual(
      reloaded.restore({ ...settings, ...patch }, "G", "edition-1", 10),
      { position: 0, paused: false },
    );
  assert.deepEqual(reloaded.restore(settings, "G", "edition-2", 10), {
    position: 0,
    paused: false,
  });
  assert.deepEqual(reloaded.restore(settings, "G", "edition-1", 11), {
    position: 0,
    paused: false,
  });
  assert.equal(
    hymnProgressKey({ ...settings, viewHands: "both" }, "G"),
    hymnProgressKey({ ...settings, viewHands: "right" }, "G"),
  );
  assert.equal(reloaded.forHymn(settings.hymn).zoom, 1.2);
  assert.equal(reloaded.forHymn("other-hymn").zoom, 1.2);
  assert.equal(reloaded.forHymn("other-hymn").arrangement, "melody");
  // A selected passage must not overwrite the full-hymn checkpoint.
  store.snapshot({ ...settings, position: 1 }, "G", 1);
  assert.equal(store.restore(settings, "G", "edition-1", 10).position, 3);
  reloaded.bookmarks[hymnProgressKey(settings, "G")].position = 8;
  assert.equal(saved.bookmarks[hymnProgressKey(settings, "G")].position, 3);
});

// Score size is continuous; every supported value must survive storage validation.
test("continuous score sizes survive reload and reject corrupt preferences", () => {
  for (const zoom of [0.5, 0.51, 0.95, 1, 1.37, 2]) {
    const settings = hymnPreferences("amazing-grace");
    const saved = new HymnProgress(undefined, []).snapshot(settings, "G", zoom);
    assert.equal(
      new HymnProgress(saved, [settings.hymn]).forHymn(settings.hymn).zoom,
      zoom,
    );
  }
  for (const zoom of [0, 0.49, 2.01, Infinity, NaN, "1.2", null])
    assert.equal(hymnPreferences("amazing-grace", { zoom }).zoom, 1);
});

test("staff sizes migrate once and remain independent across layouts and reloads", () => {
  const settings = hymnPreferences("amazing-grace");
  const legacy = {
    ...settings,
    version: 1 as const,
    zoom: 1.2,
    bookmarks: {},
    sections: {},
  };
  const progress = new HymnProgress(legacy, [settings.hymn]);
  assert.equal(progress.zoomFor("desktop"), 1.2);
  assert.equal(progress.zoomFor("mobile"), 1.2);
  progress.setZoom(0.8, "mobile");
  const saved = progress.snapshot(settings, "G", 0.8, undefined, "mobile");
  assert.deepEqual(saved.zoomByLayout, { mobile: 0.8, desktop: 1.2 });
  const restored = new HymnProgress(saved, [settings.hymn]);
  restored.setZoom(1.5, "desktop");
  restored.setZoom(NaN, "mobile");
  const again = new HymnProgress(restored.snapshot(settings, "G", 1.5), [
    settings.hymn,
  ]);
  assert.equal(again.zoomFor("mobile"), 0.8);
  assert.equal(again.zoomFor("desktop"), 1.5);
  const corrupt = new HymnProgress(
    { ...saved, zoomByLayout: { mobile: Infinity, desktop: 1.4 } },
    [],
  );
  assert.equal(corrupt.zoomFor("mobile"), 0.8);
  assert.equal(corrupt.zoomFor("desktop"), 1.4);
});
