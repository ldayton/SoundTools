import abcjs, { type VoiceItem } from "abcjs";
import { spellPitch, chromaticPitch } from "./guitar";
import { KEYS } from "./model";
import hymns from "./hymns.json";
export const supportsGuitarTab = (hymn: { id: string }) =>
  hymn.id === "ill-fly-away";
export const ARRANGEMENTS = [
  { id: "melody", label: "1 · Melody", help: "Read the melody on its own." },
  {
    id: "bass",
    label: "2 · Add bass notes",
    help: "Use single left-hand bass notes from the hymn, holding repeated notes.",
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
export type HymnHands = "right" | "left" | "both";
export type Arrangement =
  (typeof ARRANGEMENTS)[number]["id"] | "guitar" | "guitar-chords";
export const isGuitarArrangement = (value: Arrangement) =>
  value === "guitar" || value === "guitar-chords";
export function hymnArrangements(hymn: { id: string }) {
  return supportsGuitarTab(hymn)
    ? [
        ...ARRANGEMENTS,
        {
          id: "guitar" as const,
          label: "Melody tab",
          help: "Guitar melody with chord symbols.",
        },
        {
          id: "guitar-chords" as const,
          label: "Chord tab",
          help: "Guitar chords shown as stacked fret numbers.",
        },
      ]
    : [...ARRANGEMENTS];
}
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
/** Chord changes in the source C edition; visual transposition moves their names too. */
const flyGuitarChanges: [number, string][][] = [
  [[0, "C"]],
  [[0, "C"]],
  [[0, "F"]],
  [
    [0, "C"],
    [32, "G7"],
  ],
  [[0, "C"]],
  [[0, "C"]],
  [
    [0, "C"],
    [48, "G7"],
  ],
  [
    [0, "C"],
    [32, "G7"],
  ],
  [[0, "C"]],
  [[0, "C"]],
  [[0, "F"]],
  [
    [0, "C"],
    [32, "G7"],
  ],
  [[0, "C"]],
  [[0, "C"]],
  [
    [0, "C"],
    [48, "G7"],
  ],
  [[0, "C"]],
];
// Low E to high E; null means omit that string. Prefer familiar open shapes.
const majorShapes = [
  [null, 3, 2, 0, 1, 0],
  [null, 4, 6, 6, 6, 4],
  [null, null, 0, 2, 3, 2],
  [null, 6, 8, 8, 8, 6],
  [0, 2, 2, 1, 0, 0],
  [1, 3, 3, 2, 1, 1],
  [2, 4, 4, 3, 2, 2],
  [3, 2, 0, 0, 0, 3],
  [4, 6, 6, 5, 4, 4],
  [null, 0, 2, 2, 2, 0],
  [null, 1, 3, 3, 3, 1],
  [null, 2, 4, 4, 4, 2],
];
const seventhShapes = [
  [null, 3, 2, 3, 1, 0],
  [null, 4, 6, 4, 6, 4],
  [null, null, 0, 2, 1, 2],
  [null, 6, 8, 6, 8, 6],
  [0, 2, 0, 1, 0, 0],
  [1, 3, 1, 2, 1, 1],
  [2, 4, 2, 3, 2, 2],
  [3, 2, 0, 0, 0, 1],
  [4, 6, 4, 5, 4, 4],
  [null, 0, 2, 0, 2, 0],
  [null, 1, 3, 1, 3, 1],
  [null, 2, 1, 2, 0, 2],
];
export function guitarChordPitches(root: number, seventh = false) {
  const shape = (seventh ? seventhShapes : majorShapes)[
    ((root % 12) + 12) % 12
  ];
  return shape.flatMap((fret, string) =>
    fret === null ? [] : [[40, 45, 50, 55, 59, 64][string] + fret],
  );
}
function guitarChords(
  from: number,
  to: number,
  transpose: number,
  key: string,
) {
  return flyGuitarChanges
    .slice(from, to)
    .map((changes, bar) => {
      const accidentals = new Map<string, number>();
      const music = changes
        .map(([at, chord], index) => {
          const root = ({ C: 0, F: 5, G7: 7 } as Record<string, number>)[chord];
          const pitches = guitarChordPitches(
            root + transpose,
            chord.endsWith("7"),
          );
          // Encode back in the source key so the shared renderer transposes once.
          const notes = pitches
            .map((pitch) => token(pitch + 12 - transpose, key, accidentals))
            .join("");
          const duration = (changes[index + 1]?.[0] ?? 64) - at;
          return `"${chord}"[${notes}]${duration}`;
        })
        .join(" ");
      return music + (bar === to - from - 1 ? " |]" : " |");
    })
    .join(" ");
}
function guitarMelody(bars: Bar[], from: number): Bar[] {
  return bars.map((bar, index) => {
    const changes = flyGuitarChanges[from + index];
    let at = 0;
    const notes = bar.notes.flatMap((note) => {
      const start = at,
        end = start + Math.round(note.duration * 64);
      at = end;
      const cuts = [
        start,
        ...changes
          .map(([beat]) => beat)
          .filter((beat) => beat > start && beat < end),
        end,
      ];
      return cuts.slice(0, -1).map((beat, part) => {
        const copy = structuredClone(note);
        copy.duration = (cuts[part + 1] - beat) / 64;
        const chord = changes.find(([offset]) => offset === beat)?.[1];
        copy.chord = chord ? [{ name: chord, position: "default" }] : undefined;
        if (part) {
          copy.lyric = undefined;
          copy.decoration = undefined;
        }
        if (cuts.length > 2) {
          copy.startBeam = undefined;
          copy.endBeam = undefined;
          copy.pitches?.forEach((pitch) => {
            if (part) {
              pitch.endTie = true;
              pitch.startSlur = undefined;
            }
            if (part < cuts.length - 2) {
              pitch.startTie = {};
              pitch.endSlur = undefined;
            }
          });
        }
        return copy;
      });
    });
    return { ...bar, notes };
  });
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
        (note.chord || [])
          .filter((c: { position: string }) => c.position === "default")
          .map((c: { name: string }) => `"${c.name}"`)
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
function singleBass(source: Voice[], from: number, to: number, key: string) {
  const candidates = source.filter((v) => v.clef === "bass");
  const average = (v: Voice) => {
    const notes = v.bars
      .flatMap((b) => b.notes)
      .filter((n) => n.resolvedPitches?.length);
    const duration = notes.reduce((sum, n) => sum + n.duration, 0);
    return duration
      ? notes.reduce(
          (sum, n) => sum + Math.min(...n.resolvedPitches!) * n.duration,
          0,
        ) / duration
      : Infinity;
  };
  const bass = [...(candidates.length ? candidates : source)].sort(
    (a, b) => average(a) - average(b),
  )[0];
  const bars = bass.bars.slice(from, to).map((bar) => {
    const notes: { pitch?: number; duration: number }[] = [];
    for (const note of bar.notes) {
      const pitch = note.resolvedPitches?.length
        ? Math.min(...note.resolvedPitches)
        : undefined;
      const previous = notes.at(-1);
      if (previous && previous.pitch === pitch)
        previous.duration += note.duration;
      else notes.push({ pitch, duration: note.duration });
    }
    return notes;
  });
  return (
    bars
      .map((bar, bi) => {
        const accidentals = new Map<string, number>();
        return bar
          .map((note, ni) => {
            const next = bar[ni + 1] || bars[bi + 1]?.[0];
            const tie = note.pitch !== undefined && next?.pitch === note.pitch;
            let remaining = Math.round(note.duration * 64);
            const pieces: string[] = [];
            while (remaining > 0) {
              const length = [64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1].find(
                (n) => n <= remaining,
              )!;
              remaining -= length;
              pieces.push(
                (note.pitch === undefined
                  ? "z"
                  : token(note.pitch, key, accidentals)) +
                  length +
                  (note.pitch !== undefined && (remaining > 0 || tie)
                    ? "-"
                    : ""),
              );
            }
            return pieces.join(" ");
          })
          .join(" ");
      })
      .join(" | ") + " |]"
  );
}
/** Simplified accompaniment samples the source harmony at each bar's opening.
 * Melody rhythm and syllables stay intact; these are practice arrangements, not new source editions. */
export function arrangeHymn(
  hymn: Hymn,
  arrangement: Arrangement,
  sectionBars = 4,
  section = 0,
  hands: HymnHands = "both",
  endingBar?: number,
  guitarTranspose = 0,
) {
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
  if (isGuitarArrangement(arrangement)) {
    if (!supportsGuitarTab(hymn))
      throw Error("Guitar tab is not available for this song.");
    melody = guitarMelody(melody, from);
  }
  const header = `X:1\nT:${hymn.title}\nM:${hymn.meter}\nL:1/64\n${hymn.feel === "swing" ? 'Q:"Swing"\n' : ""}`;
  let abc: string;
  if (arrangement === "guitar-chords") {
    abc =
      header +
      `%%score M C\nV:M clef=treble\nV:C clef=none\nK:${hymn.key}\n` +
      `[V:M] ${serialize(melody, true).music}\nw:${serialize(melody, true).lyrics}\n` +
      `[V:C] ${guitarChords(from, to, guitarTranspose, hymn.key).replace(/"[^"]+"/g, "")}\n`;
  } else if (arrangement === "original") {
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
    if (arrangement === "melody" || arrangement === "guitar")
      abc = header + `K:${hymn.key}\n${out.music}\nw:${out.lyrics}\n`;
    else if (arrangement === "bass") {
      const bass = singleBass(source, from, to, hymn.key);
      abc =
        hands === "left"
          ? header + `V:B clef=bass\nK:${hymn.key}\n[V:B] ${bass}\n`
          : header +
            `%%score M | B\nV:M clef=treble\nV:B clef=bass\nK:${hymn.key}\n[V:M] ${out.music}\nw:${out.lyrics}\n[V:B] ${bass}\n`;
    } else {
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
        hands === "left"
          ? header +
            `V:B clef=bass\nK:${hymn.key}\n[V:B] ${accompaniment.join(" | ")} |]\n`
          : header +
            `%%score M | B\nV:M clef=treble\nV:B clef=bass\nK:${hymn.key}\n[V:M] ${out.music}\nw:${out.lyrics}\n[V:B] ${accompaniment.join(" | ")} |]\n`;
    }
  }
  return { abc, sections, section: selected, from, to, totalBars: count };
}
