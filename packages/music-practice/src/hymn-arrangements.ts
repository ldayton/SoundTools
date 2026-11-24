import {guitarVoiceAbc} from "./guitar-voice";
import type {CapoChoice} from "./guitar-capo";
import { voicePianoAbc } from "./voice-piano";
import { vocalHarmonyGuides } from "./vocal-harmony-guides";
import {compactPianoHands} from "./piano-voicing";
import {markGuitarLetRing} from "./guitar-sustain";
import { teacherInstrumentAbc, teacherVocalAbc } from "./in-christ-alone";
import {chordEdition,instrumentEdition} from "./instrument-editions";
import {engraveEdition,selectEditionVoice,isGuitarPositionMark} from "./edition-score";
import abcjs, { type VoiceItem } from "abcjs";
import { spellPitch, chromaticPitch } from "./guitar";
import { KEYS } from "./model";
import hymns from "./hymns.json";
export const hasInstrumentEditions = (hymn: { id: string }) =>
  !!instrumentEdition(hymn);
export const isInstrumentArrangement = (hymn:{id:string}, arrangement:string) =>
  hasInstrumentEditions(hymn) && (arrangement === "piano" || isGuitarArrangement(arrangement as Arrangement) && arrangement !== "guitar-vocal");
export const supportsGuitarTab = (hymn: { id: string }) =>
  hasInstrumentEditions(hymn);
// Internal source transformations support edition construction and source audits.
// They are not selectable product scores or persisted practice stages.
export const SOURCE_VARIANTS = [{id:"melody"},{id:"original"}] as const;
export type HymnHands = "right" | "left" | "both";
export type Arrangement =
  (typeof SOURCE_VARIANTS)[number]["id"] | "bass" | "chords" | "broken" | "guitar" | "guitar-chords" | "piano" | "guitar-fingerstyle" | "guitar-edition" | "guitar-vocal";
export const isGuitarArrangement = (value: Arrangement) =>
  value === "guitar" || value === "guitar-chords" || value === "guitar-fingerstyle" || value === "guitar-edition" || value === "guitar-vocal";
export const isEditedGuitar = (value: Arrangement) => value === "guitar-fingerstyle" || value === "guitar-edition";
/** Older tab editions store written pitches; fingerstyle uses an octave clef. */
export const guitarMidiOffset = (value: Arrangement) =>
  value === "guitar-edition" ? 0 : value === "guitar" || value === "guitar-chords" ? -12 : 0;
export function hymnArrangements(hymn: { id: string }): {id:Arrangement;label:string;help:string}[] {
  const edition=instrumentEdition(hymn);
  if(!edition)return [];
  const profile=chordEdition(hymn);
  return [
    ...(edition.original ? [{id:'original' as const,label:'Voice + Piano',help:edition.vocal ? 'Source melody with its own vocal staff and the complete source piano harmony.' : 'The supplied choir and organ score.'}] : []),
    ...(edition.original && profile ? [{id:"guitar-vocal" as const,label:"Guitar + Voice",help:"Vocal melody with a separate guitar chord accompaniment."}] : []),
    {id:'piano' as const,label:'Piano',help:'Melody and bass arranged for two hands on a grand staff.'},
    {id:edition.guitarArrangement,label:'Guitar',help:profile
      ?`Fingerstyle melody with supporting bass and harmony, ${profile.capo?`with capo ${profile.capo}`:'without a capo'}.`
      :'Original fingerstyle guitar arrangement.'},
  ];
}

