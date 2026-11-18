/** Original sparse Soul and acoustic Folk arrangements. */
import { BACKING_GENRES, genreChord } from "./backing-genres";
import { concertGrips, voiceCycle } from "./backing-musical-plan";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";
function pianoGrips(root: number, minor: boolean, seventh: number) {
  const pcs = [
    root,
    (root + (minor ? 3 : 4)) % 12,
    (root + 7) % 12,
    (root + seventh) % 12,
  ];
  const notes = Array.from({ length: 32 }, (_, i) => 48 + i).filter((n) =>
    pcs.includes(n % 12),
  );
  const out = [];
  for (let i = 0; i <= notes.length - 4; i++) {
    const chord = notes.slice(i, i + 4);
    if (
      new Set(chord.map((n) => n % 12)).size === 4 &&
      chord[3] - chord[0] <= 16
    )
      out.push(chord.map((note, string) => ({ note, string, fret: 0 })));
  }
  return out;
}
export function warmBackingArrangement(
  style: "soul" | "folk",
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 88,
  tonic = 9,
): BackingTake {
  const genre = BACKING_GENRES[style],
    soul = style === "soul",
    bars: BackingTake["plan"]["bars"] = [];
  for (const section of genre.form.sections)
    for (let pos = 0; pos < section.bars; pos++) {
      const index = bars.length,
        c = genreChord(style, quality, index),
        root = (tonic + c.degree) % 12,
        bridge = Math.max(0, (index - (genre.form.bars - 8)) / 7);
      let db =
        section.db[0] +
        ((section.db[1] - section.db[0]) * pos) / Math.max(1, section.bars - 1);
      db = db * (1 - bridge) + genre.form.sections[0].db[0] * bridge;
      db +=
        Math.sin((Math.PI * index) / (genre.form.bars - 1)) *
        ((cycle % 3) - 1) *
        0.3;
      const fill =
        (index + 1) % genre.activity[mode].fillsEveryBars === 0 &&
        section.texture !== "crossstick";
      bars.push({
        index,
        section: section.name,
        texture: section.texture,
        db,
        section_pos: pos,
        section_bars: section.bars,
        root,
        minor: c.minor,
        role:
          index % 4 === 3 ? "drums" : index % 4 === 1 ? "guitar" : "foundation",
        motif: (Math.floor(index / 8) + cycle) % 3,
        fillStart: fill ? 3.5 : undefined,
        level: 10 ** (db / 20),
      });
    }
  const length = genre.harmony[quality].length * genre.harmony.barsPerChord;
  const grips = voiceCycle(
    bars
      .slice(0, length)
      .map((b) =>
        soul
          ? pianoGrips(
              b.root,
              b.minor,
              genreChord(style, quality, b.index).seventh ?? 10,
            )
          : concertGrips(b.root, b.minor),
      ),
  );
  const events: BackingEvent[] = [],
    micro = (seconds: number) => (seconds * tempo) / 60;
  const add = (
    part: BackingEvent["part"],
    beat: number,
    note: number,
    velocity: number,
    duration: number,
    level: number,
    extra: Partial<BackingEvent> = {},
  ) => events.push({ part, beat, note, velocity, duration, level, ...extra });
  let previousBass = 33;
  for (const b of bars) {
    const t = b.index * 4,
      quiet = b.texture === "crossstick",
      fill = b.fillStart !== undefined,
      p = [0, 0.003, -0.001, 0.004][b.index % 4];
    for (const pos of genre.rhythm.kick)
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, p) : p + 0.003),
        36,
        quiet ? 48 : soul ? 64 : 53,
        0.14,
        b.level,
      );
    for (const pos of genre.rhythm.backbeat)
      add(
        "drums",
        t + pos + micro((soul ? 0.018 : 0.009) + p),
        soul && !quiet ? 38 : 37,
        quiet ? 37 : soul ? 65 : 43,
        0.15,
        b.level,
      );
    const hats = soul
      ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
      : mode === "active" && !quiet
        ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
        : [0, 1, 2, 3];
    for (const pos of hats) {
      if (fill && pos >= 3.5) continue;
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, p) : p + 0.003),
        42,
        quiet ? 24 : pos % 1 ? 27 : soul ? 39 : 31,
        0.12,
        b.level,
      );
    }
    if (soul && mode === "active" && !quiet && !fill && b.index % 4 === 3)
      add("drums", t + 2.75 + micro(0.016 + p), 38, 24, 0.1, b.level);
    if (fill) {
      add("drums", t + 3.5, 38, soul ? 43 : 32, 0.12, b.level);
      if (mode === "active")
        add("drums", t + 3.75, 45, soul ? 39 : 30, 0.12, b.level);
    }
    if (!quiet && b.index % 2 === 1)
      add("percussion", t + 1.5, 70, 25, 0.08, b.level * 0.6);
    const roots = Array.from({ length: 20 }, (_, i) => i + 28).filter(
        (n) => n % 12 === b.root,
      ),
      root = roots.reduce((a, n) =>
        Math.abs(n - previousBass) < Math.abs(a - previousBass) ? n : a,
      );
    const interval = b.motif === 1 && b.index % 4 === 3 ? (b.minor ? 3 : 4) : 7;
    const answer = [root + interval, root + interval - 12]
      .filter((n) => n >= 28 && n <= 55)
      .reduce((a, n) => (Math.abs(n - root) < Math.abs(a - root) ? n : a));
    const space = b.section === "Breathe" && b.index % 2 === 1;
    genre.roles.bassBeats
      .slice(0, space ? 1 : 2)
      .forEach((pos, j) =>
        add(
          "bass",
          t + pos + micro((pos === 0 ? Math.max(0, p) : p + 0.003) + 0.004),
          j === 0 ? root : answer,
          quiet ? 41 : j === 0 ? 54 : 46,
          quiet ? 1.3 : soul ? 1.15 : 1.35,
          b.level,
          { absolute: true, articulation: "normal" },
        ),
      );
    previousBass = space ? root : answer;
    const grip = grips[b.index % grips.length];
    if (soul) {
      if (b.index % genre.harmony.barsPerChord === 0) {
        for (const [j, n] of grip.entries()) {
          let duration = 7.68 - j * 0.004;
          add(
            "keys",
            t + micro(0.018 + j * 0.004),
            n.note,
            quiet ? 35 : 43 + (j === 1 ? 2 : 0),
            duration,
            b.level,
            { absolute: true, noteReleaseSeconds: 0.16 },
          );
        }
      }
    } else {
      const voices = grip;
      const order =
        (b.index + cycle) % 3 === 2 ? [...voices].reverse() : voices;
      order.forEach((n, j) =>
        add(
          "guitar",
          t + micro(0.012 + j * 0.026),
          n.note,
          quiet ? 28 : 34 + (j === 0 ? 2 : 0),
          3.82 - j * micro(0.026),
          b.level,
          {
            absolute: true,
            string: n.string,
            articulation: "normal",
            naturalReleaseOnly: true,
          },
        ),
      );
      if (mode === "active" && !quiet && !fill && b.index % 4 === 1)
        [...voices]
          .reverse()
          .slice(0, 2)
          .forEach((n, j) =>
            add(
              "guitar",
              t + 2.5 + micro(0.012 + j * 0.018),
              n.note,
              29,
              1.28,
              b.level,
              {
                absolute: true,
                string: n.string,
                articulation: "normal",
                naturalReleaseOnly: true,
              },
            ),
          );
    }
  }
  const beats = genre.form.bars * 4;
  for (const e of events)
    e.duration = Math.max(
      0.04,
      Math.min(
        e.duration,
        beats - e.beat - (e.part === "keys" ? micro(0.16) : 0.04),
      ),
    );
  return {
    nativeTempo: genre.tempo.preferred,
    sourceKey: 9,
    beats,
    events: events.sort((a, b) => a.beat - b.beat),
    quality,
    cycle,
    seed: (soul ? 8407 : 8807) + cycle,
    phrasing: soul ? "soul-warm-keys-v1" : "folk-steel-strings-v1",
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style, mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
