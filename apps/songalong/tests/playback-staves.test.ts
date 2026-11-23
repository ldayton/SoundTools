import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  abcPlaybackStaves,
  mutePlaybackStaves,
  hidePlaybackStaves,
} from "../../../packages/music-practice/src/hymn-playback-staves";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnInstrumentArrangements } from "../../../packages/music-practice/src/hymn-instruments";
import { instrumentEditionIds } from "../../../packages/music-practice/src/instrument-editions";
import { stagedHymn } from "../../../packages/music-practice/test-fixtures/hymns";
import {
  hymnPreferences,
  mergeHymnSettings,
  hymnSettingsFromQuery,
} from "../../../packages/music-practice/src/hymn-settings";
import { HymnProgress } from "../../../packages/music-practice/src/hymn-progress";
import { migrateLegacy } from "../../../packages/music-practice/src/durable-state";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "../../../packages/music-practice/src/songalong-account-records";
test("teacher staff toggles own Choir, all three Organ treble voices, and Organ bass separately", () => {
  const hymn = hymns.find((h) => h.id === "in-christ-alone-2")!;
  const staves = abcPlaybackStaves(hymn.harmony);
  assert.deepEqual(staves, [
    { index: 0, label: "Choir", clef: "treble", tracks: [0] },
    { index: 1, label: "Organ · treble", clef: "treble", tracks: [1, 2, 3] },
    { index: 2, label: "Organ · bass", clef: "bass", tracks: [4] },
  ]);
  const audio = abcjs
    .parseOnly(hymn.harmony)[0]
    .setUpAudio({ qpm: 60, chordsOff: true });
  for (const muted of [[0], [1], [2], [0, 1, 2]]) {
    const result = mutePlaybackStaves(audio, staves, muted);
    assert.equal(result.totalDuration, 30);
    assert.equal(result.tracks.length, 5);
    for (let i = 0; i < 5; i++)
      assert.deepEqual(
        result.tracks[i],
        muted.some((index) => staves[index].tracks.includes(i))
          ? audio.tracks[i].filter((event) => event.cmd !== "note")
          : audio.tracks[i],
      );
  }
  assert.ok(
    audio.tracks.every((track) => track.some((event) => event.cmd === "note")),
    "input stays intact",
  );
});
test("staff filtering preserves every registered edition's audio clock and unmutes to identical written music", () => {
  for (const id of [stagedHymn.id, ...instrumentEditionIds]) {
    const hymn = hymns.find((h) => h.id === id)!;
    for (const arrangement of id === stagedHymn.id
      ? (["bass", "original"] as const)
      : ([
          "piano",
          hymnInstrumentArrangements(hymn, "guitar")[0].id,
        ] as const)) {
      const score = arrangeHymn(hymn, arrangement, 0, 0, "both");
      const audio = abcjs
        .parseOnly(score.abc)[0]
        .setUpAudio({ qpm: 60, chordsOff: true });
      const staves = abcPlaybackStaves(score.abc);
      assert.ok(staves.length > 0, id);
      assert.deepEqual(
        staves.flatMap((staff) => staff.tracks),
        audio.tracks.map((_, index) => index),
        id + arrangement,
      );
      assert.deepEqual(mutePlaybackStaves(audio, staves, []), audio, id);
      const muted = mutePlaybackStaves(
        audio,
        staves,
        staves.map((staff) => staff.index),
      );
      assert.equal(muted.totalDuration, audio.totalDuration);
      assert.ok(
        muted.tracks.every((track) =>
          track.every((event) => event.cmd !== "note"),
        ),
      );
    }
  }
});
test("stanza scheduling keeps every verse and duration when all staves are silent", () => {
  const score = arrangeHymn(stagedHymn, "bass", 0, 0, "both");
  const audio = abcjs
    .parseOnly(score.abc)[0]
    .setUpAudio({ qpm: 60, chordsOff: true });
  const options = {
    hymn: stagedHymn,
    arrangement: "bass" as const,
    sectionBars: 0,
    section: 0,
    hands: "both" as const,
    totalBars: score.totalBars,
    sections: 1,
    abc: score.abc,
    audio,
    transpose: 0,
    stanzas: [1, 2],
  };
  const all = hymnPlaybackScore(options),
    silent = hymnPlaybackScore({ ...options, mutedStaves: [0, 1] });
  assert.equal(silent.audio.totalDuration, all.audio.totalDuration);
  assert.deepEqual(silent.verses, all.verses);
  assert.ok(
    silent.audio.tracks.every((track) =>
      track.every((event) => event.cmd !== "note"),
    ),
  );
});
test("staff choices normalize, survive URL/account/offline roundtrips and reset when score layout changes", () => {
  const base = hymnPreferences(stagedHymn.id, {
    arrangement: "bass",
    mutedStaves: [1, 1, -1, 2.5, "0", 99],
    hiddenStaves: [0],
  });
  assert.deepEqual(base.mutedStaves, [1]);
  assert.deepEqual(
    hymnSettingsFromQuery(base, new URLSearchParams("mutedStaves=0,1"))
      .mutedStaves,
    [0, 1],
  );
  assert.deepEqual(
    hymnSettingsFromQuery(base, new URLSearchParams("mutedStaves="))
      .mutedStaves,
    [],
  );
  assert.deepEqual(
    mergeHymnSettings(base, { arrangement: "original" }).mutedStaves,
    [],
  );
  assert.deepEqual(
    mergeHymnSettings(base, { viewHands: "left" }).mutedStaves,
    [],
  );
  const progress = new HymnProgress(undefined, []),
    state = migrateLegacy({});
  state.activities.sight = progress.snapshot(base, stagedHymn.key, 1);
  const restored = restoreSongalongRecords(songalongRecords(state));
  const saved = new HymnProgress(restored.activities.sight as any, [
    stagedHymn.id,
  ]).forHymn(stagedHymn.id);
  assert.deepEqual(saved.mutedStaves, [1]);
  assert.deepEqual(saved.hiddenStaves, [0]);
});