type Note = Extract<VoiceItem, { el_type: "note" }> & {
  midiPitches?: { pitch: number }[];
  resolvedPitches?: number[];
  clefOctaveOffset?: number;
};
type Bar = { notes: Note[]; duration: number };
type Voice = { clef: string; bars: Bar[] };
export type Hymn = (typeof hymns)[number];
const cache = new Map<string, Voice[]>();
function voices(hymn: Hymn): Voice[] {
  const cached = cache.get(hymn.id);
  if (cached) return cached;
  const tune = abcjs.parseOnly(hymn.harmony)[0];
  tune.setUpAudio({});
  const parts = new Map<string, { clef: string; items: VoiceItem[] }>();
  for (const line of tune.lines)
    line.staff?.forEach((staff, si) =>
      staff.voices?.forEach((voice, vi) => {
        const key = `${si}:${vi}`;
        const part = parts.get(key) || {
          clef: staff.clef?.type?.startsWith("bass") ? "bass" : "treble",
          items: [],
        };
        part.items.push(...voice.map(item => item.el_type === "note" ? {...item, clefOctaveOffset: staff.clef?.type === "treble-8" ? -12 : 0} : item));
        parts.set(key, part);
      }),
    );
  const result = [...parts.values()].map((part) => {
    const bars: Bar[] = [];
    let notes: Note[] = [];
    const flush = () => {
      if (notes.length)
        bars.push({
          notes,
          duration: notes.reduce((sum, n) => sum + n.duration, 0),
        });
      notes = [];
    };
    const tied = new Map<number, number>();
    for (const item of part.items) {
      if (item.el_type === "note") {
        const note = item as Note;
        const attacks = [...(note.midiPitches || [])];
        const resolvedPitches = (note.pitches || []).map((p) => {
          const pitch = p.endTie ? tied.get(p.pitch) : attacks.shift()?.pitch;
          if (pitch === undefined) throw Error("Unresolved hymn pitch");
          tied.set(p.pitch, pitch);
          return pitch;
        });
        notes.push({ ...note, resolvedPitches });
      } else if (item.el_type === "bar") flush();
    }
    flush();
    return { clef: part.clef, bars };
  });
  cache.set(hymn.id, result);
  return result;
}
export function hymnBarCount(hymn: Hymn) {
  return voices(hymn)[0].bars.length;
}
export function hymnMelodyOffset(hymn: Hymn, bar: number) {
  return voices(hymn)[0]
    .bars.slice(0, bar)
    .reduce(
      (sum, b) => sum + b.notes.filter((note) => note.pitches?.length).length,
      0,
    );
}
function token(pitch: number, key: string, accidentals: Map<string, number>) {
  const n = spellPitch(pitch, key) || chromaticPitch(pitch);
  const signature = KEYS.find((k) => k.id === key)!;
  const altered = (signature.count < 0 ? "BEADGCF" : "FCGDAEB").slice(
    0,
    Math.abs(signature.count),
  );
  const implied = altered.includes(n.letter) ? Math.sign(signature.count) : 0;
  const position = `${n.letter}${n.octave}`;
  const previous = accidentals.get(position) ?? implied;
  accidentals.set(position, n.modifier);
  return (
    (n.modifier === previous
      ? ""
      : n.modifier === 1
        ? "^"
        : n.modifier === -1
          ? "_"
          : "=") +
    n.letter +
    (n.octave >= 4 ? "'".repeat(n.octave - 4) : ",".repeat(4 - n.octave))
  );
}
/** Stock major/seventh shapes for the legacy teaching-score format.
 * Reviewed fingerstyle editions supply their own passage positions. */
