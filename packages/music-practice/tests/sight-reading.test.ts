import { test } from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import { WaitForMe, searchHymns } from "../src/sight-reading-model";
test("wait-for-me never penalizes wrong notes, requires fresh repeated attacks, and completes exactly once", () => {
  const session = new WaitForMe([
    { pitches: [60] },
    { pitches: [60] },
    { pitches: [62] },
  ]);
  assert.equal(session.answer(61), "wrong");
  assert.equal(session.index, 0);
  assert.equal(session.answer(60), "advanced");
  assert.equal(session.index, 1);
  assert.equal(session.answer(60), "advanced");
  assert.equal(session.index, 2);
  assert.equal(session.answer(62), "complete");
  assert.equal(session.answer(62), "ignored");
});
test("MIDI chords require new attacks and notes held together; interruption clears partial attempts", () => {
  const session = new WaitForMe([
    { pitches: [60, 64, 67] },
    { pitches: [60, 64, 67] },
  ]);
  assert.equal(session.answer(60, [60]), "partial");
  assert.equal(session.answer(64, [64]), "partial");
  assert.equal(session.answer(67, [64, 67]), "partial");
  assert.equal(session.answer(60, [60, 64, 67]), "advanced");
  assert.equal(session.answer(60, [60, 64, 67]), "partial"); // Old held E and G are not new attacks.
  session.resetGesture();
  assert.equal(session.answer(64, [60, 64, 67]), "partial");
  assert.equal(session.answer(67, [60, 64, 67]), "partial");
  assert.equal(session.answer(60, [60, 64, 67]), "complete");
});
test("screen chords allow sequential entry, saved positions are validated, and search preserves curated order", () => {
  const session = new WaitForMe([{ pitches: [60, 64] }]);
  assert.equal(session.answer(64), "partial");
  assert.equal(session.answer(60), "complete");
  assert.equal(new WaitForMe([{ pitches: [60] }], 999).index, 0);
  assert.equal(new WaitForMe([{ pitches: [60] }], 1).complete, true);
  assert.equal(
    searchHymns(hymns, "doxology")[0].id,
    "praise-god-from-whom-all-blessings-flow",
  );
  assert.equal(searchHymns(hymns, "HOLY, HOLY")[0].title, "Holy, Holy, Holy");
  assert.equal(searchHymns(hymns, "no such hymn").length, 0);
  assert.deepEqual(searchHymns(hymns, ""), hymns);
});
test("all imported melodies preserve soprano pitch, rhythm, rests, ties, and every lyric slot from their harmonized sources", () => {
  assert.equal(hymns.length, 22);
  const notes = (source: string) =>
    abcjs
      .parseOnly(source)[0]
      .lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .filter((n) => n.el_type === "note")
      .map((n) => {
        if (n.el_type !== "note") throw Error("not a note");
        const top = n.pitches?.reduce((a, b) => (a.pitch > b.pitch ? a : b));
        return {
          duration: n.duration,
          pitch: top?.pitch,
          name: top?.name.match(/^[\^_=]*[A-Ga-g][',]*/)?.[0],
          tie: !!top?.startTie,
          slurStart: top?.startSlur?.length || 0,
          slurEnd: top?.endSlur?.length || 0,
          beamStart: !!n.startBeam,
          beamEnd: !!n.endBeam,
          decorations: n.decoration || [],
          lyric: n.lyric?.[0]?.syllable || "",
          divider: n.lyric?.[0]?.syllable ? n.lyric[0].divider : " ",
        };
      });
  for (const hymn of hymns) {
    assert.match(
      hymn.credits.join(" "),
      "source" in hymn && hymn.source === "tab-music"
        ? /copyright: Rights remain with/
        : /copyright: public domain/,
    );
    assert.deepEqual(notes(hymn.melody), notes(hymn.harmony), hymn.title);
  }
  const grace = notes(hymns[0].melody);
  assert.deepEqual(
    grace.slice(0, 7).map((n) => n.lyric),
    ["A", "maz", "ing", "", "grace!", "How", "sweet"],
  );
  assert.deepEqual(
    grace.slice(0, 7).map((n) => n.duration),
    [0.25, 0.5, 0.125, 0.125, 0.5, 0.25, 0.5],
  );
});

test("three unexpected middle Cs restart from the first note and clear partial chords", () => {
  const session = new WaitForMe([{ pitches: [62] }, { pitches: [64, 67] }]);
  session.answer(62);
  assert.equal(session.answer(64, [64]), "partial");
  assert.equal(session.answer(60, [60]), "wrong");
  assert.equal(session.answer(60, [60]), "wrong");
  assert.equal(session.index, 1);
  assert.equal(session.answer(60, [60]), "restarted");
  assert.equal(session.index, 0);
  assert.deepEqual(session.selected, []);
  assert.equal(session.answer(62), "advanced");
});

test("expected middle Cs, including repeated notes and partial chords, never restart", () => {
  const melody = new WaitForMe([
    { pitches: [62] },
    { pitches: [60] },
    { pitches: [60] },
    { pitches: [60] },
    { pitches: [64] },
  ]);
  melody.answer(62);
  for (let i = 0; i < 3; i++) assert.equal(melody.answer(60), "advanced");
  assert.equal(melody.index, 4);
  assert.equal(melody.answer(60), "wrong");
  assert.equal(melody.answer(60), "wrong");
  assert.equal(melody.index, 4);
  const chord = new WaitForMe([{ pitches: [60, 64] }]);
  for (let i = 0; i < 5; i++) assert.equal(chord.answer(60, [60]), "partial");
  assert.equal(chord.answer(64, [60, 64]), "complete");
});

test("other pitches, interruptions and correct answers break the restart sequence", () => {
  const session = new WaitForMe([{ pitches: [62] }, { pitches: [64] }]);
  session.answer(60);
  session.answer(60);
  session.answer(72); // C5 is not middle C.
  assert.equal(session.answer(60), "wrong");
  session.resetGesture();
  assert.equal(session.answer(60), "wrong");
  session.answer(62); // Correct input is also an intervening gesture.
  assert.equal(session.answer(60), "wrong");
  assert.equal(session.answer(60), "wrong");
  assert.equal(session.index, 1);
  assert.equal(session.answer(60), "restarted");
});

test("restart is available after completion and while ordinary advancement is paused", () => {
  const session = new WaitForMe([{ pitches: [62] }, { pitches: [64] }]);
  session.answer(62);
  assert.equal(session.answer(64, undefined, false), "ignored");
  assert.equal(session.index, 1);
  assert.equal(session.answer(60, undefined, false), "ignored");
  assert.equal(session.answer(60, undefined, false), "ignored");
  assert.equal(session.answer(60, undefined, false), "restarted");
  session.answer(62);
  session.answer(64);
  assert.equal(session.complete, true);
  assert.equal(session.answer(60), "ignored");
  assert.equal(session.answer(60), "ignored");
  assert.equal(session.answer(60), "restarted");
  assert.equal(session.complete, false);
});

test("tab-music keyboard melodies match independently rendered source MIDI, including pickups and tied durations", async () => {
  const { default: fixtures } =
    await import("../../../packages/music-practice/test-fixtures/tab-music-melodies.json");
  for (const [id, fixture] of Object.entries(fixtures)) {
    const hymn = hymns.find((h) => h.id === id)!;
    assert.ok(hymn, id);
    assert.equal(searchHymns(hymns, hymn.title)[0].id, id);
    const tune = abcjs.parseOnly(hymn.melody)[0];
    assert.equal(tune.warnings?.length || 0, 0);
    tune.setUpAudio({});
    const notes: number[][] = [];
    for (const item of tune.lines.flatMap(
      (l) => l.staff?.[0]?.voices?.[0] || [],
    )) {
      if (item.el_type !== "note" || !item.pitches?.length) continue;
      if (item.pitches[0].endTie)
        notes[notes.length - 1][1] += item.duration * 4;
      else {
        const sounding = item as typeof item & {
          midiPitches: { pitch: number }[];
        };
        notes.push([sounding.midiPitches[0].pitch, item.duration * 4]);
      }
    }
    assert.deepEqual(notes, fixture.notes, id);
    assert.ok(hymn.sourceUrl.includes(fixture.sourceCommit));
  }
});
