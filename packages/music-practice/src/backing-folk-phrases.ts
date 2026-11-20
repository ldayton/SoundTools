/** Authored alternating-thumb Folk sentences and their playable string realization. */
import score from "./backing-phrases/folk-fingerstyle.json";
import { acousticCapo, acousticGrip } from "./backing-acoustic";
import { sharedBackingPocket } from "./backing-shared-pocket";
import { levelBackingSections } from "./backing-dynamics";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent } from "./backing-track-model";

const voices = [
  "thumb-root",
  "thumb-fifth",
  "inner",
  "middle",
  "top",
  "lead-root",
  "lead-step",
  "lead-third",
] as const;
type Voice = (typeof voices)[number];
const pc = (n: number) => ((n % 12) + 12) % 12;
const tuning = [40, 45, 50, 55, 59, 64];

export function folkFingerstyleScoreIssues() {
  const issues: string[] = [];
  const bad = (message: string) => issues.push(message);
  if (
    score.version !== 1 ||
    score.ticksPerBeat !== 12 ||
    score.phrases.length !== 4
  )
    bad("Unsupported fingerstyle score");
  for (const [id, cell] of Object.entries(score.guitarCells))
    for (const [tick, length, voice, velocity] of cell) {
      if (
        !Number.isInteger(tick) ||
        Number(tick) < 0 ||
        Number(tick) > 42 ||
        !Number.isInteger(length) ||
        Number(length) < 1 ||
        Number(length) > 28 ||
        !voices.includes(voice as Voice) ||
        !Number.isInteger(velocity) ||
        Number(velocity) < 1 ||
        Number(velocity) > 60
      )
        bad(`Invalid guitar stroke: ${id}`);
    }
  for (const [name, cells] of [
    ["bass", score.bassCells],
    ["brush", score.brushCells],
  ] as const)
    for (const [id, cell] of Object.entries(cells))
      for (const [tick, length, note, velocity] of cell) {
        if (
          !Number.isInteger(tick) ||
          tick < 0 ||
          tick > 42 ||
          !Number.isInteger(length) ||
          length < 1 ||
          tick + length > 48 ||
          !Number.isInteger(velocity) ||
          velocity < 1 ||
          velocity > 60 ||
          !(name === "bass" ? [0, 7] : [37]).includes(note)
        )
          bad(`Invalid ${name} stroke: ${id}`);
      }
  for (const q of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const) {
      const gain = score.gainDb[q][mode];
      if (!Number.isFinite(gain) || Math.abs(gain) > 8)
        bad("Invalid score gain");
    }
  const ids = new Set<string>();
  for (const p of score.phrases) {
    if (
      ids.has(p.id) ||
      p.bars.length !== 8 ||
      !["steady", "active"].includes(p.mode)
    )
      bad(`Invalid phrase: ${p.id}`);
    ids.add(p.id);
    for (const b of p.bars) {
      if (
        !Object.hasOwn(score.guitarCells, b.guitar) ||
        !Object.hasOwn(score.bassCells, b.bass) ||
        !Object.hasOwn(score.brushCells, b.brush)
      )
        bad(`Unknown cell: ${p.id}`);
    }
    if (!["breath", "cadence"].includes(p.bars.at(-1)!.guitar))
      bad(`Missing cadence: ${p.id}`);
  }
  return issues;
}

/** Audition an already tonic-resolved Folk take, using physically available
 * strings in one capo position. The upper melodic idea varies by phrase; the
 * thumb retains its independent pulse. No random notes or fills are added.
 */
