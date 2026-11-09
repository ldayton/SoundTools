import abcjs, { type VoiceItem } from "abcjs";
import { spellPitch, chromaticPitch } from "./guitar";
import { KEYS } from "./model";
import hymns from "./hymns.json";
export const ARRANGEMENTS = [
  { id: "melody", label: "1 · Melody", help: "Read the melody on its own." },
  {
    id: "bass",
    label: "2 · Add bass notes",
    help: "Add one held bass note per bar.",
  },
  {
    id: "chords",
    label: "3 · Simple chords",
    help: "Add a held left-hand chord per bar.",
  },
  {
    id: "broken",
    label: "4 · Broken chords",
    help: "Play the left-hand harmony one note at a time.",
  },
  {
    id: "original",
    label: "5 · Original harmony",
    help: "Play the original hymn’s full harmony.",
  },
] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number]["id"];
type Note = Extract<VoiceItem, { el_type: "note" }> & {
  midiPitches?: { pitch: number }[];
  resolvedPitches?: number[];
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
          clef: si ? "bass" : "treble",
          items: [],
        };
        part.items.push(...voice);
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
          const accidental = midi - natural;
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
/** Simplified accompaniment samples the source harmony at each bar's opening.
 * Melody rhythm and syllables stay intact; these are practice arrangements, not new source editions. */
export function arrangeHymn(
  hymn: Hymn,
  arrangement: Arrangement,
  sectionBars = 4,
  section = 0,
) {
  const source = voices(hymn);
  const count = source[0].bars.length;
  const size = sectionBars === 0 ? count : sectionBars;
  const sections = Math.ceil(count / size);
  const selected = Math.max(0, Math.min(sections - 1, section));
  const from = selected * size,
    to = Math.min(count, from + size);
  const melody = source[0].bars.slice(from, to);
  const header = `X:1\nT:${hymn.title}\nM:${hymn.meter}\nL:1/64\n`;
  let abc: string;
  if (arrangement === "original") {
    // Keep the original whole-score edition intact, including its repeat signs.
    if (sectionBars === 0) abc = hymn.harmony;
    else {
      const score = source.map((_, i) => `v${i}`);
      const treble = source
        .map((v, i) => (v.clef === "treble" ? `v${i}` : ""))
        .filter(Boolean);
      const bass = source
        .map((v, i) => (v.clef === "bass" ? `v${i}` : ""))
        .filter(Boolean);
      abc =
        header +
        `%%score (${treble.join(" ")})${bass.length ? " | (" + bass.join(" ") + ")" : ""}\n` +
        source.map((v, i) => `V:v${i} clef=${v.clef}`).join("\n") +
        `\nK:${hymn.key}\n`;
      source.forEach((v, i) => {
        const out = serialize(v.bars.slice(from, to));
        abc +=
          `[V:${score[i]}] ${out.music}\n` +
          (i === 0 ? `w:${out.lyrics}\n` : "");
      });
    }
  } else {
    const out = serialize(melody, true);
    if (arrangement === "melody")
      abc = header + `K:${hymn.key}\n${out.music}\nw:${out.lyrics}\n`;
    else {
      let cursor = source[0].bars
        .slice(0, from)
        .reduce((s, b) => s + b.duration, 0);
      const accompaniment: string[] = [];
      for (const bar of melody) {
        const accidentals = new Map<string, number>();
        const sounding: number[] = [];
        for (const voice of source) {
          let offset = 0;
          for (const note of voice.bars.flatMap((b) => b.notes)) {
            if (
              offset <= cursor + 1e-7 &&
              cursor < offset + note.duration - 1e-7
            ) {
              sounding.push(...(note.resolvedPitches || []));
              break;
            }
            offset += note.duration;
          }
        }
        const sorted = [...new Set(sounding)].sort((a, b) => a - b);
        const bass = sorted[0];
        const length = Math.round(bar.duration * 64);
        if (bass === undefined) accompaniment.push(`z${length}`);
        else if (arrangement === "bass")
          accompaniment.push(token(bass, hymn.key, accidentals) + length);
        else {
          // Keep source pitch classes, close-positioned over its bass; never invent a new harmony.
          const pcs = [...new Set(sorted.map((n) => n % 12))]
            .sort(
              (a, b) =>
                ((a - (bass % 12) + 12) % 12) - ((b - (bass % 12) + 12) % 12),
            )
            .slice(0, 3);
          const chord = pcs.map((pc) => bass + ((pc - (bass % 12) + 12) % 12));
          if (arrangement === "chords")
            accompaniment.push(
              `[${chord.map((n) => token(n, hymn.key, accidentals)).join("")}]${length}`,
            );
          else {
            const quarter = 16;
            let remaining = length,
              index = 0;
            const pattern = [
              0,
              Math.min(1, chord.length - 1),
              chord.length - 1,
              Math.min(1, chord.length - 1),
            ];
            const notes: string[] = [];
            while (remaining > 0) {
              const duration = Math.min(quarter, remaining);
              notes.push(
                token(
                  chord[pattern[index++ % pattern.length]],
                  hymn.key,
                  accidentals,
                ) + duration,
              );
              remaining -= duration;
            }
            accompaniment.push(notes.join(" "));
          }
        }
        cursor += bar.duration;
      }
      abc =
        header +
        `%%score M | B\nV:M clef=treble\nV:B clef=bass\nK:${hymn.key}\n[V:M] ${out.music}\nw:${out.lyrics}\n[V:B] ${accompaniment.join(" | ")} |]\n`;
    }
  }
  return { abc, sections, section: selected, from, to, totalBars: count };
}
