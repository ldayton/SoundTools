import test from "node:test";
import assert from "node:assert/strict";
import type { AudioTracks } from "abcjs";
import { HymnPlayback, playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
const score = {
  tempo: 60,
  instrument: 0,
  totalDuration: 2,
  tracks: [
    [
      { cmd: "note", pitch: 60, start: 0, duration: 0.5, volume: 100 },
      { cmd: "note", pitch: 62, start: 0.75, duration: 0.25, volume: 100 },
      { cmd: "note", pitch: 64, start: 1, duration: 1, volume: 100 },
    ],
  ],
} as AudioTracks;
test("playback preserves rests, note lengths, chords and pitches in quarter-note time", () => {
  assert.deepEqual(
    playbackNotes(score).map((n) => [n.pitch, n.start, n.duration]),
    [
      [60, 0, 2],
      [62, 3, 1],
      [64, 4, 4],
    ],
  );
});
test("audio-clock transport preserves position, handles live tempo and skips stale notes after a stall", async () => {
  const oldWindow = (globalThis as any).window;
  const oldClear = globalThis.clearInterval;
  let tick = () => {};
  (globalThis as any).window = {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 123;
    },
  };
  globalThis.clearInterval = (() => {}) as any;
  let now = 0,
    running = true,
    stops = 0;
  const scheduled: number[][] = [];
  const output = {
    get now() {
      return now;
    },
    get running() {
      return running;
    },
    schedule: (p: number, t: number, d: number) => {
      scheduled.push([p, t, d]);
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
    async () => output,
  );
  try {
    player.load(score);
    await player.play(60);
    assert.equal(player.state, "playing");
    assert.deepEqual(scheduled[0], [60, 0.06, 2]);
    now = 1.06;
    tick();
    player.pause();
    assert.equal(player.position, 1);
    await player.play(120);
    assert.equal(scheduled.at(-1)![0], 60);
    assert.equal(
      scheduled.at(-1)![2],
      0.5,
      "resume includes only remainder of sustained note",
    );
    now = 1.62;
    tick();
    assert.equal(player.position, 2);
    player.setTempo(60);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(player.state, "playing");
    now = 5.68;
    tick();
    assert.equal(
      scheduled.filter((n) => n[0] === 62).length,
      0,
      "no burst of missed notes after a long stall",
    );
    assert.equal(scheduled.at(-1)![0], 64);
    running = false;
    tick();
    assert.equal(player.state, "paused");
    assert.ok(stops >= 3);
    player.restart();
    assert.equal(player.position, 0);
    assert.equal(player.state, "ready");
  } finally {
    (globalThis as any).window = oldWindow;
    globalThis.clearInterval = oldClear;
  }
});
test("cancelled loading cannot start a song, and failed preparation is retryable", async () => {
  let resolve!: (value: any) => void,
    stopped = 0,
    failures = 0;
  const player = new HymnPlayback(
    () => {},
    () => {
      failures++;
    },
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  player.load(score);
  const pending = player.play(80);
  player.pause();
  resolve({
    stop: () => {
      stopped++;
    },
  });
  await pending;
  assert.equal(player.state, "paused");
  assert.equal(stopped, 1);
  const failing = new HymnPlayback(
    () => {},
    () => {
      failures++;
    },
    async () => {
      throw Error("offline");
    },
  );
  failing.load(score);
  await failing.play(80);
  assert.equal(failing.state, "paused");
  assert.equal(failures, 1);
});

test("sections share one audio timeline, with the next section scheduled before the boundary", async () => {
  const oldWindow = (globalThis as any).window;
  const oldClear = globalThis.clearInterval;
  let tick = () => {},
    now = 0,
    stops = 0;
  const notes: number[][] = [];
  (globalThis as any).window = {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
  };
  globalThis.clearInterval = (() => {}) as any;
  const player = new HymnPlayback(
    () => {},
    (e) => {
      throw e;
    },
    async () => ({
      get now() {
        return now;
      },
      get running() {
        return true;
      },
      schedule: (pitch: number, start: number, duration: number) => {
        notes.push([pitch, start, duration]);
      },
      stop: () => {
        stops++;
      },
    }),
  );
  try {
    const doubled = {
      ...score,
      totalDuration: 4,
      tracks: score.tracks.map((track) => [
        ...track,
        ...track.map((item) =>
          item.cmd === "note" ? { ...item, start: item.start + 2 } : item,
        ),
      ]),
    };
    player.load(doubled, [0, 8]);
    await player.play(60);
    now = 7.96;
    tick();
    assert.equal(notes.at(-1)![0], 60);
    assert.ok(
      Math.abs(notes.at(-1)![1] - 8.06) < 0.001,
      "no added gap at the next section",
    );
    now = 8.16;
    tick();
    assert.equal(player.section, 1);
    assert.ok(Math.abs(player.sectionPosition - 0.1) < 0.001);
    assert.equal(player.state, "playing");
    assert.equal(stops, 0);
    now = 16.16;
    tick();
    assert.equal(player.state, "complete");
  } finally {
    player.pause();
    (globalThis as any).window = oldWindow;
    globalThis.clearInterval = oldClear;
  }
});

test("cross-section tied notes stay single attacks, and starting mid-hymn clips the held note", async () => {
  const oldWindow = (globalThis as any).window;
  const oldClear = globalThis.clearInterval;
  let now = 0,
    tick = () => {};
  const attacks: number[][] = [];
  (globalThis as any).window = {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
  };
  globalThis.clearInterval = (() => {}) as any;
  const player = new HymnPlayback(
    () => {},
    (e) => {
      throw e;
    },
    async () => ({
      get now() {
        return now;
      },
      get running() {
        return true;
      },
      schedule: (pitch: number, start: number, duration: number) => {
        attacks.push([pitch, start, duration]);
      },
      stop: () => {},
    }),
  );
  const tied = {
    ...score,
    totalDuration: 1,
    tracks: [[{ cmd: "note", pitch: 60, start: 0, duration: 1, volume: 100 }]],
  } as AudioTracks;
  try {
    player.load(tied, [0, 2]);
    await player.play(60);
    now = 2.16;
    tick();
    assert.equal(player.section, 1);
    assert.equal(attacks.length, 1, "no second attack for a tied note");
    player.load(tied, [0, 2], 1);
    await player.play(60);
    assert.equal(
      attacks.at(-1)![2],
      2,
      "starts with the remaining half of the tied note",
    );
  } finally {
    player.pause();
    (globalThis as any).window = oldWindow;
    globalThis.clearInterval = oldClear;
  }
});

test("every section boundary matches the continuous score duration in each hymn arrangement", async () => {
  const { default: abcjs } = await import("abcjs");
  const { arrangeHymn, ARRANGEMENTS } =
    await import("../../../packages/music-practice/src/hymn-arrangements");
  const { default: hymns } = await import("../../../packages/music-practice/src/hymns.json");
  for (const hymn of hymns)
    for (const { id } of ARRANGEMENTS) {
      const first = arrangeHymn(hymn, id, 2, 0);
      const full = arrangeHymn(hymn, id, first.totalBars, 0);
      const duration = (abc: string) =>
        abcjs.parseOnly(abc)[0].setUpAudio({ qpm: 60, chordsOff: true })
          .totalDuration;
      const sections = Array.from({ length: first.sections }, (_, i) =>
        duration(arrangeHymn(hymn, id, 2, i).abc),
      );
      assert.ok(
        Math.abs(sections.reduce((a, b) => a + b, 0) - duration(full.abc)) <
          0.00001,
        `${hymn.id} ${id}: no lost or added time at section boundaries`,
      );
    }
});

test("passage playback clips sustained notes at both ends and restarts inside the range", async () => {
  const oldWindow = (globalThis as any).window;
  const oldClear = globalThis.clearInterval;
  let tick = () => {},
    now = 0;
  const played: number[][] = [];
  (globalThis as any).window = {
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
  };
  globalThis.clearInterval = (() => {}) as any;
  const player = new HymnPlayback(
    () => {},
    (e) => {
      throw e;
    },
    async () => ({
      get now() {
        return now;
      },
      running: true,
      schedule: (p, t, d) => {
        played.push([p, t, d]);
      },
      stop: () => {},
    }),
  );
  try {
    player.load(score);
    player.setRange(1, 3.5);
    await player.play(60);
    assert.deepEqual(
      played[0],
      [60, 0.06, 1],
      "held note begins at the passage start",
    );
    now = 2.06;
    tick();
    assert.deepEqual(
      played.at(-1),
      [62, 2.06, 0.5],
      "last note ends at the passage boundary",
    );
    now = 2.56;
    tick();
    assert.equal(player.state, "complete");
    assert.equal(player.position, 3.5);
    assert.equal(
      played.some(([p]) => p === 64),
      false,
      "never schedules beyond the passage",
    );
    player.restart();
    assert.equal(player.position, 1);
    player.setRange();
    assert.equal(player.position, 0, "clearing restores the full score");
  } finally {
    player.pause();
    (globalThis as any).window = oldWindow;
    globalThis.clearInterval = oldClear;
  }
});