// Low E to high E; null means omit that string. Prefer familiar open shapes.
function serialize(bars: Bar[], melody = false) {
  const music: string[] = [];
  const lyrics: string[] = [];
  const all = bars.flatMap((b) => b.notes);
  const slurStarts = new Set(
    all.flatMap(
      (n) =>
        n.pitches?.flatMap(
          (p) => p.startSlur?.map((s: { label: number }) => s.label) || [],
        ) || [],
    ),
  );
  const slurEnds = new Set(
    all.flatMap((n) => n.pitches?.flatMap((p) => p.endSlur || []) || []),
  );
  let beam = false;
  for (const [bi, bar] of bars.entries()) {
    for (const [ni, note] of bar.notes.entries()) {
      const pitches =
        melody && note.pitches?.length
          ? [note.pitches.reduce((a, b) => (a.pitch > b.pitch ? a : b))]
          : note.pitches;
      const names = pitches?.map((p) => {
        const written = p.name.match(/^[\^_=]*[A-Ga-g][',]*/)?.[0];
        if (bi === 0 && ni === 0 && p.endTie) {
          const midi = note.resolvedPitches![note.pitches!.indexOf(p)];
          const natural =
            60 +
            Math.floor(p.pitch / 7) * 12 +
            [0, 2, 4, 5, 7, 9, 11][((p.pitch % 7) + 7) % 7];
          const accidental = midi - natural - (note.clefOctaveOffset || 0);
          return (
            (accidental > 0
              ? "^".repeat(accidental)
              : accidental < 0
                ? "_".repeat(-accidental)
                : "=") + written!.replace(/^[\^_=]*/, "")
          );
        }
        return written;
      });
      const first = pitches?.[0];
      const opens =
        first?.startSlur?.filter((s: { label: number }) =>
          slurEnds.has(s.label),
        ).length || 0;
      const closes =
        first?.endSlur?.filter((s: number) => slurStarts.has(s)).length || 0;
      const next = bar.notes[ni + 1] || bars[bi + 1]?.notes[0];
      const tie =
        first?.startTie && next?.pitches?.some((p) => p.pitch === first.pitch);
      const length = Math.round(note.duration * 64);
      let value =
        (note.chord || [])
          .filter((c: {position:string;name:string}) => c.position === "default" || c.position === "above" && isGuitarPositionMark(c.name))
          .map((c: {position:string;name:string}) => `"${c.position === "above" ? "^" : ""}${c.name}"`)
          .join("") +
        "(".repeat(opens) +
        (note.decoration || []).map((d: string) => `!${d}!`).join("") +
        (!names?.length
          ? "z"
          : names.length === 1
            ? names[0]
            : `[${names.join("")}]`) +
        length +
        (tie ? "-" : "") +
        ")".repeat(closes);
      if (beam) music[music.length - 1] += value;
      else music.push(value);
      beam = (beam || !!note.startBeam) && !note.endBeam;
      if (pitches?.length) {
        const lyric = note.lyric?.[0];
        lyrics.push(
          lyric?.syllable
            ? lyric.syllable.replace(/ /g, "~") +
                (lyric.divider === "-" ? "-" : "")
            : "*",
        );
      }
    }
    music.push(bi === bars.length - 1 ? "|]" : "|");
    beam = false;
  }
  return { music: music.join(" "), lyrics: lyrics.join(" ") };
}
/** One source bass pitch at a time. Repeated pitches become held notes, not extra attacks. */
/** Build an instrument edition or extract its authoritative source melody. */
export function guitarVocalAccompaniment(hymn:Hymn, sectionBars=0, section=0, endingBar?:number) {
  if(instrumentEdition(hymn)?.editionKey !== "in-christ-alone")
    return arrangeHymn(hymn,"guitar-edition",sectionBars,section,"left",endingBar);
  const score=arrangeHymn({...hymn,id:`${hymn.id}:guitar-accompaniment`,key:"C",harmony:teacherInstrumentAbc(hymn,"guitar","left",true)},"original",sectionBars,section,"both",endingBar);
  return {...score,abc:engraveEdition(score.abc,true,"written","left")};
}
export function arrangeHymn(
  hymn: Hymn,
  arrangement: Arrangement,
  sectionBars = 4,
  section = 0,
  hands: HymnHands = "both",
  endingBar?: number,
  guitarTranspose = 0,
  capoChoice?: CapoChoice,
): { abc: string; sections: number; section: number; from: number; to: number; totalBars: number } {
  if (["bass","chords","broken"].includes(arrangement))
    return arrangeHymn(hymn,"piano",sectionBars,section,hands,endingBar,guitarTranspose);
  if (arrangement === "guitar" || arrangement === "guitar-chords")
    return arrangeHymn(hymn,instrumentEdition(hymn)?.guitarArrangement || "guitar-edition",sectionBars,section,arrangement === "guitar-chords"?"left":hands,endingBar,guitarTranspose);
  const edition = instrumentEdition(hymn);
  if(arrangement === "guitar-vocal"){
    const profile=chordEdition(hymn);if(!profile || !edition?.original)throw Error("Guitar + Voice is unavailable");
    const vocal=arrangeHymn(hymn,"original",sectionBars,section,"both",endingBar);
    const melody=selectEditionVoice(vocal.abc,"right"),accompaniment=guitarVocalAccompaniment(hymn,sectionBars,section,endingBar).abc;
    const harmony=guitarVoiceAbc(melody,accompaniment,profile.capo,guitarTranspose,capoChoice);
    return {...vocal,abc:selectEditionVoice(harmony,hands)};
  }
  if (arrangement === "original" && edition?.editionKey === "in-christ-alone")
    return arrangeHymn({...hymn,id:`${hymn.id}:harmonized`,harmony:compactPianoHands(teacherVocalAbc(hymn.harmony),1)},arrangement,sectionBars,section,hands,endingBar,guitarTranspose);
  if (arrangement === "original" && edition?.vocal) {
    const profile = chordEdition(hymn)!;
    const guitar = edition.build({hymn,instrument:"guitar",hands:"both",melody:()=>arrangeHymn(hymn,"melody",0).abc});
    return arrangeHymn({...hymn,id:`${hymn.id}:voice`,harmony:voicePianoAbc(compactPianoHands(hymn.harmony),guitar,profile.capo,vocalHarmonyGuides[edition.editionKey])},"original",sectionBars,section,hands,endingBar,guitarTranspose);
  }
  if (edition && (arrangement === "piano" || arrangement === edition.guitarArrangement)) {
    const guitar = arrangement === edition.guitarArrangement;
    const whole = sectionBars === 0 && (!endingBar || endingBar >= hymnBarCount(hymn));
    const harmony = edition.build({
      hymn, instrument: guitar ? "guitar" : "piano", hands,
      melody: () => arrangeHymn(hymn, "melody", 0).abc,
    });
    const source = {
      ...hymn, id: `${hymn.id}:${arrangement}:${hands}`,
      key: guitar ? edition.guitarKey || hymn.key : hymn.key, harmony,
    };
    const preserveVoices = (edition.selectWholeVoices || !guitar && /\|:|:\|/.test(harmony)) && whole;
    const sliceHands = preserveVoices || (guitar && edition.guitarNotation === "written")
      ? "both" : hands;
    const score = arrangeHymn(source, "original", sectionBars, section, sliceHands, endingBar, guitarTranspose);
    let abc = preserveVoices ? selectEditionVoice(score.abc, hands) : score.abc;
    abc = engraveEdition(abc, guitar, edition.guitarNotation, hands);
    if (edition.landmarks) abc = edition.landmarks(abc, score.from, guitar);
    if (guitar && score.from === 0) abc = markGuitarLetRing(abc);
    return {...score, abc};
  }
  if (
    hands === "right" &&
    arrangement !== "original" &&
    !isGuitarArrangement(arrangement)
  )
    return arrangeHymn(hymn, "melody", sectionBars, section, "both", endingBar);
  const source = voices(hymn);
  const count = Math.min(source[0].bars.length, endingBar ?? Infinity);
  const size = sectionBars === 0 ? count : sectionBars;
  const sections = Math.ceil(count / size);
  const selected = Math.max(0, Math.min(sections - 1, section));
  const from = selected * size,
    to = Math.min(count, from + size);
  let melody = source[0].bars.slice(from, to);
  const header = `X:1\nT:${hymn.title}\nM:${hymn.meter}\nL:1/64\n${hymn.feel === "swing" ? 'Q:"Swing"\n' : ""}`;
  let abc: string;
  if (arrangement === "original") {
    // Keep the original whole-score edition intact, including its repeat signs.
    if (
      sectionBars === 0 &&
      hands === "both" &&
      count === source[0].bars.length
    )
      abc = hymn.harmony;
    else {
      const selectedSource = source.filter(
        (v) =>
          hands === "both" || v.clef === (hands === "left" ? "bass" : "treble"),
      );
      const score = selectedSource.map((_, i) => `v${i}`);
      const treble = selectedSource
        .map((v, i) => (v.clef === "treble" ? `v${i}` : ""))
        .filter(Boolean);
      const bass = selectedSource
        .map((v, i) => (v.clef === "bass" ? `v${i}` : ""))
        .filter(Boolean);
      abc =
        header +
        `%%score ${[treble, bass]
          .filter((group) => group.length)
          .map((group) => "(" + group.join(" ") + ")")
          .join(" | ")}\n` +
        selectedSource.map((v, i) => `V:v${i} clef=${v.clef}`).join("\n") +
        `\nK:${hymn.key}\n`;
      selectedSource.forEach((v, i) => {
        const out = serialize(v.bars.slice(from, to));
        abc +=
          `[V:${score[i]}] ${out.music}\n` +
          (v === source[0] ? `w:${out.lyrics}\n` : "");
      });
    }
  } else {
    const out = serialize(melody, true);
    if (arrangement !== "melody") throw Error("Unsupported instrument score");
    abc = header + `K:${hymn.key}\n${out.music}\nw:${out.lyrics}\n`;
  }
  return { abc, sections, section: selected, from, to, totalBars: count };
}
