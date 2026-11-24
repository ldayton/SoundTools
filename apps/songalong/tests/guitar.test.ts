import test from "node:test";
import assert from "node:assert/strict";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {hymnPreferences,hymnSettingsFromQuery} from "../../../packages/music-practice/src/hymn-settings";
import {instrumentEdition} from "../../../packages/music-practice/src/instrument-editions";
test("legacy guitar links resolve to the sole dedicated guitar score for every song",()=>{
 for(const hymn of hymns)for(const legacy of ["guitar","guitar-chords","guitar-edition","guitar-fingerstyle"]){
  const saved=hymnPreferences(hymn.id,{arrangement:legacy,hands:"left",scoreDisplay:"tab"});
  assert.equal(saved.arrangement,instrumentEdition(hymn)!.guitarArrangement);assert.equal(saved.hands,"left");assert.equal(saved.scoreDisplay,"tab");
  assert.equal(hymnSettingsFromQuery(hymnPreferences(hymn.id),new URLSearchParams({arrangement:legacy})).arrangement,saved.arrangement);
 }
});
