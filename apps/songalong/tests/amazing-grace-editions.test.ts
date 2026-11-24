import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import {
  graceGuitarPosition,
  graceLyricData,
  graceChordOffset,
} from "../../../packages/music-practice/src/amazing-grace";
const hymn = hymns.find((h) => h.slug === "amazing-grace")!;
function read(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
  return {
    tune,
    audio,
    tracks: audio.tracks.map((track) =>
      track.flatMap((n) =>
        n.cmd === "note" ? [[n.pitch, n.start * 4, n.duration * 4]] : [],
      ),
    ),
  };
}
const progression: [number, string, number][] = [
  [0, "G", 1],
  [1, "G", 3],
  [4, "G", 2],
  [6, "D7", 1],
  [7, "Em", 2],
  [9, "C", 1],
  [10, "G", 3],
  [13, "G", 3],
  [16, "G", 2],
  [18, "D7", 1],
  [19, "G", 5],
  [24, "G", 1],
  [25, "G", 3],
  [28, "G", 3],
  [31, "C", 3],
  [34, "G", 3],
  [37, "Em", 2],
  [39, "G", 1],
  [40, "G", 2],
  [42, "D7", 1],
  [43, "G", 5],
];
const pianoChords: Record<string, number[]> = {
  G: [43, 47, 50],
  C: [48, 52, 55],
  Em: [40, 43, 47],
  D7: [42, 45, 48],
};
const guitarChords: Record<string, number[]> = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  Em: [40, 47, 52, 55, 59, 64],
  D7: [50, 57, 60, 66],
};
test("Amazing Grace exposes Piano, Guitar and Voice + Piano and migrates saved arrangements", () => {
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => [a.id, a.label]),
    [
      ["original", "Voice + Piano"],
      ["guitar-vocal", "Guitar + Voice"],
      ["piano", "Piano"],
      ["guitar-edition", "Guitar"],
    ],
  );
  for (const arrangement of ["melody", "bass", "chords", "broken"])
    assert.equal(
      hymnPreferences(hymn.id, { arrangement }).arrangement,
      "piano",
    );
  for (const arrangement of [
    "guitar",
    "guitar-chords",
    "guitar-edition",
    "guitar-fingerstyle",
  ]) {
    const s = hymnPreferences(hymn.id, {
      arrangement,
      hands: "left",
      scoreDisplay: "tab",
    });
    assert.equal(s.arrangement, "guitar-edition");
    assert.equal(s.hands, "left");
    assert.equal(s.scoreDisplay, "tab");
  }
  assert.equal(hymnPreferences(hymn.id,{arrangement:"original"}).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id).bpm, 72);
});
test("piano preserves every source melody attack, ornament, and tie with compact accompaniment", () => {
  const source = read(hymn.harmony),
    score = arrangeHymn(hymn, "piano", 0),
    piano = read(score.abc);
  assert.deepEqual(piano.tracks[0], source.tracks[0]);
  assert.equal(piano.audio.totalDuration * 4, 48);
  assert.deepEqual(
    piano.tune.lines[0].staff?.map((s) => s.clef?.type),
    ["treble", "bass"],
  );
  const expected = progression.flatMap(([start, chord, duration]) =>
    pianoChords[chord].map((p) => [p, start, duration]),
  );
  assert.deepEqual(piano.tracks[1], expected);
  assert(
    Math.max(...piano.tracks[1].map((n) => n[0])) <
      Math.min(...piano.tracks[0].map((n) => n[0])),
  );
  for (const chord of Object.values(pianoChords))
    assert(chord.at(-1)! - chord[0] <= 7);
  for (const [hand, index] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      piano.tracks[index],
    );
});
test("guitar preserves the reviewed harmonic rhythm, ringing ties, and four open shapes without a capo", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc);
  assert.equal(score.tune.lines[0].staff?.[0].clef?.type, "treble-8");
  assert.equal(score.audio.totalDuration * 4, 48);
  assert.deepEqual(
    score.tracks[0],
    progression.flatMap(([start, chord, duration]) =>
      guitarChords[chord].map((p) => [p, start, duration]),
    ),
  );
  for (const chord of Object.values(guitarChords)) {
    const positions = chord.map((p) => graceGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(new Set(positions.map((p) => p.str)).size, positions.length);
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
  }
});
test("sections resume held notes at the correct pitch and truncate ties at their endpoints", () => {
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const whole = read(arrangeHymn(hymn, arrangement, 0).abc);
    for (let section = 0; section < 5; section++) {
      const part = arrangeHymn(hymn, arrangement, 4, section),
        actual = read(part.abc);
      const from = part.from === 0 ? 0 : 1 + (part.from - 1) * 3,
        to = part.to === 17 ? 48 : 1 + (part.to - 1) * 3;
      const expected = whole.tracks.map((track) =>
        track
          .filter(([, s, d]) => s < to && s + d > from)
          .map(([p, s, d]) => [
            p,
            Math.max(s, from) - from,
            Math.min(s + d, to) - Math.max(s, from),
          ]),
      );
      assert.deepEqual(
        actual.tracks,
        expected,
        `${arrangement}, section ${section}`,
      );
    }
  }
});
test("all six verses retain their exact words, including empty tied continuations", () => {
  const data = graceLyricData(hymn);
  assert.equal(data.stanzas.length, 6);
  const letters = (tokens: string[]) =>
    tokens
      .join("")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  for (let i = 0; i < 6; i++)
    assert.equal(
      letters(data.stanzas[i].syllables),
      letters(hymn.stanzas[i].syllables.filter((s) => s !== "*")),
    );
  assert.equal(data.stanzas[0].syllables[0], "A-");
  assert.equal(data.stanzas[0].syllables[graceChordOffset(8)], "*");
  assert.equal(data.stanzas[0].syllables[graceChordOffset(16)], "*");
});
test("production playback keeps the original 48-beat verses and sounding guitar register", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const score = arrangeHymn(hymn, arrangement, 0),
      audio = read(score.abc).audio;
    const plan = hymnPlaybackScore({
      hymn,
      arrangement,
      sectionBars: 0,
      section: 0,
      hands: "both",
      totalBars: 17,
      sections: 1,
      abc: score.abc,
      audio,
      transpose: 0,
      stanzas: [1, 2, 3],
    });
    assert.equal(plan.audio.totalDuration * 4, 144);
    assert.deepEqual(
      plan.verses?.map((v) => v.end - v.start),
      [48, 48, 48],
    );
    if (arrangement === "guitar-edition")
      assert.deepEqual(
        plan.audio.tracks[0].flatMap((n) =>
          n.cmd === "note" && n.start === 0 ? [n.pitch] : [],
        ),
        [50],
      );
  }
});

