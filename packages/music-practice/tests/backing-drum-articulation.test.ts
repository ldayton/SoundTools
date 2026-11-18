import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articulateDrums,
  drumRoundRobin,
} from "../src/backing-drum-articulation";
import { plannedBackingArrangement } from "../src/backing-musical-plan";
import { backingChokes } from "../src/backing-performance";
test("drum experiment preserves every onset, velocity, duration and all non-drum events", () => {
  const counts: Record<string, number> = {};
  for (const style of ["blues", "rock"] as const)
    for (const mode of ["steady", "active"] as const) {
      const a = plannedBackingArrangement(style, mode, "minor"),
        b = articulateDrums(a);
      assert.equal(a.events.length, b.events.length);
      for (let i = 0; i < a.events.length; i++) {
        const x = a.events[i],
          y = b.events[i];
        if (x.part !== "drums") assert.deepEqual(x, y);
        else {
          const { articulation: _, ...rest } = y;
          const { articulation: __, ...original } = x;
          assert.deepEqual(rest, original);
          counts[y.articulation ?? "normal"] =
            (counts[y.articulation ?? "normal"] ?? 0) + 1;
        }
      }
    }
  assert.ok(counts["hat-half"] > 0);
  assert.ok(counts["hat-loose"] > 0);
  assert.ok(counts.rimshot > 0);
  assert.ok(counts.offcenter > 0);
});
test("alternate bags cover each take and never repeat across a boundary", () => {
  for (let size = 2; size <= 12; size++) {
    const values = Array.from({ length: size * 8 }, (_, i) =>
      drumRoundRobin(i, size, 42),
    );
    for (let i = 1; i < values.length; i++)
      assert.notEqual(values[i], values[i - 1]);
    for (let i = 0; i < values.length; i += size)
      assert.equal(new Set(values.slice(i, i + size)).size, size);
  }
});
test("pedal state chokes looser hats without choking unrelated kit voices", () => {
  const event = {
    part: "drums" as const,
    note: 42,
    beat: 0,
    duration: 1,
    velocity: 60,
    level: 1,
    articulation: "hat-half" as const,
  };
  assert.ok(backingChokes(event, { part: "drums", note: 46 }));
  assert.ok(
    backingChokes(event, {
      part: "drums",
      note: 42,
      articulation: "hat-loose",
    }),
  );
  assert.ok(!backingChokes(event, { part: "drums", note: 42 }));
  assert.ok(
    backingChokes(
      { ...event, articulation: "normal" },
      { part: "drums", note: 42, articulation: "hat-half" },
    ),
  );
  assert.ok(!backingChokes(event, { part: "drums", note: 38 }));
});
