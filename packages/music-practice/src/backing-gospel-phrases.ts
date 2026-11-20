import score from "./backing-phrases/gospel.json";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";

export const gospelTracks = [
  "drums",
  "percussion",
  "bass",
  "organ",
  "piano",
] as const;
export type GospelTrack = (typeof gospelTracks)[number];
export type GospelStroke = readonly [
  tick: number,
  length: number,
  notes: readonly number[],
  velocity: number,
];
export type GospelBar = Record<GospelTrack, string> & {
  answer: "drums" | "bass" | "organ" | null;
};
export type GospelPhrase = {
  id: string;
  quality: BackingQuality;
  mode: BackingMode;
  description: string;
  bars: readonly GospelBar[];
};
export type GospelLibrary = {
  version: 1;
  ticksPerBeat: 12;
  barsPerPhrase: 8;
  provenance: { method: string; author: string; brief: string };
  cells: Record<GospelTrack, Record<string, readonly GospelStroke[]>>;
  phrases: readonly GospelPhrase[];
};
const pc = (n: number) => ((n % 12) + 12) % 12;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, lo: number, hi: number): v is number =>
  Number.isInteger(v) && Number(v) >= lo && Number(v) <= hi;

/** Shared acceptance boundary for authored scores and future model output.
 * Structural validity does not establish musical quality; the audition tools
 * render these same accepted scores through the real instruments.
 */