test("fingerstyle preserves the complete melody one octave lower with first-position bass and harmony", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc),
    piano = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(
    score.tracks[0],
    piano.tracks[0].map(([p, s, d]) => [p - 12, s, d]),
  );
  const voicings: Record<string, number[]> = {
    G: [43, 47],
    Em: [40, 47],
    C: [48],
    D7: [42, 48],
  };
  assert.deepEqual(
    score.tracks[1],
    progression.flatMap(([start, chord, duration]) =>
      voicings[chord].map((p) => [p, start, duration]),
    ),
  );
  const notes = score.tracks.flat();
  for (const start of new Set(notes.map((n) => n[1]))) {
    const sounding = notes.filter(
      ([, s, d]) => s <= start && s + d > start + 1e-7,
    );
    const positions = sounding.map(([p]) => graceGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict at ${start}`,
    );
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
    const frets = positions.filter((p) => p.num > 0).map((p) => p.num);
    if (frets.length) assert(Math.max(...frets) - Math.min(...frets) <= 2);
  }
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc).tracks[0],
    score.tracks[0],
  );
});

test("the three matching Hebrew stanzas preserve the supplied translation and translator-only attribution", () => {
  const expected = [
    "מה מופלא חסדו מה מתק קולו שגאל אומלל כמוני אבוד תעיתי אך עכשיו לא עוד אתעה סומא אך עכשיו רואה",
    "חסד זה למד את לבי לפחוד חסד זה נקה מפחד מה אהוב חסד זה שהאיר בלב בשעה בה האמנתי",
    "אצלו היינו בעבר מאירים באהבה טהורים קורנים כשמש ועד נשובה עוד נספיק לזמר הללויה הלל לו הלל לנצח",
  ];
  const letters = (text: string) => text.replace(/[^\p{L}]/gu, "");
  assert.deepEqual(hymn.stanzas.slice(3).map(s => letters(s.syllables.join(""))), expected.map(letters));
  assert.deepEqual(hymn.stanzas.slice(3).map(s => s.number), [4,5,6]);
  const text = (index: number) => hymn.stanzas[index].syllables.join(" ")
    .replace(/-\s+/g, "").replace(/~/g, " ").normalize("NFC");
  assert.ok(text(3).includes("מוּפְלָא".normalize("NFC")), "retained vav uses shuruq");
  assert.ok(text(3).includes("אוּמְלָל".normalize("NFC")), "full spelling is preserved");
  assert.ok(text(4).includes("לִמֵּד".normalize("NFC")), "taught, rather than learned");

  assert.deepEqual(hymn.credits.filter(c => /Hebrew|Kalo|קאלו|Zohar|זוהר/.test(c)),
    ["Hebrew translation: Shlomo Kalo"]);
  assert.deepEqual(hymnPreferences(hymn.id, { stanzas: [1,4,6] }).stanzas, [1,4,6]);
});

test("Hebrew and mixed underlay preserve the tune, bar lengths, accompaniment and production playback", async () => {
  const {hymnLyricsAbc} = await import("../../../packages/music-practice/src/hymn-lyrics");
  const {hymnPlaybackScore} = await import("../../../packages/music-practice/src/hymn-playback-score");
  const spans = (abc: string) => {
    const result: {pitch:string;start:number;end:number}[] = [];
    let time=0;
    for(const n of abcjs.parseOnly(abc)[0].lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[])) {
      if(n.el_type!=="note")continue;
      const pitch=n.pitches?.map(p=>p.pitch).join(",") || "rest", previous=result.at(-1);
      if(previous?.pitch===pitch && Math.abs(previous.end-time)<1e-8)previous.end=time+n.duration;
      else result.push({pitch,start:time,end:time+n.duration});
      time+=n.duration;
    }
    return result;
  };
  for(const arrangement of ["piano","guitar-edition","original","guitar-vocal"] as const) {
    const score=arrangeHymn(hymn,arrangement,0);
    const source=read(score.abc);
    for(const selected of [[4],[5],[6],[1,4,6],[1,2,3,4,5,6]]) {
      const abc=hymnLyricsAbc(score.abc,{hymn,selected,offset:0});
      const actual=read(abc);
      assert.equal(actual.audio.totalDuration,source.audio.totalDuration);
      assert.deepEqual(spans(abc),spans(score.abc),`${arrangement}: identical pitch/time envelope`);
      assert.deepEqual(actual.tracks.slice(1),source.tracks.slice(1),`${arrangement}: accompaniment intact`);
      const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands:"both",totalBars:17,sections:1,
        abc:score.abc,audio:actual.audio,transpose:0,stanzas:selected});
      assert.equal(plan.audio.totalDuration,source.audio.totalDuration*selected.length);
      assert.deepEqual(plan.verses.map(v=>v.number),selected);
      // Repeated syllables in the visible score are also repeated in playback.
      const attacks=(audio:typeof actual.audio)=>audio.tracks[0].filter(n=>n.cmd==="note");
      assert.equal(attacks(plan.audio).length,attacks(actual.audio).length*selected.length);
    }
  }
});

test("Hebrew phrase landmarks carry word endings across the melody instead of starting words early", async () => {
  const {hymnLyricsAbc}=await import("../../../packages/music-practice/src/hymn-lyrics");
  const bare=(text:string)=>text.normalize("NFD").replace(/\p{M}/gu,"");
  const row=(number:number)=>hymn.stanzas[number-1].syllables.map(bare);
  assert.deepEqual(row(4).slice(2,10),["חס-","דו","_","מה","מ-","תק","קו- לו,","ש-"],
    "חסדו carries through the B half note; מה begins on the following A pickup");
  assert.deepEqual(row(5).slice(0,6),["ח- סד","זה","ל-","מד","_","את"]);
  assert.deepEqual(row(5).slice(17,23),["מה א-","הוב","_","ח-","סד","זה,"]);
  assert.deepEqual(row(6).slice(11,14),["קור-","_","נים כ-"]);
  assert.deepEqual(row(6).slice(18,22),["עד","נ-","שו-","בה,"],"SHU gets the accented high D");
  const extras=[3,6,12];
  // Independent spoken-syllable counts, with intentional multi-pitch holds.
  // Every added attack must carry a syllable; no rhythm changes for empty slots.
  const sungSyllables=[37,37,46], melodicHolds=[1,4,1];
  for(let number=4;number<=6;number++) {
    const stanza=hymn.stanzas[number-1];
    assert.equal(stanza.syllables.reduce((sum,t)=>sum+t.split(/\s+/).length-1,0),extras[number-4]);
    const abc=hymnLyricsAbc(hymn.melody,{hymn,selected:[number],offset:0});
    const rendered=read(abc), tune=rendered.tune;
    assert.equal(stanza.syllables.flatMap(t=>t.split(/\s+/)).filter(t=>t!=="_").length,sungSyllables[number-4]);
    assert.equal(rendered.audio.tracks[0].filter(n=>n.cmd==="note").length,
      sungSyllables[number-4]+melodicHolds[number-4], "no redundant attacks beyond the syllables and intentional melismas");
    const notes=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note");
    assert.ok(notes.every(n=>n.duration>=1/8 && Number.isInteger(n.duration*8)),
      "extra syllables use ordinary eighths/quarters, never sixteenths or hidden tuplets");
  }
  const first=read(hymnLyricsAbc(hymn.melody,{hymn,selected:[4],offset:0})).tune;
  let time=0;
  const underlay=first.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).flatMap(n=>{
    if(n.el_type!=="note")return [];
    const at=time;time+=n.duration;
    return [{at,duration:n.duration,text:bare(n.lyric?.[0]?.syllable||"")}];
  });
  assert.deepEqual(underlay.find(n=>n.at===1),{at:1,duration:1/2,text:"_"});
  assert.deepEqual(underlay.find(n=>n.at===1.5),{at:1.5,duration:1/4,text:"מה"});
});
