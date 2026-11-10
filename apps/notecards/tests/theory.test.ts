import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scaleNotes,
  noteAt,
  intervalTarget,
  intervalQuality,
  theoryPool,
  mergeTheorySettings,
  defaultTheorySettings,
  questionAnswer,
  taskSettings,
  intervalWalk,
} from "../src/theory-model";
import { name, KEYS } from "../src/model";
import { defaultProgress, loadProgress } from "../src/progress";
import { PracticeSession } from "../src/session";
test("major and relative natural minor scales preserve spelling, octaves and diatonic steps in all keys", () => {
  for (const key of KEYS)
    for (const mode of ["major", "minor"] as const) {
      const scale = scaleNotes(key.id, mode, 4);
      assert.equal(scale.length, 8);
      assert.equal(new Set(scale.slice(0, 7).map((n) => n.letter)).size, 7);
      assert.deepEqual(
        scale.slice(1).map((n, i) => n.midi - scale[i].midi),
        mode === "major" ? [2, 2, 1, 2, 2, 2, 1] : [2, 1, 2, 2, 1, 2, 2],
      );
      assert.equal(scale.at(-1)!.midi - scale[0].midi, 12);
    }
  assert.deepEqual(scaleNotes("F#", "major", 4).map(name), [
    "F♯",
    "G♯",
    "A♯",
    "B",
    "C♯",
    "D♯",
    "E♯",
    "F♯",
  ]);
  assert.equal(scaleNotes("C", "minor", 4)[0].letter, "A");
});
test("written interval numbers distinguish enharmonic pitches in both directions", () => {
  const c = noteAt(4 * 7),
    rootD = noteAt(4 * 7 + 1);
  const aug2 = intervalTarget(c, 2, "up", "augmented")!,
    min3 = intervalTarget(c, 3, "up", "minor")!;
  assert.equal(aug2.midi, min3.midi);
  assert.equal(name(aug2), "D♯");
  assert.equal(name(min3), "E♭");
  const down = intervalTarget(rootD, 3, "down", "major")!;
  assert.equal(name(down), "B♭");
  assert.equal(down.octave, 3);
  assert.equal(intervalQuality(rootD, down, 3), "major");
  assert.equal(intervalTarget(c, 1, "up", "diminished"), undefined);
});
test("beginner pools, direction limits, ranges and settings validation are exact", () => {
  const s = defaultTheorySettings();
  assert.deepEqual(
    theoryPool("name-degree", s).map((q) => q.degree),
    [1, 3, 5],
  );
  assert.ok(
    theoryPool("name-interval", s).every(
      (q) =>
        [2, 3].includes(q.interval!) &&
        q.direction === "up" &&
        q.notes.every((n) => !n.modifier),
    ),
  );
  const down = { ...s, direction: "down" as const };
  assert.deepEqual(
    theoryPool("build-scale", down)[0].notes.map((n) => n.midi),
    [72, 71, 69, 67, 65, 64, 62, 60],
  );
  assert.equal(
    theoryPool("name-interval", { ...s, low: "C4", high: "C4" }).length,
    0,
  );
  const invalid = mergeTheorySettings({
    keys: ["invalid"],
    degrees: [],
    intervals: [99],
    roundLength: 13,
    low: "B5",
    high: "C4",
  });
  assert.deepEqual(invalid.keys, ["C"]);
  assert.deepEqual(invalid.degrees, [1, 3, 5]);
  assert.equal(invalid.roundLength, 12);
  assert.equal(invalid.low, "C4");
});
test("theory sessions preserve feedback and review stats across reloads", () => {
  const p = defaultProgress(),
    s = defaultTheorySettings(),
    pool = theoryPool("name-degree", s);
  const session = new PracticeSession(pool, p, "theory-scales:");
  const q = session.next(() => 0)!;
  assert.equal(questionAnswer(q, "name-degree", s), "1");
  session.submit(false);
  const restoredProgress = loadProgress(JSON.stringify(p));
  assert.equal(Object.keys(restoredProgress.stats).length, 1);
  const restored = PracticeSession.restore(
    pool,
    restoredProgress,
    "theory-scales:",
    session.snapshot(),
  )!;
  assert.equal(restored.status, "feedback");
  assert.equal(restored.answered, 1);
  assert.equal(restored.correct, 0);
  assert.notEqual(restored.next(() => 0)!.id, q.id);
});

test("interval practice excludes unisons, starts full naming with contrasting thirds, and canonicalizes simultaneous pairs", () => {
  const distance = taskSettings("name-interval", {
    ...defaultTheorySettings(),
    intervals: [1, 3, 2],
  });
  assert.deepEqual(distance.intervals, [2, 3]);
  assert.ok(
    theoryPool("name-interval", distance).every((q) => q.interval! >= 2),
  );
  const full = taskSettings("name-quality");
  assert.deepEqual(full.intervals, [3]);
  assert.deepEqual(
    [...new Set(theoryPool("name-quality", full).map((q) => q.quality))],
    ["major", "minor"],
  );
  assert.equal(
    theoryPool("name-quality", { ...full, qualities: ["major"] }).length,
    0,
    "single forced answer is not a useful identification quiz",
  );
  const together = {
    ...distance,
    presentation: "together" as const,
    direction: "both" as const,
  };
  assert.deepEqual(
    theoryPool("name-interval", together),
    theoryPool("name-interval", { ...together, direction: "up" }),
  );
});
test("key-based interval construction spells diatonic targets and gives counted staff positions", () => {
  const s = { ...defaultTheorySettings(), intervalKey: "G", intervals: [3] };
  const q = theoryPool("build-interval", s).find(
    (q) => q.notes[0].letter === "D",
  )!;
  assert.equal(name(q.notes[1]), "F♯");
  assert.equal(q.keyName, "G major");
  assert.deepEqual(intervalWalk(q).map(name), ["D", "E", "F♯"]);
});
