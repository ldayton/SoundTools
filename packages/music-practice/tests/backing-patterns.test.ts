import { test } from "node:test";
import assert from "node:assert/strict";
import { backingPattern, backingPatterns } from "../src/backing-patterns";
import {
  backingSampleChoices,
  backingSettings,
  type BackingEvent,
  type backingPack,
} from "../src/backing-track-model";
import { backingChokes } from "../src/backing-performance";

test("patterns normalize old settings and settings from another genre", () => {
  assert.equal(backingSettings({ style: "folk" }).pattern, "fingerpicked");
  assert.equal(backingPattern("country", "fingerpicked"), "two-step");
  assert.equal(
    backingPattern("country", "train"),
    "two-step",
    "retired train setting safely falls back",
  );
  assert.equal(backingPatterns("country").length, 1);
  assert.equal(backingPatterns("folk").length, 2);
  assert.equal(backingPattern("rock", "train"), "standard");
  assert.deepEqual(backingPatterns("soul"), []);
});

test("two guitars share a part without sharing recordings or physical strings", () => {
  const event: BackingEvent = {
    part: "guitar",
    instrument: "acoustic-steel",
    note: 64,
    string: 5,
    beat: 0,
    duration: 1,
    velocity: 40,
    level: 1,
  };
  const sample = {
    file: "a.flac",
    part: "guitar",
    note: 64,
    string: 5,
    velocity: 40,
    rr: 0,
    gain: 1,
    release: false,
  } as const;
  const pack = {
    samples: {
      acoustic: { ...sample, instrument: "acoustic-steel" },
      electric: { ...sample, instrument: "electric-twang" },
    },
  } as unknown as typeof backingPack;
  assert.deepEqual(
    backingSampleChoices(event, 9, false, undefined, pack).map(([id]) => id),
    ["acoustic"],
  );
  assert.deepEqual(
    backingSampleChoices(event, 9, true, undefined, pack),
    [],
    "no invented note-off sample",
  );
  assert.equal(
    backingChokes(event, { ...event, instrument: "electric-twang" }),
    false,
  );
  assert.equal(backingChokes(event, event), true);
});
