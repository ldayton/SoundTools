import test from "node:test";
import assert from "node:assert/strict";
import {christPickedBars} from "../src/christ-picked-accompaniment";
test("a four-pluck chord cycle crosses 3/4 bars without restarting", () => {
  assert.deepEqual(christPickedBars([[{at:0,chord:"D"}],[{at:0,chord:"D"}]], [48,48]), [
    '"C"[CGce]16 D16 [Gce]16', 'D16 [CGce]16 D16',
  ]);
});
test("a two-beat chord stops after bass plus trebles and open D, then resets on the change", () => {
  assert.deepEqual(christPickedBars([[{at:0,chord:"D"},{at:32,chord:"G"}],[{at:0,chord:"G"}]], [48,48]), [
    '"C"[CGce]16 D16 "F"[FAcf]16', 'D16 [Acf]16 D16',
  ]);
});
test("pickup silence and mid-beat changes retain timing and tie across the barline", () => {
  assert.deepEqual(christPickedBars([[{at:0,chord:""},{at:8,chord:"D"}],[{at:0,chord:"D"},{at:16,chord:"A"}]], [16,32]), [
    'z8 "C"[CGce]8-', '[CGce]8 D8 "G"[G,GBg]16',
  ]);
});
