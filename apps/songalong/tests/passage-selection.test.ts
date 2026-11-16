import test from "node:test";
import assert from "node:assert/strict";
import {
  PassageSelection,
  barPassage,
  passageLabel,
  scorePosition,
  scoreBarSpan,
} from "../../../packages/music-practice/src/passage-selection";
import {
  hymnPreferences,
  hymnSettingsFromQuery,
} from "../../../packages/music-practice/src/hymn-settings";

test("range edits normalize endpoints and undo independently of position; reset discards another song's history", () => {
  const model = new PassageSelection(12);
  model.cursor = 8;
  model.select(6, 2);
  assert.deepEqual(model.range, { start: 2, end: 6 });
  assert.equal(model.cursor, 8);
  model.select(2, 9);
  assert.equal(model.select(2, 9), false, "unchanged edits don't clutter undo");
  model.clear();
  model.undo();
  assert.deepEqual(model.range, { start: 2, end: 9 });
  model.undo();
  assert.deepEqual(model.range, { start: 2, end: 6 });
  model.undo();
  assert.equal(model.range, undefined);
  assert.equal(model.undo(), false);
  model.select(-100, 100);
  assert.deepEqual(model.range, { start: 0, end: 11 });
  model.reset();
  assert.equal(model.undo(), false);
  model.select(2, 5);
  model.bind(3);
  assert.equal(model.range, undefined);
});
test("bar labels handle pickups, fractional beats and compound meter without inventing bar zero", () => {
  const points = [0, 1, 3, 3.5, 4, 6].map((t) => scorePosition(t, 3, 1, 1));
  assert.deepEqual(points[0], { bar: 0, beat: 3 });
  assert.deepEqual(points[1], { bar: 1, beat: 1 });
  assert.deepEqual(barPassage(points, 2), {
    start: 1,
    end: 3,
    wholeBars: true,
  });
  assert.equal(passageLabel(points, { start: 0, end: 0 }), "Pickup");
  assert.equal(passageLabel(points, { start: 1, end: 3 }), "Bar 1");
  assert.equal(passageLabel(points, { start: 1, end: 2 }), "Bar 1, beats 1–3");
  assert.equal(passageLabel(points, { start: 2, end: 3 }), "Bar 1, beats 3–3½");
  assert.deepEqual(scorePosition(0, 4, 0, 1), { bar: 1, beat: 1 });
  assert.deepEqual(scorePosition(1.5, 3, 0, 1.5), { bar: 1, beat: 2 });
  assert.deepEqual(scorePosition(3, 3, 0, 1.5), { bar: 2, beat: 1 });
});
test("per-loop count-in defaults off and stays a per-song playback preference", () => {
  const defaults = hymnPreferences("amazing-grace");
  assert.equal(defaults.loopCountIn, false);
  const saved = hymnSettingsFromQuery(
    defaults,
    new URLSearchParams("countIn=0.5&loopCountIn=1"),
  );
  assert.equal(saved.loopCountIn, true);
  assert.equal(saved.countIn, 0.5);
  assert.equal(hymnPreferences("amazing-grace", saved).loopCountIn, true);
  assert.equal(hymnPreferences("jesus-loves-me").loopCountIn, false);
});

test("whole-measure selection includes leading rests and survives undo", () => {
  assert.deepEqual(scoreBarSpan(1.5, 4, 0), { start: 0, end: 4 });
  assert.deepEqual(scoreBarSpan(3.5, 3, 1), { start: 1, end: 4 });
  assert.deepEqual(scoreBarSpan(0.5, 3, 1), { start: 0, end: 1 });
  const late = [
    { bar: 1, beat: 2 },
    { bar: 1, beat: 3 },
  ];
  assert.equal(passageLabel(late, { start: 0, end: 1 }), "Bar 1, beats 2–3");
  assert.equal(
    passageLabel(late, { start: 0, end: 1, wholeBars: true }),
    "Bar 1",
  );
  const model = new PassageSelection(10);
  model.select(2, 4, true);
  model.select(2, 5);
  model.undo();
  assert.equal(model.range?.wholeBars, true);
});
