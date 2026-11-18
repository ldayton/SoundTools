/** Approved plan-first accompaniment with sparse bass and long phrase variation. */
import { practiceBackingArrangement } from "./backing-phrasing";
import { BACKING_GENRES, recordedGenreStory } from "./backing-genres";
import {
  backingArrangement,
  backingChord,
  type BackingQuality,
} from "./backing-arrangement";
import type {
  BackingEvent,
  LegacyBackingStyle as BackingStyle,
  BackingMode,
} from "./backing-track-model";
type Role = "foundation" | "bass" | "guitar" | "space" | "drums";
type Grip = { note: number; string: number; fret: number }[];
const tuning = [40, 45, 50, 55, 59, 64];
const conversations: Role[][] = [
  ["foundation", "bass", "space", "drums"],
  ["foundation", "guitar", "bass", "drums"],
  ["foundation", "space", "guitar", "drums"],
];
export function concertGrips(root: number, minor: boolean): Grip[] {
  const pcs = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12],
    out: Grip[] = [];
  for (const strings of [
    [2, 3, 4],
    [3, 4, 5],
    [2, 4, 5],
  ]) {
    const choices = strings.map((string) =>
      Array.from({ length: 13 }, (_, fret) => ({
        string,
        fret,
        note: tuning[string] + fret,
      })).filter(
        (n) => n.note >= 50 && n.note <= 76 && pcs.includes(n.note % 12),
      ),
    );
    for (const a of choices[0])
      for (const b of choices[1])
        for (const c of choices[2]) {
          const g = [a, b, c],
            frets = g.filter((n) => n.fret > 0).map((n) => n.fret);
          if (
            new Set(g.map((n) => n.note % 12)).size === 3 &&
            Math.max(...frets) - Math.min(...frets) <= 4
          )
            out.push(g);
        }
  }
  return out
    .sort(
      (a, b) =>
        a.reduce((s, n) => s + n.fret, 0) - b.reduce((s, n) => s + n.fret, 0),
    )
    .slice(0, 24);
}
function movement(a: Grip, b: Grip) {
  return (
    b.reduce(
      (s, n) =>
        s +
        Math.min(
          ...a.map(
            (p) =>
              Math.abs(p.note - n.note) + (p.string === n.string ? 0 : 1.8),
          ),
        ),
      0,
    ) + b.reduce((s, n) => s + Math.abs(n.note - 62) * 0.035, 0)
  );
}
/** Optimize a complete cyclic progression, including its last-to-first transition. */
export function voiceCycle(choices: Grip[][]): Grip[] {
  let best = Infinity,
    result: Grip[] = [];
  for (let first = 0; first < choices[0].length; first++) {
    let costs = choices[0].map((_, i) => (i === first ? 0 : Infinity));
    const paths: number[][] = [];
    for (let i = 1; i < choices.length; i++) {
      const prev: number[] = [];
      costs = choices[i].map((g) => {
        let score = Infinity,
          index = 0;
        choices[i - 1].forEach((p, j) => {
          const n = costs[j] + movement(p, g);
          if (n < score) {
            score = n;
            index = j;
          }
        });
        prev.push(index);
        return score;
      });
      paths.push(prev);
    }
    costs.forEach((cost, last) => {
      const closed = cost + movement(choices.at(-1)![last], choices[0][first]);
      if (closed < best) {
        best = closed;
        let j = last;
        const route = [j];
        for (let i = paths.length - 1; i >= 0; i--) {
          j = paths[i][j];
          route.unshift(j);
        }
        result = route.map((v, i) => choices[i][v]);
      }
    });
  }
  return result;
}
export function musicalBackingPlan(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
) {
  const source = recordedGenreStory(style, mode);
  const bars = source.bars.map((b, i) => {
    const chord = backingChord(style, quality, i),
      root = (tonic + chord.degree + 12) % 12;
    // A three-chorus memory rotates the conversation without immediate repetition.
    const phrase = Math.floor(i / 4),
      motif = (phrase + cycle) % conversations.length;
    const role = conversations[motif][i % 4];
    const fill = source.fills.find((f) => f.bar === i + 1);
    const loopBridge = Math.max(0, (i - (source.bars.length - 8)) / 7);
    const db = b.db * (1 - loopBridge) + source.bars[0].db * loopBridge;
    // Small chorus variation returns to the same seam, preserving loop continuity.
    const breath =
      Math.sin((Math.PI * i) / (source.bars.length - 1)) *
      ((cycle % 3) - 1) *
      0.65;
    return {
      ...b,
      root,
      minor: chord.minor,
      role,
      motif,
      fillStart: fill?.start_beat,
      level: 10 ** ((db + breath) / 20),
    };
  });
  const changes = Array.from(
    { length: style === "rock" ? 8 : 12 },
    (_, i) => bars[i],
  );
  const grips = voiceCycle(changes.map((b) => concertGrips(b.root, b.minor)));
  return { style, mode, quality, tonic, tempo, cycle, bars, grips };
}
export function plannedBackingArrangement(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
) {
  const base = backingArrangement(style, mode, quality, cycle),
    plan = musicalBackingPlan(style, mode, quality, cycle, tempo, tonic);
  const events: BackingEvent[] = base.events
    .filter((e) => e.part === "drums" || e.part === "percussion")
    .map((e) => ({
      ...e,
      level: plan.bars[Math.floor(e.beat / 4)]?.level ?? e.level,
    }));
  const pace = Math.max(0, Math.min(1, (tempo - 65) / 65));
  const referenceBass = practiceBackingArrangement(
    style,
    mode,
    quality,
    cycle,
    tempo,
  ).events.filter((e) => e.part === "bass");
  let previousBass = 33;
  for (const [i, b] of plan.bars.entries()) {
    const t = i * 4,
      quiet = b.texture === "crossstick",
      filling = b.fillStart !== undefined;
    const grip = plan.grips[i % plan.grips.length],
      third = (b.root + (b.minor ? 3 : 4)) % 12,
      fifth = (b.root + 7) % 12;
    const previous = plan.bars[(i + plan.bars.length - 1) % plan.bars.length];
    const entry =
      i === 0 ||
      b.section_pos === 0 ||
      i % 2 === 0 ||
      previous.root !== b.root ||
      previous.minor !== b.minor;
    if (entry) {
      // Root/fifth shells leave room for the learner; periodically state the third.
      const voices = grip.filter((n) => i % 8 === 0 || n.note % 12 !== third);
      const brush = (0.015 + 0.013 * (1 - pace)) * (tempo / 60);
      const direction =
        (Math.floor(i / 2) + cycle) % 3 === 2 ? [...voices].reverse() : voices;
      direction.forEach((n, j) =>
        events.push({
          part: "guitar",
          note: n.note,
          string: n.string,
          absolute: true,
          beat: t + j * brush,
          duration: 7.8 - j * brush,
          velocity: quiet ? 29 : 37 + (i % 4 === 0 ? 4 : 0),
          level: b.level,
          articulation: "normal",
        }),
      );
    }
    if (mode === "active" && b.role === "guitar" && !quiet && !filling) {
      [...grip]
        .reverse()
        .filter((n) => n.note % 12 !== third)
        .forEach((n, j) =>
          events.push({
            part: "guitar",
            note: n.note,
            string: n.string,
            absolute: true,
            beat:
              t + (style === "blues" ? 8 / 3 : 2.5) + (j * 0.022 * tempo) / 60,
            duration: 2.5,
            velocity: 31 + j * 2,
            level: b.level,
            articulation: "normal",
          }),
        );
    }
    const rootNotes = Array.from({ length: 28 }, (_, j) => j + 28).filter(
      (n) => n % 12 === b.root,
    );
    const root = rootNotes.reduce((a, n) =>
      Math.abs(n - previousBass) < Math.abs(a - previousBass) ? n : a,
    );
    // Keep A's human-aligned attacks, with at most two notes per bar. Variation
    // happens over an 8/12-bar phrase, never through extra response/ghost hits.
    const phraseBars = style === "blues" ? 12 : 8;
    const phrase = Math.floor(i / phraseBars) + cycle;
    const interval = [7, b.minor ? 3 : 4, 12][phrase % 3];
    const second = [root + interval, root + interval - 12]
      .filter((n) => n >= 28 && n <= 55)
      .reduce((a, n) =>
        Math.abs(n - previousBass) < Math.abs(a - previousBass) ? n : a,
      );
    const attacks = referenceBass
      .filter((e) => Math.floor(e.beat / 4) === i)
      .slice(0, 2);
    const breath = Math.sin(
      (Math.PI * (i % phraseBars)) / Math.max(1, phraseBars - 1),
    );
    attacks.forEach((attack, j) => {
      const note = j === 0 ? root : second;
      events.push({
        part: "bass",
        absolute: true,
        note,
        beat: attack.beat,
        duration: Math.min(attack.duration * (1 + breath * 0.12), 1.75),
        velocity: (quiet ? 43 : j === 0 ? 58 : 48) + Math.round(breath * 2),
        level: b.level,
        articulation: attack.articulation === "muted" ? "muted" : "normal",
      });
      previousBass = note;
    });
  }
  events.sort((a, b) => a.beat - b.beat);
  // Physical strings ring until re-picked or until harmony makes their pitch foreign.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.part !== "guitar" && e.part !== "bass") continue;
    const next = events
      .slice(i + 1)
      .find(
        (n) =>
          n.part === e.part && (e.part === "bass" || n.string === e.string),
      );
    let end = Math.min(
      base.beats - 0.025,
      e.beat + e.duration,
      next ? next.beat - 0.035 : Infinity,
    );
    if (e.part === "guitar")
      for (let bar = Math.floor(e.beat / 4) + 1; bar * 4 < end; bar++) {
        const b = plan.bars[bar];
        if (
          ![
            b.root,
            (b.root + (b.minor ? 3 : 4)) % 12,
            (b.root + 7) % 12,
          ].includes(e.note % 12)
        ) {
          end = bar * 4 - 0.045;
          break;
        }
      }
    e.duration = Math.max(0.04, end - e.beat);
  }
  return {
    ...base,
    events,
    roles: plan.bars.map((b) => b.role),
    tempo,
    phrasing: "planned-conversation-v2",
    plan,
  };
}
