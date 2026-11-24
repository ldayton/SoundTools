import {practiceHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import test from "node:test";
import assert from "node:assert/strict";
import {
  HymnProgress,
  hymnProgressKey,
} from "../../../packages/music-practice/src/hymn-progress";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";

test("hymn checkpoints survive reload but never leak across hands, keys, ties or changed scores", () => {
  const settings = {
    ...hymnPreferences(practiceHymn.id),
    arrangement: "piano" as const,
    hands: "right" as const,
    position: 3,
  };
  const store = new HymnProgress(undefined, []);
  const saved = store.snapshot(settings, practiceHymn.key, 1.2, {
    content: "edition-1",
    paused: true,
    length: 10,
  });
  const reloaded = new HymnProgress(saved, [settings.hymn]);
  assert.deepEqual(reloaded.restore(settings, practiceHymn.key, "edition-1", 10), {
    position: 3,
    paused: true,
  });
  for (const patch of [
    { key: practiceHymn.key === "D" ? "G" as const : "D" as const },
    { octave: -1 },
    { hands: "left" as const },
    { reattackTies: true },
  ])
    assert.deepEqual(
      reloaded.restore({ ...settings, ...patch }, practiceHymn.key, "edition-1", 10),
      { position: 0, paused: false },
    );
  assert.deepEqual(reloaded.restore(settings, practiceHymn.key, "edition-2", 10), {
    position: 0,
    paused: false,
  });
  assert.deepEqual(reloaded.restore(settings, practiceHymn.key, "edition-1", 11), {
    position: 0,
    paused: false,
  });
  assert.equal(
    hymnProgressKey({ ...settings, viewHands: "both" }, practiceHymn.key),
    hymnProgressKey({ ...settings, viewHands: "right" }, practiceHymn.key),
  );
  assert.equal(reloaded.forHymn(settings.hymn).zoom, 1.2);
  assert.equal(reloaded.forHymn("other-hymn").zoom, 1.2);
  assert.equal(reloaded.forHymn("other-hymn").arrangement, "piano");
  // A selected passage must not overwrite the full-hymn checkpoint.
  store.snapshot({ ...settings, position: 1 }, practiceHymn.key, 1);
  assert.equal(store.restore(settings, practiceHymn.key, "edition-1", 10).position, 3);
  reloaded.bookmarks[hymnProgressKey(settings, practiceHymn.key)].position = 8;
  assert.equal(saved.bookmarks[hymnProgressKey(settings, practiceHymn.key)].position, 3);
});

// Score size is continuous; every supported value must survive storage validation.
test("continuous score sizes survive reload and reject corrupt preferences", () => {
  for (const zoom of [0.5, 0.51, 0.95, 1, 1.37, 2]) {
    const settings = hymnPreferences(practiceHymn.id);
    const saved = new HymnProgress(undefined, []).snapshot(settings, practiceHymn.key, zoom);
    assert.equal(
      new HymnProgress(saved, [settings.hymn]).forHymn(settings.hymn).zoom,
      zoom,
    );
  }
  for (const zoom of [0, 0.49, 2.01, Infinity, NaN, "1.2", null])
    assert.equal(hymnPreferences(practiceHymn.id, { zoom }).zoom, 1);
});

test("staff sizes migrate once and remain independent across layouts and reloads", () => {
  const settings = hymnPreferences(practiceHymn.id);
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
  const saved = progress.snapshot(settings, practiceHymn.key, 0.8, undefined, "mobile");
  assert.deepEqual(saved.zoomByLayout, { mobile: 0.8, desktop: 1.2 });
  const restored = new HymnProgress(saved, [settings.hymn]);
  restored.setZoom(1.5, "desktop");
  restored.setZoom(NaN, "mobile");
  const again = new HymnProgress(restored.snapshot(settings, practiceHymn.key, 1.5), [
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

test("note limits are global while each song remembers its own BPM", () => {
  const first = {
    ...hymnPreferences(practiceHymn.id),
    low: 48,
    high: 79,
    bpm: 96,
  };
  const progress = new HymnProgress(undefined, []);
  progress.remember(first, 1);
  const second = { ...progress.forHymn("silent-night"), bpm: 112 };
  assert.equal(second.low, 48);
  assert.equal(second.high, 79);
  progress.remember({ ...second, low: 50, high: 81 }, 1);
  assert.equal(progress.forHymn(first.hymn).bpm, 96);
  assert.equal(progress.forHymn(first.hymn).low, 50);
  const saved = progress.snapshot(
    { ...progress.forHymn(first.hymn), high: null },
    practiceHymn.key,
    1,
  );
  const restored = new HymnProgress(saved, [first.hymn, second.hymn]);
  for (const id of [first.hymn, second.hymn, "jesus-loves-me"]) {
    assert.equal(restored.forHymn(id).low, 50);
    assert.equal(restored.forHymn(id).high, null);
  }
  assert.equal(restored.forHymn(first.hymn).bpm, 96);
  assert.equal(restored.forHymn(second.hymn).bpm, 112);
});
