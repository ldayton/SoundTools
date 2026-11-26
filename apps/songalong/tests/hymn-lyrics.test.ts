import { canonicalHymnId } from "../../../packages/music-practice/src/hymn-identity";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs, { type VoiceItemNote } from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  SOURCE_VARIANTS,
  hymnMelodyOffset,
} from "../../../packages/music-practice/src/hymn-arrangements";
import {
  hymnLyricsAbc,
  hymnLyricRows,
  validStanzas,
  compactHymnLyrics,
  hymnEndingBar,
  hymnStanzaAbc,
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

test("verse-dependent ties split only new syllables in the lead, retaining accompaniment and unconditional ties", () => {
  const source = `X:1\nM:4/4\nL:1/4\n%%score S | B\nV:S clef=treble\nV:B clef=bass\nK:C\n[V:S] "^keep-this"G-G C-C |]\n[V:B] G,4 |]`;
  const hymn = {stanzas: [
    {number:1,label:"Ruler",syllables:["Rul-","er","a","*"]},
    {number:2,label:"Lord",syllables:["Lord","*","a","*"]},
  ],lyricSections:[]};
  const performance = (abc:string) => abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true}).tracks.map(t=>t.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start*4,n.duration*4]]:[]));
  const split = hymnStanzaAbc(source,hymn,1);
  assert.deepEqual(performance(split),[[[67,0,1],[67,1,1],[60,2,2]],[[55,0,4]]]);
  assert.match(split,/keep-this/);
  assert.equal(hymnStanzaAbc(source,hymn,2),source);
  assert.equal(hymnStanzaAbc(source,hymn,0),source,"Without words the printed articulation remains");
  assert.equal(hymnStanzaAbc(split,hymn,1),split,"Applying a stanza twice is idempotent");
  assert.match(source,/G-G C-C/,"The archived source is not mutated");
});

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
    "o-come-all-ye-faithful",
  ])
    assert.equal(hymn(id).stanzas.length, 3);
  assert.equal(hymn("jesus-loves-me").stanzas.length, 4);
  assert.equal(hymn("amazing-grace").stanzas.length, 6);
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

test("unchanged syllabic underlay preserves pitches, timing, ties, rests and accompaniment", () => {
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
    for (const { id } of SOURCE_VARIANTS) {
      for (const [bars, section] of [
        [0, 0],
        [4, 1],
      ]) {
        const score = arrangeHymn(h, id, bars, section, "both");
        const selection = {
          hymn: h,
          selected: h.stanzas.filter(s => s.syllables.every(token => !/\s/.test(token))).map((s) => s.number),
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
  for (const stanza of hymn("jesus-loves-me").stanzas.slice(0,3))
    assert.deepEqual(stanza.syllables.slice(-6), [
      "For~the",
      "Bi-",
      "ble",
      "tells",
      "me",
      "so!",
    ]);
});

test("syllabic subdivisions share one rhythm across selected rows and retain dotted-note beats", async () => {
  const {practiceHymn}=await import("../../../packages/music-practice/test-fixtures/hymns");
  const source="X:1\nM:3/4\nL:1/8\nK:C\n\"C\"!1!C3 D E2- | E2 F4 |]";
  const hymn={...practiceHymn,stanzas:[
    {number:1,label:"one",syllables:["One","two","three-","*","four"]},
    {number:2,label:"עברית",syllables:["א- בא","ב- נו","גד-","*","דו"]},
  ],lyricSections:[]};
  const english=hymnLyricsAbc(source,{hymn,selected:[1],offset:0});
  assert.deepEqual(notes(english).map(n=>n.duration),[3/8,1/8,2/8,2/8,4/8]);
  const mixed=hymnLyricsAbc(source,{hymn,selected:[1,2],offset:0});
  assert.equal(abcjs.parseOnly(mixed)[0].warnings?.length||0,0);
  assert.deepEqual(notes(mixed).map(n=>n.duration),[2/8,1/8,1/16,1/16,2/8,2/8,4/8]);
  assert.deepEqual(notes(mixed).slice(0,4).map(n=>n.lyric?.map((l: {syllable:string})=>l.syllable)),
    [["One","א"],["","בא"],["two","ב"],["","נו"]]);
  assert.equal((mixed.match(/"C"/g)||[]).length,1,"chord annotations are not duplicated");
  assert.equal((mixed.match(/!1!/g)||[]).length,1,"fingering annotations are not duplicated");
  assert.ok(notes(mixed)[4].pitches![0].startTie);
  assert.ok(notes(mixed)[5].pitches![0].endTie);
});

test("melisma identities survive canonical offsets, row compaction and another stanza's subdivisions", async () => {
  const {practiceHymn}=await import("../../../packages/music-practice/test-fixtures/hymns");
  const hymn={...practiceHymn,stanzas:[
    {number:1,label:"sustain",syllables:["Held","_","Next"]},
    {number:2,label:"syllabic",syllables:["First","two notes","Last"]},
  ],lyricSections:[]};
  const source="X:1\nM:4/4\nL:1/4\nK:C\nC D2 E |]";
  const parsed=abcjs.parseOnly(hymnLyricsAbc(source,{hymn,selected:[1,2],offset:0}))[0];
  assert.equal(parsed.warnings?.length||0,0);
  const items=parsed.lines[0].staff![0].voices![0].filter(n=>n.el_type==="note");
  assert.deepEqual(items.map(n=>n.lyric?.map((l:{syllable:string})=>l.syllable)),
    [["Held","First"],["_","two"],["_","notes"],["Next","Last"]]);
  const partial=abcjs.parseOnly(hymnLyricsAbc(source,{hymn,selected:[1,2],offset:1}))[0];
  compactHymnLyrics(partial);
  const first=partial.lines[0].staff![0].voices![0].find(n=>n.el_type==="note")!;
  assert.equal(first.lyric![0].syllable,"_","a continuation keeps its row even when its word is on the previous system");
});

test("verse articulation treats explicit melismas as sustained syllables", async () => {
  const {practiceHymn}=await import("../../../packages/music-practice/test-fixtures/hymns");
  const {hymnStanzaAbc}=await import("../../../packages/music-practice/src/hymn-lyrics");
  const hymn={...practiceHymn,stanzas:[
    {number:1,label:"hold",syllables:["Held","_","End"]},
    {number:2,label:"reattack",syllables:["One","two","End"]},
  ],lyricSections:[]};
  const source="X:1\nM:4/4\nL:1/4\nK:C\nC2- C D |]";
  assert.equal(hymnStanzaAbc(source,hymn,1),source,"_ must not release a printed tie");
  const separate=hymnStanzaAbc(source,hymn,2);
  assert.equal(notes(separate)[0].pitches![0].startTie,undefined);
  assert.equal(notes(separate)[1].pitches![0].endTie,undefined);
});
