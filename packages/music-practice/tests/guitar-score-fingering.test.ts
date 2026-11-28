import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { planScoreGuitarFingerings } from "../src/beginner-score";

test("score adapter keeps voices simultaneous across systems, barlines, rests and ties", () => {
  const tune = abcjs.parseOnly(
    "X:1\nM:4/4\nL:1/4\n%%score (m b)\nV:m clef=treble\nV:b clef=treble\nK:C\n[V:m] A-A B z |\nA4 |]\n[V:b] D4 | E4 |]",
  )[0];
  tune.setUpAudio({ qpm: 60, chordsOff: true });
  const result = planScoreGuitarFingerings(tune, 0, 0, (pitch) => ({
    str: pitch === 62 || pitch === 64 ? 4 : 2,
    num: pitch === 62 ? 5 : pitch === 64 ? 7 : pitch === 69 ? 2 : 4,
  }));
  assert.ok(result.plan);
  const notes = result.plan.notes;
  assert.deepEqual(
    notes.filter((n) => n.string === 5).map((n) => [n.start, n.duration]),
    [
      [0, 4],
      [4, 4],
    ],
  );
  const tied = notes.find((n) => n.tieFrom)!;
  assert.equal(tied.start, 1);
  assert.equal(tied.finger, notes.find((n) => n.id === tied.tieFrom)!.finger);
  assert.ok(
    result.plan.states.some(
      (s) => s.at === 3 && Object.keys(s.fingers).length === 1,
    ),
  );
  assert.equal(result.plan.states.at(-1)!.until, 8);
});
test("unsupported tab position suppresses the whole suggestion rather than omitting a held constraint", () => {
  const tune = abcjs.parseOnly("X:1\nL:1/4\nK:C\n[CE]4 |]")[0];
  tune.setUpAudio({ qpm: 60 });
  assert.equal(
    planScoreGuitarFingerings(tune, 0, 0, () => undefined).plan,
    null,
  );
});

import hymns from "../src/hymns.json";
import {
  instrumentEditionIds,
  chordEdition,
  instrumentEdition,
} from "../src/instrument-editions";
import { arrangeHymn } from "../src/hymn-arrangements";
for (const id of instrumentEditionIds)
  test(`registered guitar edition ${id} has a complete phrase plan`, () => {
    const hymn = hymns.find((h) => h.id === id)!,
      profile = chordEdition(hymn);
    const tune = abcjs.parseOnly(
      arrangeHymn(hymn, instrumentEdition(hymn)!.guitarArrangement, 0).abc,
    )[0];
    tune.setUpAudio({ qpm: 60, chordsOff: true, midiTranspose: -12 });
    const { plan } = planScoreGuitarFingerings(tune, 0, 0, profile?.position, {
      capo: profile?.capo || 0,
    });
    assert.ok(plan);
    assert.ok(plan.notes.length > 0);
    const root = (id: string): string => {
      const n = plan.notes.find((n) => n.id === id)!;
      return n.tieFrom ? root(n.tieFrom) : id;
    };
    for (const state of plan.states) {
      const active = plan.notes.filter(
        (n) =>
          n.start <= state.at + 1e-7 && n.start + n.duration > state.at + 1e-7,
      );
      assert.deepEqual(
        Object.keys(state.fingers).sort(),
        [...new Set(active.map((n) => root(n.id)))].sort(),
      );
    }
  });

test("guitar staff planning excludes the singer and retains source identity when Voice is hidden",()=>{
 const tune=abcjs.parseOnly("X:1\nM:4/4\nL:1/4\n%%score Voice | Guitar\nV:Voice clef=treble\nV:Guitar clef=treble-8\nK:C\n[V:Voice] c4 |]\n[V:Guitar] [CEG]4 |]")[0];
 tune.setUpAudio({chordsOff:true});
 const position=(pitch:number)=>({48:{str:4,num:3},52:{str:3,num:2},55:{str:2,num:0}} as Record<number,{str:number;num:number}>)[pitch];
 assert.equal(planScoreGuitarFingerings(tune,0,0,position).plan,null);
 const selected=planScoreGuitarFingerings(tune,0,0,position,{},[1]);
 assert(selected.plan);assert.equal(selected.plan.notes.length,3);
 for(const line of tune.lines)line.staff=line.staff?.slice(1).map(staff=>Object.assign(staff,{originalStaffIndex:1}));
 assert.deepEqual(planScoreGuitarFingerings(tune,0,0,position,{},[1]).plan?.notes,selected.plan.notes);
});