export function readGospelLibrary(input: unknown): {
  library: GospelLibrary | null;
  issues: string[];
} {
  const issues: string[] = [];
  const fail = (message: string) => {
    if (issues.length < 100) issues.push(message);
  };
  if (
    !object(input) ||
    input.version !== 1 ||
    input.ticksPerBeat !== 12 ||
    input.barsPerPhrase !== 8 ||
    !object(input.cells) ||
    !Array.isArray(input.phrases) ||
    input.phrases.length !== 8 ||
    !object(input.provenance) ||
    typeof input.provenance.method !== "string" ||
    typeof input.provenance.author !== "string" ||
    typeof input.provenance.brief !== "string"
  )
    return {
      library: null,
      issues: [
        "Expected version-one Gospel score with eight eight-bar phrases and provenance",
      ],
    };
  for (const track of gospelTracks) {
    const cells = input.cells[track];
    if (!object(cells) || Object.keys(cells).length > 64) {
      fail(`${track}: missing or excessive score cells`);
      continue;
    }
    for (const [name, strokes] of Object.entries(cells)) {
      if (!Array.isArray(strokes) || strokes.length > 24) {
        fail(`${track}/${name}: invalid stroke list`);
        continue;
      }
      let prior = -1,
        bassEnd = -1;
      const sounding = new Map<number, number>();
      for (const stroke of strokes) {
        if (
          !Array.isArray(stroke) ||
          stroke.length !== 4 ||
          !integer(stroke[0], 0, 46) ||
          !integer(stroke[1], 1, 48 - stroke[0]) ||
          !Array.isArray(stroke[2]) ||
          stroke[2].length < 1 ||
          stroke[2].length > 4 ||
          !integer(stroke[3], 1, 90) ||
          stroke[0] < prior ||
          new Set(stroke[2]).size !== stroke[2].length
        ) {
          fail(`${track}/${name}: malformed or out-of-bar stroke`);
          continue;
        }
        const [tick, length, notes] = stroke;
        prior = tick;
        if (
          ["bass", "drums", "percussion"].includes(track) &&
          notes.length !== 1
        )
          fail(`${track}/${name}: monophonic strokes required`);
        for (const note of notes) {
          const valid =
            track === "drums"
              ? [36, 38, 42, 45].includes(note)
              : track === "percussion"
                ? note === 54
                : integer(
                    note,
                    track === "bass" ? 0 : -5,
                    track === "bass" ? 12 : 14,
                  );
          if (!valid || !Number.isInteger(note))
            fail(`${track}/${name}: unsupported pitch ${note}`);
          if ((sounding.get(note) ?? -1) > tick)
            fail(`${track}/${name}: overlapping same-pitch attacks`);
          sounding.set(note, tick + length);
        }
        if (track === "bass") {
          if (tick < bassEnd) fail(`${track}/${name}: overlapping bass notes`);
          bassEnd = tick + length;
        }
      }
    }
  }
  if (issues.length) return { library: null, issues };
  const library = input as unknown as GospelLibrary;
  const ids = new Set<string>(),
    groups = new Map<string, number>();
  for (const rawPhrase of input.phrases) {
    const phrase = rawPhrase as GospelPhrase;
    if (
      !object(rawPhrase) ||
      typeof phrase.id !== "string" ||
      !/^[a-z0-9-]+$/.test(phrase.id) ||
      ids.has(phrase.id) ||
      !["major", "minor"].includes(phrase.quality) ||
      !["steady", "active"].includes(phrase.mode) ||
      typeof phrase.description !== "string" ||
      !Array.isArray(phrase.bars) ||
      phrase.bars.length !== 8
    ) {
      fail("Invalid or duplicate phrase identity, mode, quality or bar count");
      continue;
    }
    ids.add(phrase.id);
    const group = `${phrase.quality}/${phrase.mode}`;
    groups.set(group, (groups.get(group) ?? 0) + 1);
    const allowed =
      phrase.quality === "major" ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
    for (const [index, rawBar] of phrase.bars.entries()) {
      const bar = rawBar as GospelBar;
      if (
        !object(rawBar) ||
        ![null, "drums", "bass", "organ"].includes(bar.answer)
      ) {
        fail(`${phrase.id}/${index}: invalid answer owner`);
        continue;
      }
      if (
        !gospelTracks.every(
          (track) =>
            typeof bar[track] === "string" &&
            Object.hasOwn(library.cells[track], bar[track]),
        )
      ) {
        fail(`${phrase.id}/${index}: unknown score cell`);
        continue;
      }
      const strokes = (track: GospelTrack) => library.cells[track][bar[track]];
      for (const track of ["bass", "organ", "piano"] as const)
        if (
          strokes(track).some((s) => s[2].some((n) => !allowed.includes(pc(n))))
        )
          fail(
            `${phrase.id}/${index}: ${track} escapes the practice vocabulary`,
          );
      if (
        !strokes("bass").length ||
        pc(strokes("bass")[0][2][0]) !== 0 ||
        strokes("bass")[0][0] !== 0
      )
        fail(
          `${phrase.id}/${index}: bass must establish the tonic on beat one`,
        );
      if (
        strokes("bass").length > (phrase.mode === "steady" ? 2 : 3) ||
        strokes("piano").length > 1 ||
        strokes("organ").length >
          (phrase.mode === "steady" && bar.answer !== "organ" ? 2 : 3)
      )
        fail(`${phrase.id}/${index}: excessive part density`);
      if (
        ![12, 36].every((t) =>
          strokes("drums").some((s) => s[0] === t && s[2][0] === 38),
        )
      )
        fail(`${phrase.id}/${index}: missing backbeat`);
      if (
        strokes("drums").some((s) => s[2][0] === 45) &&
        (index !== 7 || bar.answer !== "drums")
      )
        fail(
          `${phrase.id}/${index}: drum fills belong to the phrase-ending answer`,
        );
      if (["bass", "drums"].includes(bar.answer ?? "")) {
        if (
          [...strokes("organ"), ...strokes("piano")].some(
            (s) => s[0] + s[1] > 36,
          )
        )
          fail(`${phrase.id}/${index}: keys crowd the answer window`);
      }
      if (
        bar.answer === "organ" &&
        (strokes("bass").length > 2 ||
          strokes("piano").some((s) => s[0] + s[1] > 32))
      )
        fail(`${phrase.id}/${index}: accompaniment crowds the organ answer`);
      const keys = [...strokes("organ"), ...strokes("piano")];
      for (const tick of keys.map((s) => s[0]))
        if (
          keys
            .filter((s) => s[0] <= tick && s[0] + s[1] > tick)
            .reduce((n, s) => n + s[2].length, 0) > 7
        )
          fail(`${phrase.id}/${index}: excessive combined keyboard polyphony`);
      if (index === 7 && !bar.answer)
        fail(`${phrase.id}: ending needs an answer`);
    }
  }
  for (const quality of ["major", "minor"])
    for (const mode of ["steady", "active"])
      if (groups.get(`${quality}/${mode}`) !== 2)
        fail(`Expected two ${quality}/${mode} variations`);
  return { library: issues.length ? null : library, issues };
}

const accepted = readGospelLibrary(score);
export const gospelPhraseIssues = accepted.issues;
export const gospelPhraseLibrary = accepted.library;

/** Realize a coordinated score over an already resolved tonic plan. A bad or
 * unsuitable library returns control to the existing arranger. Phrase choices
 * depend on musical position, never tempo, frame rate or pause/resume timing.
 */