test("hidden staves are removed for engraving without changing source voices or playback selection", () => {
  const hymn = hymns.find((h) => h.id === "in-christ-alone-2")!;
  for (const hidden of [[0], [1], [2], [0, 2]]) {
    const tune = abcjs.parseOnly(hymn.harmony)[0];
    hidePlaybackStaves(tune, hidden);
    const remaining = tune.lines.find((line) => line.staff)?.staff!;
    assert.equal(remaining.length, 3 - hidden.length);
    const audio = abcjs
      .parseOnly(hymn.harmony)[0]
      .setUpAudio({ chordsOff: true });
    assert.equal(
      audio.tracks.length,
      5,
      "the source still supplies all five audio voices",
    );
  }
});

test("only the teacher Choir staff uses the choir bank, and staff muting removes that voice independently", () => {
  const hymn = hymns.find((h) => h.id === "in-christ-alone-2")!;
  const score = arrangeHymn(hymn, "original", 0, 0, "both");
  const audio = abcjs
    .parseOnly(score.abc)[0]
    .setUpAudio({ qpm: 60, chordsOff: true });
  const options = {
    hymn,
    arrangement: "original" as const,
    sectionBars: 0,
    section: 0,
    hands: "both" as const,
    totalBars: score.totalBars,
    sections: 1,
    abc: score.abc,
    audio,
    transpose: 0,
    stanzas: [1],
  };
  const mixed = hymnPlaybackScore(options);
  const notes = playbackNotes(mixed.audio);
  assert.ok(notes.some((note) => note.instrument === "choir"));
  assert.ok(notes.some((note) => note.instrument === undefined));
  const organ = hymnPlaybackScore({ ...options, mutedStaves: [0] });
  assert.ok(
    playbackNotes(organ.audio).every((note) => note.instrument !== "choir"),
  );
  const choir = hymnPlaybackScore({ ...options, mutedStaves: [1, 2] });
  assert.ok(
    playbackNotes(choir.audio).every((note) => note.instrument === "choir"),
  );
  assert.equal(choir.audio.totalDuration, mixed.audio.totalDuration);
});
