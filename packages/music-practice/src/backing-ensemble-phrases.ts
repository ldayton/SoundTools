/** Authored ensemble scores share a renderer, not a generic musical pattern. */
import source from "./backing-phrases/ensemble.json";
import { acousticCapo, acousticGrip } from "./backing-acoustic";
import { concertGrips } from "./backing-musical-plan";
import { rootsGrips } from "./backing-roots";
import type { BackingTake } from "./backing-plan-types";
import type {
  BackingEvent,
  BackingInstrument,
  BackingMode,
  BackingPart,
} from "./backing-track-model";
import type { BackingPattern } from "./backing-patterns";
import type { BackingQuality } from "./backing-arrangement";

const presetIds = [
  "blues",
  "rock",
  "country",
  "strummed",
  "reggae",
  "funk",
  "soul",
] as const;
export type EnsemblePreset = (typeof presetIds)[number];
const voices = [
  "root",
  "third",
  "fifth",
  "color",
  "octave",
  "triad",
  "power",
  "upper",
  "low",
  "middle",
  "high",
  "color-chord",
  "upper-chord",
  "sus-chord",
  "resolve-chord",
] as const;
type Voice = (typeof voices)[number];
type Stroke = readonly [
  tick: number,
  length: number,
  voice: Voice,
  velocity: number,
  articulation?: "normal" | "muted" | "ghost",
];
type Track = {
  part: "guitar" | "bass" | "keys";
  instrument: BackingInstrument;
  level: number;
  spreadMs: number;
  release: number;
  reply: boolean;
  cells: Record<string, readonly Stroke[]>;
};
type Answer = "guitar" | "bass" | "keys" | "drums" | null;
type Phrase = {
  id: string;
  mode: BackingMode;
  description: string;
  bars: readonly {
    cells: Record<string, string>;
    answer: Answer;
    window: number;
  }[];
};
type Profile = {
  bars: number;
  brief: string;
  tracks: Record<string, Track>;
  phrases: readonly Phrase[];
  gainDb: Record<BackingQuality, Record<BackingMode, number>>;
};
export type EnsembleLibrary = {
  version: 1;
  ticksPerBeat: 12;
  provenance: string;
  profiles: Record<EnsemblePreset, Profile>;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const pc = (n: number) => ((n % 12) + 12) % 12;
const instruments: Record<Track["part"], readonly string[]> = {
  bass: [
    "blues-bass",
    "rock-bass",
    "upright-bass",
    "reggae-bass",
    "funk-bass",
    "soul-bass",
  ],
  guitar: [
    "blues-rhythm",
    "blues-lead",
    "rock-muted",
    "rock-guitar",
    "acoustic-steel",
    "electric-twang",
    "reggae-guitar",
    "funk-guitar",
    "funk-scratch",
    "soul-guitar",
  ],
  keys: ["soul-keys", "tonewheel-organ"],
};

/** Acceptance for data authored offline, including later AI-assisted revisions. */
export function readEnsembleLibrary(input: unknown): {
  library: EnsembleLibrary | null;
  issues: string[];
} {
  const issues: string[] = [];
  const fail = (s: string) => {
    if (issues.length < 100) issues.push(s);
  };
  if (
    !object(input) ||
    input.version !== 1 ||
    input.ticksPerBeat !== 12 ||
    typeof input.provenance !== "string" ||
    !object(input.profiles) ||
    Object.keys(input.profiles).length !== presetIds.length
  )
    return {
      library: null,
      issues: ["Expected the version-one ensemble score library"],
    };
  for (const id of presetIds) {
    const raw = input.profiles[id];
    if (
      !object(raw) ||
      raw.bars !== (id === "blues" ? 12 : 8) ||
      typeof raw.brief !== "string" ||
      !object(raw.tracks) ||
      Object.keys(raw.tracks).length < 1 ||
      Object.keys(raw.tracks).length > 5 ||
      !Array.isArray(raw.phrases) ||
      raw.phrases.length !== 4 ||
      !object(raw.gainDb)
    ) {
      fail(`${id}: invalid profile`);
      continue;
    }
    for (const q of ["major", "minor"])
      for (const mode of ["steady", "active"]) {
        const gain = object(raw.gainDb[q]) ? raw.gainDb[q][mode] : undefined;
        if (
          typeof gain !== "number" ||
          !Number.isFinite(gain) ||
          Math.abs(gain) > 8
        )
          fail(`${id}: invalid calibrated gain`);
      }
    for (const [name, t] of Object.entries(raw.tracks)) {
      if (
        !object(t) ||
        !Object.hasOwn(instruments, String(t.part)) ||
        !instruments[t.part as Track["part"]].includes(String(t.instrument)) ||
        typeof t.level !== "number" ||
        !Number.isFinite(t.level) ||
        t.level <= 0 ||
        t.level > 2 ||
        !integer(t.spreadMs, 0, 20) ||
        typeof t.release !== "number" ||
        !Number.isFinite(t.release) ||
        t.release <= 0 ||
        t.release > 1 ||
        typeof t.reply !== "boolean" ||
        !object(t.cells) ||
        Object.keys(t.cells).length > 24
      ) {
        fail(`${id}/${name}: invalid instrument track`);
        continue;
      }
      for (const [cell, strokes] of Object.entries(t.cells)) {
        if (!Array.isArray(strokes) || strokes.length > 16) {
          fail(`${id}/${name}/${cell}: invalid cell`);
          continue;
        }
        let prior = -1;
        for (const s of strokes) {
          if (
            !Array.isArray(s) ||
            s.length < 4 ||
            s.length > 5 ||
            !integer(s[0], 0, 45) ||
            !integer(s[1], 1, 48) ||
            s[0] + s[1] > 72 ||
            !voices.includes(s[2]) ||
            !integer(s[3], 1, 80) ||
            (s[4] !== undefined &&
              !["normal", "muted", "ghost"].includes(s[4])) ||
            s[0] < prior
          ) {
            fail(`${id}/${name}/${cell}: invalid stroke`);
            continue;
          }
          if (
            t.part === "bass" &&
            !["root", "third", "fifth", "color", "octave"].includes(s[2])
          )
            fail(`${id}/${name}/${cell}: bass must be monophonic`);
          if (
            t.part === "guitar" &&
            ![
              "root",
              "third",
              "fifth",
              "color",
              "triad",
              "power",
              "upper",
              "low",
              "middle",
              "high",
            ].includes(s[2])
          )
            fail(`${id}/${name}/${cell}: unsupported guitar voicing`);
          if (
            t.part === "keys" &&
            ![
              "root",
              "third",
              "fifth",
              "color",
              "octave",
              "triad",
              "color-chord",
              "upper-chord",
              "sus-chord",
              "resolve-chord",
            ].includes(s[2])
          )
            fail(`${id}/${name}/${cell}: unsupported keyboard voicing`);
          prior = s[0];
        }
      }
    }
    if (issues.length) continue;
    const profile = raw as unknown as Profile,
      ids = new Set<string>();
    for (const p of profile.phrases) {
      if (
        !object(p) ||
        typeof p.id !== "string" ||
        ids.has(p.id) ||
        !["steady", "active"].includes(p.mode) ||
        typeof p.description !== "string" ||
        !Array.isArray(p.bars) ||
        p.bars.length !== profile.bars
      ) {
        fail(`${id}: invalid phrase`);
        continue;
      }
      ids.add(p.id);
      for (const rawBar of p.bars) {
        const b = rawBar as Phrase["bars"][number];
        if (
          !object(rawBar) ||
          !object(rawBar.cells) ||
          ![null, "bass", "guitar", "keys", "drums"].includes(b.answer) ||
          !integer(b.window, 24, 45)
        ) {
          fail(`${id}/${p.id}: invalid answer window`);
          continue;
        }
        if (
          Object.keys(b.cells).length !== Object.keys(profile.tracks).length ||
          !Object.entries(profile.tracks).every(
            ([track, t]) =>
              typeof b.cells[track] === "string" &&
              Object.hasOwn(t.cells, b.cells[track]),
          )
        )
          fail(`${id}/${p.id}: missing or unknown cell`);
      }
    }
    if (
      ["steady", "active"].some(
        (mode) =>
          profile.phrases.filter((p) => object(p) && p.mode === mode).length !==
          2,
      )
    )
      fail(`${id}: need two sentences per feel`);
  }
  return {
    library: issues.length ? null : (input as unknown as EnsembleLibrary),
    issues,
  };
}
const accepted = readEnsembleLibrary(source);
export const ensembleScoreIssues = accepted.issues;
export const ensembleLibrary = accepted.library;
export function ensemblePreset(
  take: BackingTake,
  pattern?: BackingPattern,
): EnsemblePreset | undefined {
  const style = take.plan.style;
  if (style === "folk") return pattern === "strummed" ? "strummed" : undefined;
  return presetIds.includes(style as EnsemblePreset)
    ? (style as EnsemblePreset)
    : undefined;
}

/** Realize notes with the existing physical instruments and retain the genre's
 * drummer, section dynamics and loop form. Scores own harmonic/rhythmic speech;
 * the common performance pipeline owns articulation and ensemble microtiming.
 */
export function ensemblePhraseTake(
  base: BackingTake,
  pattern?: BackingPattern,
  library: EnsembleLibrary | null = ensembleLibrary,
): BackingTake | undefined {
  const preset = ensemblePreset(base, pattern);
  if (!library || !preset) return;
  const profile = library.profiles[preset],
    { bars, tonic, quality, mode, cycle } = base.plan;
  if (
    !bars.length ||
    bars.length % profile.bars ||
    bars.some((b) => b.root !== tonic || b.minor !== (quality === "minor"))
  )
    return;
  const minor = quality === "minor",
    third = minor ? 3 : 4,
    color = minor ? 10 : 9;
  const acoustic = preset === "country" || preset === "strummed";
  const candidates = acoustic
    ? [acousticGrip(tonic, minor, acousticCapo(tonic, quality))]
    : preset === "blues" || preset === "rock"
      ? rootsGrips(tonic, minor)
      : concertGrips(tonic, minor);
  const guitarColor = (g: (typeof candidates)[number]) => {
    const root = g.find((n) => pc(n.note - tonic) === 0)!,
      fifth = g.find((n) => pc(n.note - tonic) === 7)!;
    const choices = [-12, 0, 12]
      .map((o) => ({
        ...fifth,
        note: fifth.note + (color - 7) + o,
        fret: fifth.fret + (color - 7) + o,
      }))
      .filter(
        (n) =>
          n.fret >= 0 &&
          n.fret <= 19 &&
          n.note >= 44 &&
          n.note <= 76 &&
          Math.abs(n.fret - root.fret) <= 4,
      )
      .sort(
        (a, b) => Math.abs(a.note - fifth.note) - Math.abs(b.note - fifth.note),
      );
    return choices.length ? [root, choices[0]] : undefined;
  };
  const grip = candidates.find((g) => preset !== "blues" || guitarColor(g));
  if (!grip) return;
  const sorted = [...grip].sort((a, b) => a.note - b.note),
    upper = acoustic ? grip.filter((n) => n.string >= 3) : sorted.slice(-2);
  const byClass = (interval: number) =>
    grip.find((n) => pc(n.note - tonic) === interval)!;
  // Choose the three lead pitches together in root position. Choosing "root"
  // and "high" from an arbitrary inversion can make up/down answers identical.
  const leadCandidates = [] as typeof candidates;
  if (preset === "blues") {
    const tuning = [40, 45, 50, 55, 59, 64];
    for (let root = 52; root <= 69; root++)
      if (pc(root - tonic) === 0)
        for (const strings of [
          [2, 3, 4],
          [2, 3, 5],
          [2, 4, 5],
          [3, 4, 5],
        ]) {
          const notes = [root, root + third, root + 7].map((note, i) => ({
            note,
            string: strings[i],
            fret: note - tuning[strings[i]],
          }));
          const frets = notes.filter((n) => n.fret > 0).map((n) => n.fret);
          if (
            notes.every((n) => n.fret >= 0 && n.fret <= 12 && n.note <= 76) &&
            Math.max(...frets) - Math.min(...frets) <= 4
          )
            leadCandidates.push(notes);
        }
  }
  const leadGrip =
    preset === "blues"
      ? leadCandidates.sort(
          (a, b) => Math.abs(a[0].note - 60) - Math.abs(b[0].note - 60),
        )[0]
      : grip;
  if (!leadGrip) return;
  const guitarVoices = (voice: Voice, reply = false) =>
    reply && preset === "blues"
      ? voice === "root"
        ? [leadGrip.find((n) => pc(n.note - tonic) === 0)!]
        : voice === "middle"
          ? [leadGrip[1]]
          : [leadGrip.at(-1)!]
      : reply && preset === "country" && voice === "upper"
        ? upper.slice(-2)
        : voice === "triad"
          ? grip
          : voice === "power"
            ? [byClass(0), byClass(7)]
            : voice === "upper"
              ? upper
              : voice === "low"
                ? [sorted[0]]
                : voice === "middle"
                  ? [sorted[Math.floor(sorted.length / 2)]]
                  : voice === "high"
                    ? [sorted.at(-1)!]
                    : voice === "root"
                      ? [byClass(0)]
                      : voice === "fifth"
                        ? [byClass(7)]
                        : voice === "third"
                          ? [byClass(third)]
                          : voice === "color"
                            ? (guitarColor(grip) ?? [])
                            : [];
  const intervals: Record<string, number[]> = {
    root: [0],
    third: [third],
    fifth: [7],
    color: [color],
    octave: [12],
    triad: [0, third, 7],
    "color-chord": minor ? [3, 7, 10, 17] : [4, 9, 14, 19],
    "upper-chord": [third + 12, 19],
    "sus-chord": minor ? [0, 7, 12, 17] : [0, 7, 14, 19],
    "resolve-chord": [third, 12, 19],
  };
  const phrases = profile.phrases.filter((p) => p.mode === mode),
    phraseIds: string[] = [];
  const chosen = bars.map((_, i) => {
    const ordinal = Math.floor(i / profile.bars),
      p = phrases[(cycle * (bars.length / profile.bars) + ordinal) % 2];
    if (i % profile.bars === 0) phraseIds.push(p.id);
    return p.bars[i % profile.bars];
  });
  const micro = (s: number) => (s * base.tempo) / 60,
    gain = 10 ** (profile.gainDb[quality][mode] / 20);
  const planned = bars.map((b, i) => ({
    ...b,
    role: chosen[i].answer ?? ("foundation" as const),
    motif: Math.floor(i / profile.bars) % 2,
    fillStart:
      chosen[i].answer === "drums" && b.texture !== "crossstick"
        ? chosen[i].window / 12
        : undefined,
  }));
  const events: BackingEvent[] = base.events
    .filter((e) => e.part === "drums" || e.part === "percussion")
    .filter((e) => {
      if (e.part !== "drums") return true;
      const i = Math.floor(e.beat / 4),
        fill = bars[i]?.fillStart;
      if (chosen[i]?.answer === "drums") return true;
      return (
        ![45, 47, 48, 50].includes(e.note) &&
        !(
          fill !== undefined &&
          e.beat - i * 4 >= fill &&
          e.note === 38 &&
          e.velocity < 50
        )
      );
    })
    .map((e) => ({
      ...e,
      duration: Math.min(e.duration, base.beats - e.beat),
      level: e.level * gain,
    }));
  for (const [index, bar] of bars.entries()) {
    const b = chosen[index],
      quiet = bar.texture === "crossstick",
      window = b.window / 12;
    for (const [name, track] of Object.entries(profile.tracks)) {
      if (quiet && track.reply) continue;
      const owner = b.answer === track.part;
      for (const [tick, length, voice, velocity, articulation] of track.cells[
        b.cells[name]
      ]) {
        const pos = tick / 12;
        if (b.answer && !owner && pos >= window) continue;
        const notes =
          track.part === "guitar"
            ? guitarVoices(voice, track.reply).map((n) => ({
                note: n.note,
                string: n.string,
              }))
            : intervals[voice].map((n) => ({
                note:
                  (track.part === "bass"
                    ? 36 + ((tonic + 6) % 12) - 6
                    : 48 + tonic) + n,
                string: undefined,
              }));
        if (!notes.length) return;
        // Offbeat skanks are upstrokes. Acoustic upstrokes reverse the same
        // physical brush gesture used for the downbeat, rather than changing tone.
        if (
          track.part === "guitar" &&
          (preset === "reggae" ||
            ((preset === "country" || preset === "strummed") &&
              tick % 12 === 6))
        )
          notes.reverse();
        for (const [j, n] of notes.entries()) {
          const open =
            preset === "rock" && name === "guitar" && bar.texture === "ride";
          const instrument = open ? "rock-guitar" : track.instrument;
          const beat =
            index * 4 +
            pos +
            micro(
              (track.part === "bass"
                ? 0.006
                : track.part === "keys"
                  ? 0.02
                  : 0.008) +
                (j * track.spreadMs) / 1000,
            );
          const end =
            b.answer && !owner
              ? Math.min(
                  index * 4 + window - micro(0.025),
                  index * 4 + pos + length / 12,
                )
              : index * 4 +
                pos +
                (open ? Math.max(length / 12, 1.5) : length / 12);
          if (end <= beat) continue;
          events.push({
            part: track.part,
            instrument,
            beat,
            duration: Math.min(end - beat, base.beats - micro(0.04) - beat),
            note: n.note,
            ...(n.string !== undefined ? { string: n.string } : {}),
            velocity: Math.round(velocity * (quiet ? 0.82 : 1)),
            level:
              bar.level *
              track.level *
              gain *
              (instrument === "tonewheel-organ" ? velocity / 48 : 1),
            absolute: true,
            articulation: open
              ? "normal"
              : (articulation ??
                (["blues-rhythm", "rock-muted", "funk-scratch"].includes(
                  instrument,
                )
                  ? "muted"
                  : "normal")),
            naturalReleaseOnly:
              track.part !== "keys" || instrument === "tonewheel-organ",
            ...(track.part === "guitar"
              ? {
                  guitarReleaseSeconds: track.release,
                  guitarAttackSeconds: 0.003,
                }
              : track.part === "keys"
                ? { noteReleaseSeconds: track.release }
                : {}),
          });
        }
      }
    }
    // Only a designated drum ending can add a turn. Preserve an existing fill
    // when present; otherwise add a small pair with the genre's subdivision.
    if (
      b.answer === "drums" &&
      !quiet &&
      !events.some(
        (e) =>
          e.part === "drums" &&
          Math.floor(e.beat / 4) === index &&
          e.beat - index * 4 >= window &&
          ([45, 47, 48, 50].includes(e.note) ||
            (e.note === 38 && e.velocity < 50)),
      )
    ) {
      const positions = preset === "blues" ? [3 + 2 / 3] : [3.5, 3.75];
      for (const [j, pos] of positions.entries())
        if (pos >= window)
          events.push({
            part: "drums",
            ...(preset === "country" || preset === "strummed"
              ? { instrument: "brush-drums" as const }
              : {}),
            beat: index * 4 + pos,
            note:
              preset === "country" || preset === "strummed" ? 37 : j ? 45 : 38,
            duration: 0.1,
            velocity: mode === "active" ? 43 : 35,
            level: bar.level * gain,
          });
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.part !== "bass" && e.part !== "guitar" && e.part !== "keys") continue;
    const physical = (instrument: BackingInstrument | undefined) =>
      instrument?.startsWith("funk-")
        ? "funk-guitar"
        : instrument?.startsWith("rock-")
          ? "rock-guitar"
          : instrument;
    const next = events
      .slice(i + 1)
      .find(
        (n) =>
          n.part === e.part &&
          (e.part === "bass" ||
            (e.part === "guitar" &&
              n.string === e.string &&
              physical(n.instrument) === physical(e.instrument)) ||
            (e.part === "keys" &&
              e.instrument === n.instrument &&
              e.note === n.note)),
      );
    const end = Math.min(
      e.beat + e.duration,
      base.beats - micro(0.03),
      next ? next.beat - micro(0.012) : Infinity,
    );
    e.duration = end - e.beat;
    if (e.duration <= 0) return; // A malformed score must not disable practice playback.
  }
  return {
    ...base,
    events,
    phrasing: `ensemble-${preset}-v1`,
    phraseIds,
    roles: planned.map((b) => b.role),
    plan: { ...base.plan, bars: planned, grips: bars.map(() => grip) },
  };
}
