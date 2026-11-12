import { test } from "node:test";
import assert from "node:assert/strict";
import { countInPlan } from "../src/hymn-count-in";
import { HymnPlayback } from "../src/hymn-playback";
import type { AudioTracks } from "abcjs";
import { mergeHymnSettings, hymnSettingsFromQuery } from "../src/hymn-settings";
test("count-in lengths, metrical accents and pickups use score quarter-note time", () => {
  const half = countInPlan({ meter: "4/4", pickup: 0 }, 0.5);
  assert.equal(half.duration, 2);
  assert.deepEqual(half.clicks, [
    { at: 0, accent: false },
    { at: 1, accent: false },
  ]);
  const two = countInPlan({ meter: "4/4", pickup: 0 }, 2);
  assert.equal(two.duration, 8);
  assert.deepEqual(
    two.clicks.filter((c) => c.accent).map((c) => c.at),
    [0, 4],
  );
  assert.equal(countInPlan({ meter: "3/4", pickup: 0 }, 0.5).duration, 1.5);
  const compound = countInPlan({ meter: "6/8", pickup: 0 }, 2);
  assert.equal(compound.duration, 6);
  assert.equal(compound.beats, 2);
  assert.deepEqual(
    compound.clicks.map((c) => c.at),
    [0, 1.5, 3, 4.5],
  );
  assert.deepEqual(countInPlan({ meter: "3/4", pickup: 1 }, 1).clicks, [
    { at: 0, accent: false },
    { at: 1, accent: true },
    { at: 2, accent: false },
  ]);
  assert.equal(countInPlan({ meter: "9/8", pickup: 0 }, 1).beats, 3);
  assert.deepEqual(countInPlan({ meter: "4/4", pickup: 0 }, 0).clicks, []);
  assert.deepEqual(countInPlan({ meter: "none", pickup: 0 }, 0).clicks, []);
  assert.throws(() => countInPlan({ meter: "none", pickup: 0 }, 1));
});
test("count-ins gate score audio, count-only practice stays silent, and cancellation stops clicks", async () => {
  const oldWindow = (globalThis as any).window;
  let tick = () => {},
    now = 0,
    running = true,
    stops = 0;
  const notes: number[][] = [],
    clicks: (number | boolean)[][] = [],
    prepared: number[][] = [];
  (globalThis as any).window = {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 123;
    },
  };
  const output = {
    get now() {
      return now;
    },
    get running() {
      return running;
    },
    schedule: (...args: number[]) => {
      notes.push(args);
    },
    click: (time: number, accent: boolean) => {
      clicks.push([time, accent]);
    },
    stop: () => {
      stops++;
    },
  };
  const player = new HymnPlayback(
    () => {},
    (e) => {
      throw e;
    },
    async (pitches) => {
      prepared.push(pitches);
      return output;
    },
  );
  const score = {
    tracks: [[{ cmd: "note", pitch: 60, start: 0, duration: 1, volume: 100 }]],
    totalDuration: 1,
  } as AudioTracks;
  try {
    player.load(score);
    await player.play(60, 0.5);
    assert.equal(player.state, "counting");
    assert.equal(notes.length, 0);
    assert.equal(clicks.length, 2);
    now = 2;
    tick();
    assert.equal(notes[0][1], 2.06);
    now = 2.07;
    tick();
    assert.equal(player.state, "playing");
    player.pause();
    assert.ok(stops > 0);
    now = 10;
    notes.length = 0;
    player.load(score);
    await player.play(60, 1, true);
    assert.deepEqual(prepared.at(-1), []);
    now = 14.07;
    tick();
    assert.equal(player.state, "complete");
    assert.equal(player.position, 0);
    assert.equal(notes.length, 0);
    player.restart();
    await player.play(60, 2, true);
    player.pause();
    now = 30;
    tick();
    // The real interval is cleared by pause; a stale queued callback must not restart audio.
    assert.equal(notes.length, 0);
    assert.equal(player.state, "paused");
    running = false;
  } finally {
    player.pause();
    (globalThis as any).window = oldWindow;
  }
});
test("count-in choices persist and malformed values retain the previous choice", () => {
  const base = {
    hymn: "amazing-grace",
    arrangement: "melody" as const,
    sectionBars: 4 as const,
    section: 0,
    position: 0,
    countIn: 1 as const,
  };
  assert.equal(mergeHymnSettings(base, { countIn: 0.5 }).countIn, 0.5);
  assert.equal(mergeHymnSettings(base, { countIn: 3 }).countIn, 1);
  assert.equal(
    hymnSettingsFromQuery(base, new URLSearchParams("countIn=2")).countIn,
    2,
  );
});

test("old section preferences and shared links always open the whole hymn", () => {
  const base = {
    hymn: "amazing-grace",
    arrangement: "melody" as const,
    sectionBars: 4 as const,
    section: 3,
    position: 0,
  };
  assert.equal(
    mergeHymnSettings(base, { sectionBars: 2, section: 5 }).sectionBars,
    0,
  );
  const settings = hymnSettingsFromQuery(
    base,
    new URLSearchParams("bars=2&section=3"),
  );
  assert.equal(settings.sectionBars, 0);
  assert.equal(settings.section, 0);
});
