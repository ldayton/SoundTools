import assert from "node:assert/strict";
import test from "node:test";
import {
  backingArrangement,
  scalePitchClasses,
} from "../src/backing-arrangement";
import { backingABExperiment } from "../src/backing-ab-experiment";
test("A/B experiment is deterministic, non-mutating, in scale and tempo aware", () => {
  for (const style of ["blues", "rock"] as const)
    for (const quality of ["major", "minor"] as const) {
      const a = backingArrangement(style, "active", quality),
        before = structuredClone(a);
      const slow = backingABExperiment(a, style, quality, 72),
        fast = backingABExperiment(a, style, quality, 120);
      assert.deepEqual(a, before);
      assert.deepEqual(slow, backingABExperiment(a, style, quality, 72));
      assert.notDeepEqual(slow.events, fast.events);
      for (const b of [slow, fast]) {
        assert.equal(b.beats, a.beats);
        assert.ok(
          b.events.filter((e) => e.part === "guitar").length <
            a.events.filter((e) => e.part === "guitar").length,
        );
        assert.ok(b.events.some((e) => e.part === "guitar" && e.duration > 4));
        for (const e of b.events) {
          assert.ok(e.beat >= 0 && e.beat < b.beats);
          assert.ok(e.duration > 0);
          assert.ok(Number.isFinite(e.level));
          if (e.part === "guitar" || e.part === "bass") {
            assert.ok(e.beat + e.duration < b.beats);
            assert.ok(scalePitchClasses(9, quality).includes(e.note % 12));
          }
        }
      }
    }
});

import { practiceBackingArrangement } from "../src/backing-phrasing";
test("the app uses approved B phrasing in both feels and regenerates for tempo", () => {
  for (const style of ["blues", "rock"] as const)
    for (const quality of ["major", "minor"] as const) {
      const approved = backingABExperiment(
        backingArrangement(style, "active", quality),
        style,
        quality,
        72,
      );
      assert.deepEqual(
        practiceBackingArrangement(style, "active", quality, 0, 72).events,
        approved.events,
      );
      const steady = practiceBackingArrangement(
        style,
        "steady",
        quality,
        0,
        72,
      );
      const active = practiceBackingArrangement(
        style,
        "active",
        quality,
        0,
        72,
      );
      assert.ok(
        active.events.length > steady.events.length,
        "Steady retains a simpler backbone",
      );
      for (const mode of ["steady", "active"] as const) {
        const slow = practiceBackingArrangement(style, mode, quality, 0, 72),
          fast = practiceBackingArrangement(style, mode, quality, 0, 120);
        assert.notDeepEqual(slow.events, fast.events);
        assert.equal(fast.tempo, 120);
        for (const take of [slow, fast])
          for (const e of take.events) {
            assert.ok(e.beat >= 0 && e.beat < take.beats && e.duration > 0);
            if (e.part === "bass" || e.part === "guitar") {
              assert.ok(e.beat + e.duration < take.beats);
              assert.ok(scalePitchClasses(9, quality).includes(e.note % 12));
            }
          }
      }
    }
});
