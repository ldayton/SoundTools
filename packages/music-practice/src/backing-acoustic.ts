/** Acoustic-first parts: real thumb/string patterns and restrained band answers. */
import { BACKING_GENRES, genreChord } from "./backing-genres";
import { scalePitchClasses, type BackingQuality } from "./backing-arrangement";
import { backingPattern } from "./backing-patterns";
import type { BackingPattern } from "./backing-patterns";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { BackingTake } from "./backing-plan-types";

const tuning = [40, 45, 50, 55, 59, 64];
// Low E -> high E. Including the low fifth on C/D gives the thumb a real
// alternate bass string; muted strings are excluded, never synthesized.
const open: Record<string, number[]> = {
  "0": [3, 3, 2, 0, 1, 0],
  "2": [-1, 0, 0, 2, 3, 2],
  "4": [0, 2, 2, 1, 0, 0],
  "7": [3, 2, 0, 0, 0, 3],
  "9": [-1, 0, 2, 2, 2, 0],
  "2m": [-1, 0, 0, 2, 3, 1],
  "4m": [0, 2, 2, 0, 0, 0],
  "9m": [-1, 0, 2, 2, 1, 0],
};

export function acousticCapo(tonic: number, quality: BackingQuality) {
  const keys = quality === "major" ? [0, 2, 4, 7, 9] : [2, 4, 9];
  return Math.min(...keys.map((key) => (tonic - key + 12) % 12));
}

export function acousticGrip(root: number, minor: boolean, capo: number) {
  const relative = (root - capo + 12) % 12;
  let frets = open[`${relative}${minor ? "m" : ""}`];
  if (!frets) {
    const e = (relative - 4 + 12) % 12,
      a = (relative - 9 + 12) % 12;
    frets =
      e <= a
        ? [0, 2, 2, minor ? 0 : 1, 0, 0].map((f) => f + e)
        : [-1, a, a + 2, a + 2, a + (minor ? 1 : 2), a];
  }
  return frets.flatMap((fret, string) =>
    fret < 0
      ? []
      : [
          {
            string,
            fret: fret + capo,
            note: tuning[string] + fret + capo,
          },
        ],
  );
}

