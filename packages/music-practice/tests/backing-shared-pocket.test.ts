import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedBackingArrangement } from "../src/backing-musical-plan";
import { articulateDrums } from "../src/backing-drum-articulation";
import { connectBackingGuitar } from "../src/backing-guitar-transitions";
import { sharedBackingPocket } from "../src/backing-shared-pocket";
test("shared pocket changes only bounded pitched-instrument timing, preserving sparse notes and approved sounds", () => {
  let moved = 0;
  for (const style of ["blues", "rock"] as const)
    for (const mode of ["steady", "active"] as const)
      for (const tempo of [72, 90, 120])
        for (const tonic of [0, 6, 9]) {
          const a = connectBackingGuitar(
              articulateDrums(
                plannedBackingArrangement(
                  style,
                  mode,
                  style === "blues" ? "minor" : "major",
                  0,
                  tempo,
                  tonic,
                ),
              ),
              tempo,
            ),
            b = sharedBackingPocket(a, tempo);
          assert.equal(a.beats, b.beats);
          assert.equal(a.events.length, b.events.length);
          assert.deepEqual(
            b.events.filter(
              (e) => e.part === "drums" || e.part === "percussion",
            ),
            a.events.filter(
              (e) => e.part === "drums" || e.part === "percussion",
            ),
          );
          for (const part of ["bass", "guitar"] as const) {
            const old = a.events.filter((e) => e.part === part),
              now = b.events.filter((e) => e.part === part);
            assert.equal(old.length, now.length);
            for (let i = 0; i < old.length; i++) {
              const { beat: ab, duration: ad, ...av } = old[i],
                { beat: bb, duration: bd, ...bv } = now[i];
              assert.deepEqual(av, bv);
              assert.ok(
                (Math.abs(bb - ab) * 60) / tempo <=
                  (part === "bass" ? 0.018 : 0.024) + 1e-8,
              );
              assert.ok(bd <= ad + 1e-8 && bd > 0);
              assert.ok(bb >= 0 && bb + bd <= b.beats);
              if (Math.abs(bb - ab) > 0.0001) moved++;
              const next = now
                .slice(i + 1)
                .find((n) => part === "bass" || n.string === now[i].string);
              if (next) assert.ok(bb + bd <= next.beat + 0.0001);
            }
          }
          assert.deepEqual(b, sharedBackingPocket(a, tempo));
        }
  assert.ok(moved > 0);
});

test('bass follows existing nearby kicks and guitar moves as a whole brush',()=>{
 const tempo=90,a=connectBackingGuitar(articulateDrums(plannedBackingArrangement('rock','active','major',0,tempo,9)),tempo),b=sharedBackingPocket(a,tempo);
 const bassA=a.events.filter(e=>e.part==='bass'),bassB=b.events.filter(e=>e.part==='bass');
 const kicks=a.events.filter(e=>e.part==='drums'&&e.note===36);
 for(let i=0;i<bassA.length;i++){
  const kick=[...kicks].sort((x,y)=>Math.abs(x.beat-bassA[i].beat)-Math.abs(y.beat-bassA[i].beat))[0];
  if(Math.abs(kick.beat-bassA[i].beat)*60/tempo<.01)assert.ok(Math.abs((bassB[i].beat-kick.beat)*60/tempo-.004)<.00001);
 }
 const ga=a.events.filter(e=>e.part==='guitar'),gb=b.events.filter(e=>e.part==='guitar');
 for(let i=1;i<ga.length;i++)if(ga[i].beat-ga[i-1].beat<.10)assert.ok(Math.abs((gb[i].beat-gb[i-1].beat)-(ga[i].beat-ga[i-1].beat))<1e-8);
});