export function gospelPhraseTake(
  base: BackingTake,
  library: GospelLibrary | null = gospelPhraseLibrary,
): BackingTake | undefined {
  const { bars, quality, mode, tonic, cycle } = base.plan;
  if (
    !library ||
    base.plan.style !== "gospel" ||
    !bars.length ||
    bars.length % 8 ||
    bars.some((b) => b.root !== tonic || b.minor !== (quality === "minor"))
  )
    return;
  const phrases = library.phrases.filter(
    (p) => p.mode === mode && p.quality === quality,
  );
  if (phrases.length !== 2) return;
  const shift = ((tonic + 6) % 12) - 6;
  const spb = 60 / base.tempo;
  // Full factory renders at 48 kHz measured 1.0–1.2 LU below the shared
  // -24 LUFS target. Gain alone preserves all part balances and articulation.
  const scoreGain = 10 ** (1.1 / 20);
  const events: BackingEvent[] = [],
    phraseIds: string[] = [];
  const plannedBars = bars.map((bar, index) => {
    const ordinal = Math.floor(index / 8),
      phrase = phrases[(cycle * (bars.length / 8) + ordinal) % phrases.length];
    if (index % 8 === 0) phraseIds.push(phrase.id);
    const chosen = phrase.bars[index % 8],
      quiet = bar.texture === "crossstick";
    for (const track of gospelTracks)
      for (const [tick, length, notes, velocity] of library.cells[track][
        chosen[track]
      ])
        for (const pitch of notes) {
          // Keep quiet opening/breathing sections quarter-note based, with rim
          // backbeats; the scored answer stays available in the settled band.
          if (
            quiet &&
            track === "drums" &&
            (pitch === 45 ||
              tick >= 40 ||
              (pitch === 42 && tick % 12 !== 0) ||
              (pitch === 36 && tick % 12 !== 0))
          )
            continue;
          const drum = track === "drums",
            percussion = track === "percussion",
            organ = track === "organ";
          const part = drum
            ? "drums"
            : percussion
              ? "percussion"
              : track === "bass"
                ? "bass"
                : "keys";
          const offset =
            (drum
              ? pitch === 38
                ? 0.013
                : 0.004
              : percussion
                ? 0.015
                : track === "bass"
                  ? 0.008
                  : organ
                    ? 0.015
                    : 0.021) / spb;
          const beat = index * 4 + tick / 12 + offset;
          const v = Math.round(
            velocity *
              (quiet && !organ
                ? drum
                  ? pitch === 38
                    ? 0.67
                    : 0.78
                  : 0.8
                : 1),
          );
          events.push({
            part,
            ...(organ
              ? { instrument: "tonewheel-organ" as const }
              : track === "piano"
                ? { instrument: "acoustic-piano" as const }
                : {}),
            beat,
            duration: Math.min(
              length / 12,
              (index + 1) * 4 - beat - 0.03 / spb,
            ),
            note: drum
              ? quiet && pitch === 38
                ? 37
                : pitch
              : percussion
                ? pitch
                : (track === "bass" ? 36 : 60) + shift + pitch,
            velocity: v,
            level:
              scoreGain *
              (organ ? velocity / 64 : bar.level * (percussion ? 0.7 : 1)),
            ...(!drum && !percussion ? { absolute: true } : {}),
            ...(organ
              ? { naturalReleaseOnly: true }
              : track === "piano"
                ? { noteReleaseSeconds: 0.1 }
                : {}),
          });
        }
    return {
      ...bar,
      role:
        chosen.answer === "organ"
          ? ("keys" as const)
          : (chosen.answer ?? ("foundation" as const)),
      motif: ordinal % 2,
      fillStart: chosen.answer === "drums" && !quiet ? 3 : undefined,
    };
  });
  events.sort((a, b) => a.beat - b.beat);
  return {
    ...base,
    events: connectOrganTones(events, tonic),
    phrasing: "gospel-phrases-v1",
    phraseIds,
    roles: plannedBars.map((b) => b.role),
    plan: { ...base.plan, bars: plannedBars, grips: [] },
  };
}

/** Carry common tonic-triad voices through consecutive held chords. Short
 * comping strokes and deliberately empty answer windows retain their attacks.
 * Expression/drawbar scenes continue to follow all of the other band events.
 */
function connectOrganTones(
  events: BackingEvent[],
  tonic: number,
): BackingEvent[] {
  const ringing = new Map<number, BackingEvent>();
  const kept: BackingEvent[] = [];
  for (const e of events) {
    if (e.instrument !== "tonewheel-organ") {
      kept.push(e);
      continue;
    }
    const previous = ringing.get(e.note);
    const common = [0, 3, 4, 7].includes(pc(e.note - tonic));
    if (
      previous &&
      common &&
      e.duration >= 3.5 &&
      previous.duration >= 3.5 &&
      e.beat % 4 < 0.1 &&
      previous.beat % 4 < 0.1 &&
      previous.beat + previous.duration >= e.beat - 0.4 &&
      Math.abs(20 * Math.log10(e.level / previous.level)) < 0.5
    ) {
      previous.duration = e.beat + e.duration - previous.beat;
    } else {
      kept.push(e);
      ringing.set(e.note, e);
    }
  }
  return kept;
}
