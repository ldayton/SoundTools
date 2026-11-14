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
  assert.equal(reloaded.forHymn("other-hymn").zoom, 1);
  assert.equal(reloaded.forHymn("other-hymn").arrangement, "melody");
  // A selected passage must not overwrite the full-hymn checkpoint.
  store.snapshot({ ...settings, position: 1 }, "G", 1);
  assert.equal(store.restore(settings, "G", "edition-1", 10).position, 3);
  reloaded.bookmarks[hymnProgressKey(settings, "G")].position = 8;
  assert.equal(saved.bookmarks[hymnProgressKey(settings, "G")].position, 3);
});
