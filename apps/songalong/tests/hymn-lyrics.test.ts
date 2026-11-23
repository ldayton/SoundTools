import { canonicalHymnId } from "../../../packages/music-practice/src/hymn-identity";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs, { type VoiceItemNote } from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  ARRANGEMENTS,
  hymnMelodyOffset,
} from "../../../packages/music-practice/src/hymn-arrangements";
import {
  hymnLyricsAbc,
  hymnLyricRows,
  validStanzas,
  compactHymnLyrics,
  hymnEndingBar,
} from "../../../packages/music-practice/src/hymn-lyrics";
import {
  hymnPreferences,
  hymnSettingsFromQuery,
} from "../../../packages/music-practice/src/hymn-settings";
import { hymnProgressKey } from "../../../packages/music-practice/src/hymn-progress";
const hymn = (id: string) => hymns.find((h) => h.id === canonicalHymnId(id))!;
const notes = (abc: string) =>
  abcjs
    .parseOnly(abc)[0]
    .lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
    .filter(
      (n): n is VoiceItemNote => n.el_type === "note" && !!n.pitches?.length,
    );
const words = (tokens: string[]) =>
  tokens
    .filter((t) => t !== "*")
    .join(" ")
    .replace(/-\s+/g, "")
    .replace(/~/g, " ");

test("all bundled stanzas align to the melody, with unique first-word labels", () => {
  for (const h of hymns) {
    assert(h.stanzas.length);
    const length = notes(h.melody).length;
    for (const stanza of h.stanzas) {
      assert(stanza.label.trim());
      assert.equal(stanza.syllables.length, length, h.id);
    }
    assert.equal(
      new Set(
        h.stanzas.map((s) =>
          words(s.syllables)
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ""),
        ),
      ).size,
      h.stanzas.length,
    );
  }
  for (const id of [
    "amazing-grace",
    "jesus-loves-me",
    "o-come-all-ye-faithful",
  ])
    assert.equal(hymn(id).stanzas.length, 3);
  assert.match(
    words(hymn("amazing-grace").stanzas[1].syllables),
    /thought my heart/,
  );
  assert.match(
    words(hymn("jesus-loves-me").stanzas[1].syllables),
    /Walking with me on my way/,
  );
  assert.match(
    words(hymn("jesus-loves-me").stanzas[2].syllables),
    /Close besides me/,
  );
  assert.match(
    words(hymn("in-christ-alone").stanzas[3].syllables),
    /Here in the power of Christ I'll stand!$/,
  );
});

test("a shared chorus appears once, including when the first stanza is unchecked", () => {
  const h = hymn("jesus-loves-me");
  for (const selected of [[1, 2, 3], [2, 3], [3]]) {
    const rows = hymnLyricRows({ hymn: h, selected, offset: 0 });
    assert.equal(
      rows.filter((row) => row.slice(28).some((t) => t !== "*")).length,
      1,
    );
    assert.match(words(rows[0].slice(28)), /For the Bible tells me so!/);
  }
  assert.deepEqual(hymnLyricRows({ hymn: h, selected: [], offset: 0 }), []);
  const parsed = abcjs.parseOnly(
    hymnLyricsAbc(h.melody, { hymn: h, selected: [1, 2, 3], offset: 0 }),
  )[0];
  compactHymnLyrics(parsed);
  const chorus = parsed.lines
    .at(-1)!
    .staff![0].voices![0].filter((n) => n.el_type === "note");
  assert(
    chorus.every((n) => n.el_type !== "note" || (n.lyric?.length || 0) <= 1),
    "shared-only systems reserve only one lyric row",
  );
});

test("lyric selection never changes pitches, timing, ties, rests or accompaniment", () => {
  const performance = (abc: string) =>
    abcjs
      .parseOnly(abc)[0]
      .setUpAudio({ qpm: 60, chordsOff: true })
      .tracks.map((track) =>
        track.flatMap((n) =>
          n.cmd === "note" ? [[n.pitch, n.start, n.duration, n.volume]] : [],
        ),
      );
  for (const h of hymns)
    for (const { id } of ARRANGEMENTS) {
      for (const [bars, section] of [
        [0, 0],
        [4, 1],
      ]) {
        const score = arrangeHymn(h, id, bars, section, "both");
        const selection = {
          hymn: h,
          selected: h.stanzas.map((s) => s.number),
          offset: hymnMelodyOffset(h, score.from),
        };
        const abc = hymnLyricsAbc(score.abc, selection);
        assert.equal(
          abcjs.parseOnly(abc)[0].warnings?.length || 0,
          0,
          h.id + id,
        );
        assert.deepEqual(performance(abc), performance(score.abc), h.id + id);
        const noWords = hymnLyricsAbc(score.abc, {
          ...selection,
          selected: [],
        });
        assert(!/^w:/m.test(noWords));
      }
    }
});