export function rawFolkFingerstyleTake(base: BackingTake): BackingTake {
  if (folkFingerstyleScoreIssues().length)
    throw Error("Invalid authored fingerstyle score");
  const { tonic, quality, mode, bars, cycle } = base.plan;
  if (
    base.plan.style !== "folk" ||
    bars.length % 8 ||
    bars.some((b) => b.root !== tonic || b.minor !== (quality === "minor"))
  )
    throw Error("Fingerstyle audition requires tonic Folk harmony");
  const capo = acousticCapo(tonic, quality),
    grip = acousticGrip(tonic, quality === "minor", capo);
  const root = grip.find((n) => pc(n.note - tonic) === 0)!;
  const fifth = grip.find((n) => n.string <= 2 && pc(n.note - tonic) === 7)!;
  const upper = grip.filter((n) => n.string >= 3);
  const melodicRoot =
    upper
      .filter((n) => pc(n.note - tonic) === 0)
      .sort((a, b) => Math.abs(a.note - 62) - Math.abs(b.note - 62))[0] ?? root;
  const maxFret = Math.max(...grip.map((n) => n.fret)) + 3;
  const available = tuning
    .flatMap((open, string) =>
      string < 3
        ? []
        : Array.from({ length: 20 }, (_, fret) => ({
            string,
            fret,
            note: open + fret,
          })),
    )
    .filter((n) => n.fret >= capo && n.fret <= maxFret && n.note <= 76);
  const third = quality === "major" ? 4 : 3,
    neighbour = quality === "major" ? 2 : 5;
  const lines = available
    .filter((n) => pc(n.note - tonic) === 0)
    .flatMap((root) =>
      available
        .filter((n) => n.note === root.note + third)
        .flatMap((thirdNote) =>
          available
            .filter((n) => n.note === root.note + neighbour)
            .map((step) => ({ root, third: thirdNote, step })),
        ),
    );
  const baseFrets = grip.filter((n) => n.fret > capo).map((n) => n.fret);
  const line = lines
    .filter((l) => {
      const frets = [
        ...baseFrets,
        ...[l.root, l.third, l.step]
          .filter((n) => n.fret > capo)
          .map((n) => n.fret),
      ];
      return Math.max(...frets) - Math.min(...frets) <= 4;
    })
    .sort((a, b) => {
      const cost = (l: typeof a) =>
        Math.abs(l.root.note - melodicRoot.note) +
        [l.root, l.third, l.step].reduce(
          (sum, n) =>
            sum +
            0.2 *
              Math.abs(
                n.fret -
                  (grip.find((g) => g.string === n.string)?.fret ?? capo),
              ),
          0,
        );
      return cost(a) - cost(b);
    })[0];
  if (!line)
    throw Error(`No playable stepwise Folk phrase: ${tonic}/${quality}`);
  const mapping: Record<Voice, typeof root> = {
    "thumb-root": root,
    "thumb-fifth": fifth,
    inner: upper[0],
    middle: upper[1],
    top: upper[2],
    "lead-root": line.root,
    "lead-step": line.step,
    "lead-third": line.third,
  };
  const phrases = score.phrases.filter((p) => p.mode === mode),
    ids: string[] = [];
  const bassRoot = 36 + ((tonic + 6) % 12) - 6;
  const events: BackingEvent[] = [];
  const gain = 10 ** (score.gainDb[quality][mode] / 20);
  const micro = (s: number) => (s * base.tempo) / 60;
  for (const [index, bar] of bars.entries()) {
    const phrase =
      phrases[
        (Math.floor(index / 8) + (cycle * bars.length) / 8) % phrases.length
      ];
    if (index % 8 === 0) ids.push(phrase.id);
    const chosen = phrase.bars[index % 8],
      quiet = bar.texture === "crossstick";
    const cell =
      score.guitarCells[chosen.guitar as keyof typeof score.guitarCells];
    for (const [tick, length, voice, velocity] of cell) {
      const note = mapping[voice as Voice];
      events.push({
        part: "guitar",
        instrument: "acoustic-steel",
        beat: index * 4 + Number(tick) / 12 + micro(0.008),
        duration: Number(length) / 12,
        note: note.note,
        string: note.string,
        velocity: Math.round(Number(velocity) * (quiet ? 0.84 : 1)),
        level: bar.level * gain,
        absolute: true,
        naturalReleaseOnly: true,
        guitarReleaseSeconds: 0.045,
        articulation: "normal",
      });
    }
    for (const [tick, length, offset, velocity] of score.bassCells[
      chosen.bass as keyof typeof score.bassCells
    ])
      events.push({
        part: "bass",
        instrument: "upright-bass",
        beat: index * 4 + tick / 12 + micro(0.005),
        duration: length / 12,
        note: bassRoot + offset,
        velocity: Math.round(velocity * (quiet ? 0.8 : 1)),
        level: bar.level * 0.65 * gain,
        absolute: true,
        naturalReleaseOnly: true,
      });
    for (const [tick, length, note, velocity] of score.brushCells[
      chosen.brush as keyof typeof score.brushCells
    ])
      events.push({
        part: "drums",
        instrument: "brush-drums",
        beat: index * 4 + tick / 12 + micro(0.007),
        duration: length / 12,
        note,
        velocity,
        level: bar.level * gain,
      });
  }
  events.sort((a, b) => a.beat - b.beat);
  // A real string cannot ring two fretted notes at once, including a melody
  // crossing the accompanimental finger order. Gates yield before its reattack.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = events
      .slice(i + 1)
      .find(
        (n) =>
          n.part === e.part &&
          n.instrument === e.instrument &&
          (e.part === "bass" || (e.part === "guitar" && e.string === n.string)),
      );
    e.duration = Math.min(
      e.duration,
      base.beats - micro(0.04) - e.beat,
      next ? next.beat - micro(0.025) - e.beat : Infinity,
    );
    if (e.duration <= 0)
      throw Error("Two fingerstyle voices collide on one string");
  }
  const take = {
    ...base,
    events,
    phraseIds: ids,
    phrasing: "folk-fingerstyle-phrases-v1",
    plan: { ...base.plan, grips: bars.map(() => grip) },
  };
  return take;
}

/** Standalone audition uses the same performance/leveling order as production. */
export function folkFingerstyleTake(base: BackingTake): BackingTake {
  return levelBackingSections(
    sharedBackingPocket(rawFolkFingerstyleTake(base), base.tempo),
    "fingerpicked",
  );
}
