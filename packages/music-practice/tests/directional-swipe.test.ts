import test from "node:test";
import assert from "node:assert/strict";
import {swipeDirection} from "@ldayton/browser-controls/directional-swipe";
test("reader swipes reject vertical, diagonal and small gestures",()=>{
  assert.equal(swipeDirection(-100,10),"left");assert.equal(swipeDirection(100,-10),"right");
  assert.equal(swipeDirection(10,100),undefined);assert.equal(swipeDirection(80,70),undefined);assert.equal(swipeDirection(10,0),undefined);
});
test("four-direction scale gestures retain their existing directions and threshold",()=>{
  const o={axes:"both",dominance:1} as const;
  assert.equal(swipeDirection(0,40,o),"down");assert.equal(swipeDirection(0,-40,o),"up");assert.equal(swipeDirection(-40,0,o),"left");assert.equal(swipeDirection(0,39,o),undefined);
});