test("stanza choices default independently per hymn, persist empty choices, and survive URLs", () => {
  const p = hymnPreferences("jesus-loves-me");
  assert.deepEqual(p.stanzas, [1]);
  assert.deepEqual(hymnPreferences(p.hymn, { stanzas: [] }).stanzas, []);
  assert.deepEqual(
    hymnPreferences(p.hymn, { stanzas: [3, 2, 2, -1, 99, "1"] }).stanzas,
    [2, 3],
  );
  assert.deepEqual(
    hymnSettingsFromQuery(p, new URLSearchParams("stanzas=2,3")).stanzas,
    [2, 3],
  );
  assert.deepEqual(
    hymnSettingsFromQuery(p, new URLSearchParams("stanzas=none")).stanzas,
    [],
  );
  assert.deepEqual(validStanzas([99], 3), [1]);
});

test("all four teacher verses share the full instrumental ending and musical checkpoint", () => {
  const h=hymn("in-christ-alone");
  assert.equal(h.stanzas.length,4);
  const settings=hymnPreferences(h.id);
  for(const selected of [[1],[2],[3],[4],[1,4],[]]){
    assert.equal(hymnEndingBar(h,selected),undefined);
    assert.equal(arrangeHymn(h,"piano",0,0,"both",hymnEndingBar(h,selected)).totalBars,21);
    assert.equal(hymnProgressKey({...settings,stanzas:selected},h.key),hymnProgressKey(settings,h.key));
  }
});

test("O Come, All Ye Faithful uses the three requested stanzas and one shared refrain", () => {
  const h = hymn("o-come-all-ye-faithful");
  const refrain =
    "O come, let us adore Him O come, let us adore Him O come, let us adore Him Christ the Lord!";
  const verses = [
    "O come, all ye faithful, joyful and triumphant! O come ye, O come ye to Bethlehem Come and behold Him Born the King of angels",
    "Sing, choirs of angels, sing in exultation Oh, sing, all ye citizens of heaven above! Glory to God Glory in the highest",
    "Yes, Lord, we greet Thee, born this happy morning Oh, Jesus to Thee be, oh, glory given Word of the Father Now in flesh appearing",
  ];
  assert.equal(h.referenceUrl, "https://www.youtube.com/watch?v=AuwoGmsUWhU");
  for (const [index, stanza] of h.stanzas.entries())
    assert.equal(words(stanza.syllables), verses[index] + " " + refrain);
  for (const selected of [[1, 2, 3], [2, 3], [3]]) {
    const rows = hymnLyricRows({ hymn: h, selected, offset: 0 });
    assert.equal(
      rows.filter((row) => row.slice(36).some((token) => token !== "*")).length,
      1,
    );
    assert.equal(words(rows[0].slice(36)), refrain);
  }
});

test("reviewed word divisions retain complete syllables and intentional multiword underlay", () => {
  const christ = hymn("in-christ-alone").stanzas;
  assert.deepEqual(christ[0].syllables.slice(21, 23), ["so-", "lid"]);
  assert.deepEqual(christ[0].syllables.slice(49, 52), ["com-", "fort-", "er,"]);
  assert.deepEqual(
    hymn("o-come-all-ye-faithful").stanzas[1].syllables.slice(20, 24),
    ["heav-", "en", "a-", "bove!"],
  );
  // Added lyric pickups share the existing pitch; they must not shift the
  // following phrase or create additional notes in the reference arrangement.
  assert.equal(christ[2].syllables[24], "Up");
  assert.equal(christ[3].syllables[24], "Je-");
  for (const stanza of hymn("jesus-loves-me").stanzas)
    assert.deepEqual(stanza.syllables.slice(-6), [
      "For~the",
      "Bi-",
      "ble",
      "tells",
      "me",
      "so!",
    ]);
});
