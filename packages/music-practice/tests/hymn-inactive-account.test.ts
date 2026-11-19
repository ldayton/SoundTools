import test from "node:test";
import assert from "node:assert/strict";
import hymns from "../src/hymns.json";
import { HymnProgress } from "../src/hymn-progress";
import { hymnPreferences } from "../src/hymn-settings";
test("inactive song settings and deleted checkpoints merge without changing active progress or global choices", () => {
  const [current, other] = hymns.slice(0, 2).map((h) => h.id),
    progress = new HymnProgress(undefined, [current, other]);
  progress.remember(
    {
      ...hymnPreferences(current),
      mode: "playback",
      bpm: 90,
      low: 48,
      high: 79,
    },
    1,
  );
  progress.preferences[other] = hymnPreferences(other, { bpm: 80 });
  const saved = progress.snapshot(progress.forHymn(current), "C", 1);
  progress.bookmarks[`${other}:old`] = {} as any;
  progress.bookmarks[`${current}:kept`] = { position: 3 } as any;
  progress.mergeInactive(
    {
      ...saved,
      mode: "wait",
      low: 36,
      preferences: { [other]: hymnPreferences(other, { bpm: 112 }) },
      bookmarks: {},
    },
    current,
  );
  assert.equal(progress.forHymn(other).bpm, 112);
  assert.equal(progress.forHymn(current).bpm, 90);
  assert.equal(progress.forHymn(current).mode, "playback");
  assert.equal(progress.forHymn(current).low, 48);
  assert.equal(progress.bookmarks[`${other}:old`], undefined);
  assert.equal(progress.bookmarks[`${current}:kept`].position, 3);
});