export function acousticArrangement(
  style: "folk" | "country",
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
  requested?: BackingPattern,
): BackingTake {
  const genre = BACKING_GENRES[style],
    pattern = backingPattern(style, requested);
  const country = style === "country",
    fingerpicked = pattern === "fingerpicked";
  const capo = acousticCapo(tonic, quality),
    bars: BackingTake["plan"]["bars"] = [];
  for (const section of genre.form.sections)
    for (let pos = 0; pos < section.bars; pos++) {
      const index = bars.length,
        chord = genreChord(style, quality, index);
      const bridge = Math.max(0, (index - (genre.form.bars - 8)) / 7);
      let db =
        section.db[0] +
        ((section.db[1] - section.db[0]) * pos) / Math.max(1, section.bars - 1);
      db = db * (1 - bridge) + genre.form.sections[0].db[0] * bridge;
      db +=
        Math.sin((Math.PI * index) / (genre.form.bars - 1)) *
        ((cycle % 3) - 1) *
        0.3;
      bars.push({
        index,
        section: section.name,
        texture: section.texture,
        db,
        section_pos: pos,
        section_bars: section.bars,
        root: (tonic + chord.degree) % 12,
        minor: chord.minor,
        role: index % 4 === 3 ? "guitar" : "foundation",
        motif: (Math.floor(index / 8) + cycle) % 3,
        fillStart: undefined,
        level: 10 ** (db / 20),
      });
    }
  const grips = bars.map((b) => acousticGrip(b.root, b.minor, capo));
  const events: BackingEvent[] = [],
    micro = (seconds: number) => (seconds * tempo) / 60;
  const add = (e: BackingEvent) => events.push(e);
  let previousBass = 33;
  for (const b of bars) {
    const t = b.index * 4,
      quiet = b.texture === "crossstick";
    const response =
      country && mode === "active" && !quiet && b.index % 4 === 3;
    const grip = grips[b.index],
      upper = grip.filter((n) => n.string >= 2).slice(-3);
    const root = grip.find((n) => n.note % 12 === b.root)!;
    const fifth = grip.find(
      (n) => n.note % 12 === (b.root + 7) % 12 && n.string <= 2,
    )!;
    const pick = (
      n: typeof root,
      pos: number,
      duration: number,
      velocity: number,
    ) =>
      add({
        part: "guitar",
        instrument: "acoustic-steel",
        beat: t + pos,
        note: n.note,
        string: n.string,
        absolute: true,
        duration,
        velocity,
        level: b.level,
        naturalReleaseOnly: true,
        guitarReleaseSeconds: 0.045,
        articulation: "normal",
      });
    if (fingerpicked) {
      // Alternating thumb on the quarter notes; fingers answer on the offbeats.
      [root, fifth, root, fifth].forEach((n, beat) =>
        pick(n, beat, 1.85, quiet ? 34 : 43),
      );
      [0, 1, 2, 1].forEach((finger, i) =>
        pick(
          upper[(finger + b.motif) % upper.length],
          i + 0.5,
          2.25,
          quiet ? 31 : 39,
        ),
      );
      if (mode === "active" && !quiet && b.index % 4 === 1)
        pick(upper[2], 2, 1.85, 51); // occasional thumb/finger pinch
    } else {
      for (const [i, pos] of [0, 2].entries())
        pick(i ? fifth : root, pos, country ? 0.72 : 1.65, quiet ? 40 : 57);
      for (const pos of [1, 3]) {
        if (response && pos === 3) continue; // leave a real hole for the electric reply
        upper.forEach((n, i) =>
          pick(
            n,
            pos + micro(i * 0.013),
            country ? 0.4 : 1.8,
            quiet ? 34 : 55 - i * 3,
          ),
        );
      }
      if (mode === "active" && !quiet && !response && b.index % 4 === 1)
        [...upper]
          .reverse()
          .slice(0, 2)
          .forEach((n, i) =>
            pick(n, 2.5 + micro(i * 0.011), country ? 0.3 : 0.8, 39),
          );
    }
    // Upright stays a foundation, leaving thumb bass and the learner audible.
    const roots = Array.from({ length: 20 }, (_, i) => 28 + i).filter(
      (n) => n % 12 === b.root,
    );
    const low = roots.reduce((a, n) =>
      Math.abs(n - previousBass) < Math.abs(a - previousBass) ? n : a,
    );
    const alt = [low + 7, low - 5]
      .filter((n) => n >= 28 && n <= 55)
      .reduce((a, n) => (Math.abs(n - low) < Math.abs(a - low) ? n : a));
    const bass = (note: number, pos: number, duration: number) =>
      add({
        part: "bass",
        instrument: "upright-bass",
        beat: t + pos + micro(0.005),
        note,
        velocity: quiet ? 40 : 55,
        duration,
        level: b.level * (country ? 1 : 0.65),
        absolute: true,
        naturalReleaseOnly: true,
      });
    bass(low, 0, country ? 1.1 : 1.65);
    if (country || b.section !== "Breathe" || b.index % 2 === 0)
      bass(alt, 2, country ? 0.95 : 1.5);
    previousBass = alt;
    if (country && mode === "active" && !quiet && b.index % 8 === 7) {
      const next = bars[(b.index + 1) % bars.length].root;
      const target = Array.from({ length: 28 }, (_, i) => i + 28)
        .filter((n) => n % 12 === next)
        .reduce((a, n) => (Math.abs(n - alt) < Math.abs(a - alt) ? n : a));
      const scale = scalePitchClasses(tonic, quality),
        direction = target >= alt ? 1 : -1;
      const approach = Array.from(
        { length: 4 },
        (_, i) => target - direction * (i + 1),
      ).find((n) => n >= 28 && n <= 55 && scale.includes(n % 12));
      if (approach !== undefined) bass(approach, 3.5, 0.4);
    }
    const brush = (note: number, pos: number, velocity: number) =>
      add({
        part: "drums",
        instrument: "brush-drums",
        note,
        beat: t + pos + micro(0.007),
        velocity,
        duration: 0.15,
        level: b.level,
      });
    if (country || (!quiet && !fingerpicked)) {
      brush(36, 0, quiet ? 28 : 48);
      brush(36, 2, quiet ? 26 : 43);
    }
    brush(quiet || !country ? 37 : 38, 1, country ? 55 : 27);
    brush(quiet || !country ? 37 : 38, 3, country ? 58 : 29);
    if (response) {
      // A short upper-register double-stop answer, then yield to the next root.
      const reply = upper.slice(-2);
      for (const [i, pos] of [3, 3.5].entries())
        for (const n of reply)
          add({
            part: "guitar",
            instrument: "electric-twang",
            beat: t + pos + micro(0.009),
            note: n.note,
            string: n.string,
            velocity: i ? 40 : 57,
            duration: 0.32,
            level: b.level * 0.8,
            absolute: true,
            naturalReleaseOnly: true,
          });
    }
  }
  const beats = genre.form.bars * 4;
  events.sort((a, b) => a.beat - b.beat);
  // Never carry an old harmony across a change, reattack, or the loop seam.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    let end = beats - 0.03;
    if (e.part === "bass" || e.part === "guitar") {
      const next = events
        .slice(i + 1)
        .find(
          (n) =>
            n.part === e.part &&
            n.instrument === e.instrument &&
            (e.part === "bass" || n.string === e.string),
        );
      if (next) end = Math.min(end, next.beat - micro(0.05));
      for (
        let b = Math.floor(e.beat / 4) + 1;
        b < bars.length && b * 4 < e.beat + e.duration;
        b++
      )
        if (
          bars[b].root !== bars[b - 1].root ||
          bars[b].minor !== bars[b - 1].minor
        ) {
          end = Math.min(end, b * 4 - micro(0.05));
          break;
        }
    }
    e.duration = Math.max(0.04, Math.min(e.duration, end - e.beat));
  }
  return {
    nativeTempo: genre.tempo.preferred,
    sourceKey: 9,
    beats,
    events,
    quality,
    cycle,
    seed: 4701 + cycle,
    phrasing: `acoustic-${pattern}-v1`,
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style, mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
