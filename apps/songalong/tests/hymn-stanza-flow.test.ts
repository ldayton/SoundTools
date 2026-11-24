import { swingAudio } from "../../../packages/music-practice/src/hymn-swing";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  SOURCE_VARIANTS,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import {
  HymnPlayback,
  playbackNotes,
} from "../../../packages/music-practice/src/hymn-playback";
import { hymnEndingBar, hymnLyricsAbc } from "../../../packages/music-practice/src/hymn-lyrics";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import {
  HymnProgress,
  hymnProgressKey,
} from "../../../packages/music-practice/src/hymn-progress";

function sequence(
  hymn: (typeof hymns)[number],
  selected: number[],
  arrangement: (typeof SOURCE_VARIANTS)[number]["id"] = "melody",
) {
  const score = arrangeHymn(hymn, arrangement, 0);
  const audio = abcjs
    .parseOnly(score.abc)[0]
    .setUpAudio({ qpm: 60, chordsOff: true });
  return hymnPlaybackScore({
    hymn,
    arrangement,
    sectionBars: 0,
    section: 0,
    hands: "both",
    totalBars: score.totalBars,
    sections: 1,
    abc: score.abc,
    audio,
    transpose: 0,
    stanzas: selected,
  });
}

test("checked stanzas form an ordered, gapless timeline with their written lyric rhythms", () => {
  for (const h of hymns)
    for (const { id } of SOURCE_VARIANTS) {
      const selected = h.stanzas.map((s) => s.number);
      const plan = sequence(h, selected, id);
      assert.deepEqual(
        plan.verses.map((v) => v.number),
        selected,
      );
      let duration = 0;
      const expected: ReturnType<typeof playbackNotes> = [];
      for (const verse of plan.verses) {
        const abc = arrangeHymn(
          h,
          id,
          0,
          0,
          "both",
          hymnEndingBar(h, [verse.number]),
        ).abc;
        const written = hymnLyricsAbc(abc, {hymn:h,selected,offset:0});
        const audio = abcjs
          .parseOnly(h.slug === "in-christ-alone" ? written.replaceAll(":|","|]") : written)[0]
          .setUpAudio({ qpm: 60, chordsOff: true });
        assert.equal(verse.start, duration);
        expected.push(
          ...playbackNotes(swingAudio(audio, h.feel === "swing")).map((n) => ({
            ...n,
            start: n.start + duration,
          })),
        );
        duration += audio.totalDuration * 4;
        assert(Math.abs(verse.end - duration) < 1e-8);
      }
      const sort = (notes: typeof expected) =>
        notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      assert.deepEqual(
        sort(playbackNotes(plan.audio).map(({instrument, ...written})=>written)),
        sort(expected),
        h.id + id,
      );
      assert.equal(plan.audio.totalDuration * 4, duration);
    }
  const h = hymns.find((h) => h.slug === "in-christ-alone")!;
  const plan = sequence(h, [3, 1, 3]);
  assert.deepEqual(
    plan.verses.map((v) => v.number),
    [1, 3],
  );
  assert.equal(plan.verses[1].end - plan.verses[1].start,plan.verses[0].end);
  assert.deepEqual(
    sequence(h, []).verses.map((v) => v.number),
    [0],
    "No words still plays the melody once",
  );
});

test("the next stanza is scheduled ahead of the boundary without restarting or adding a count-in", async () => {
  const oldWindow = (globalThis as any).window,
    oldClear = globalThis.clearInterval;
  let tick = () => {},
    now = 0,
    prepares = 0,
    stops = 0;
  const scheduled: number[][] = [];
  (globalThis as any).window = {
    setInterval(fn: () => void) {
      tick = fn;
      return 1;
    },
  };
  globalThis.clearInterval = (() => {}) as any;
  const plan = sequence(hymns[0], [1, 3]);
  const player = new HymnPlayback(
    () => {},
    (error) => {
      throw error;
    },
    async () => {
      prepares++;
      return {
        get now() {
          return now;
        },
        running: true,
        schedule(p, t, d) {
          scheduled.push([p, t, d]);
        },
        stop() {
          stops++;
        },
      };
    },
  );
  try {
    player.load(plan.audio);
    await player.play(60);
    const origin = scheduled[0][1],
      boundary = plan.verses[1].start;
    now = origin + boundary - 0.08;
    tick();
    assert(
      scheduled.some((n) => Math.abs(n[1] - (origin + boundary)) < 1e-8),
      "Next pickup is already scheduled before the previous verse finishes",
    );
    now = origin + boundary + 0.01;
    tick();
    assert.equal(player.state, "playing");
    assert.equal(prepares, 1);
    assert.equal(stops, 0);
    now = origin + plan.verses[1].end + 0.1;
    tick();
    assert.equal(player.state, "complete");
  } finally {
    player.pause();
    (globalThis as any).window = oldWindow;
    globalThis.clearInterval = oldClear;
  }
});

test("active stanza checkpoints survive reload independently and damaged selections fall back safely", () => {
  const settings = {
    ...hymnPreferences("amazing-grace", { stanzas: [1, 3], stanza: 3 }),
    position: 4,
  };
  const store = new HymnProgress(undefined, []);
  const saved = store.snapshot(settings, "G", 1, {
    content: "verse3",
    length: 35,
    paused: false,
  });
  const loaded = new HymnProgress(saved, [settings.hymn]);
  assert.equal(loaded.forHymn(settings.hymn).stanza, 3);
  assert.deepEqual(loaded.restore(settings, "G", "verse3", 35), {
    position: 4,
    paused: false,
  });
  assert.notEqual(
    hymnProgressKey(settings, "G"),
    hymnProgressKey({ ...settings, stanza: 1 }, "G"),
  );
  assert.equal(
    hymnPreferences(settings.hymn, { stanzas: [1, 3], stanza: 2 }).stanza,
    1,
  );
  assert.equal(
    hymnPreferences(settings.hymn, { stanzas: [], stanza: 3 }).stanza,
    0,
  );
});
