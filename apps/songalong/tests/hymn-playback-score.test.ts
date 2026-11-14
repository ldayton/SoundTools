import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";

test("prepared hymn audio matches full editions, transposition and pickup timing for every hymn", () => {
  for (const hymn of hymns) {
    for (const hands of ["right", "left", "both"] as const) {
      const score = arrangeHymn(hymn, "bass", 0, 0, hands);
      const audio = abcjs
        .parseOnly(score.abc)[0]
        .setUpAudio({ qpm: 60, chordsOff: true, midiTranspose: 2 });
      const prepared = hymnPlaybackScore({
        hymn,
        arrangement: "bass",
        sectionBars: 0,
        section: 0,
        hands,
        totalBars: score.totalBars,
        sections: score.sections,
        abc: score.abc,
        audio,
        transpose: 2,
      });
      assert.equal(prepared.audio, audio);
      assert.deepEqual(prepared.starts, [0]);
      assert.equal(
        prepared.timing.pickup,
        abcjs.parseOnly(score.abc)[0].getPickupLength() * 4,
      );
      assert.equal(prepared.timing.meter, hymn.meter);
    }
    const section = arrangeHymn(hymn, "original", 2, 1, "both");
    const audio = abcjs
      .parseOnly(section.abc)[0]
      .setUpAudio({ qpm: 60, chordsOff: true, midiTranspose: -2 });
    const prepared = hymnPlaybackScore({
      hymn,
      arrangement: "original",
      sectionBars: 2,
      section: section.section,
      hands: "both",
      totalBars: section.totalBars,
      sections: section.sections,
      abc: section.abc,
      audio,
      transpose: -2,
    });
    const full = arrangeHymn(hymn, "original", section.totalBars, 0, "both");
    const expected = abcjs
      .parseOnly(full.abc)[0]
      .setUpAudio({ qpm: 60, chordsOff: true, midiTranspose: -2 });
    assert.deepEqual(
      playbackNotes(prepared.audio),
      playbackNotes(expected),
      hymn.id,
    );
    assert.equal(prepared.starts.length, section.sections);
    assert.equal(prepared.starts[0], 0);
    assert.ok(
      prepared.starts.every(
        (start, i) => i === 0 || start > prepared.starts[i - 1],
      ),
    );
  }
});
