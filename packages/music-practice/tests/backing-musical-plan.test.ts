import { test } from "node:test";
import assert from "node:assert/strict";
import {
  musicalBackingPlan,
  plannedBackingArrangement,
} from "../src/backing-musical-plan";
import { backingChord } from "../src/backing-arrangement";
const tuning = [40, 45, 50, 55, 59, 64];
test("concert-key grips are playable, complete triads and scale-safe in all 24 keys", () => {
  for (const style of ["blues", "rock"] as const)
    for (const quality of ["major", "minor"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const plan = musicalBackingPlan(style, "active", quality, 0, 90, tonic);
        assert.equal(plan.grips.length, style === "rock" ? 8 : 12);
        for (const [i, grip] of plan.grips.entries()) {
          const c = backingChord(style, quality, i),
            root = (tonic + c.degree) % 12;
          assert.deepEqual(
            [...new Set(grip.map((n) => n.note % 12))].sort((a, b) => a - b),
            [root, (root + (c.minor ? 3 : 4)) % 12, (root + 7) % 12].sort(
              (a, b) => a - b,
            ),
          );
          const frets = grip.filter((n) => n.fret > 0).map((n) => n.fret);
          assert.ok(Math.max(...frets) - Math.min(...frets) <= 4);
          grip.forEach((n) => assert.equal(n.note, tuning[n.string] + n.fret));
        }
      }
});
test("phrase memory is deterministic and changes across choruses; seam levels match", () => {
  for (const style of ["blues", "rock"] as const)
    for (const mode of ["steady", "active"] as const) {
      const a = plannedBackingArrangement(style, mode, "minor", 0, 72, 2),
        b = plannedBackingArrangement(style, mode, "minor", 1, 72, 2);
      assert.deepEqual(
        a,
        plannedBackingArrangement(style, mode, "minor", 0, 72, 2),
      );
      assert.notDeepEqual(a.roles, b.roles);
      assert.equal(a.plan.bars[0].level, a.plan.bars.at(-1)!.level);
      const notes = a.events.filter(
        (e) => e.part === "guitar" || e.part === "bass",
      );
      assert.ok(
        notes.every(
          (e) => e.absolute && e.duration > 0 && e.beat + e.duration <= a.beats,
        ),
      );
      assert.ok(
        new Set(notes.filter((e) => e.part === "bass").map((e) => e.note % 12))
          .size >= 4,
      );
      assert.ok(
        new Set(
          notes.filter((e) => e.part === "guitar").map((e) => e.note % 12),
        ).size >= 4,
      );
    }
});

test('bass retains A attack timing and never adds density, ghost hits or fast replies', async () => {
 const { practiceBackingArrangement } = await import('../src/backing-phrasing');
 for(const style of ['blues','rock'] as const) for(const mode of ['steady','active'] as const) for(const tempo of [72,90,120]) for(const cycle of [0,1,2]) {
  const a=practiceBackingArrangement(style,mode,'minor',cycle,tempo).events.filter(e=>e.part==='bass');
  const b=plannedBackingArrangement(style,mode,'minor',cycle,tempo).events.filter(e=>e.part==='bass');
  assert.ok(b.length<=a.length);
  assert.ok(b.every(e=>a.some(n=>n.beat===e.beat)&&e.articulation!=='ghost'));
  for(let bar=0;bar<(style==='blues'?72:64);bar++) assert.ok(b.filter(e=>Math.floor(e.beat/4)===bar).length<=2);
 }
});
