/** Sparse original country two-step using the approved electric-band samples. */
import { BACKING_GENRES, genreChord } from "./backing-genres";
import { concertGrips, voiceCycle } from "./backing-musical-plan";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";
export function countryArrangement(
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 104,
  tonic = 9,
): BackingTake {
  const genre = BACKING_GENRES.country,
    beatsPerBar = (genre.meter[0] * 4) / genre.meter[1];
  const bars: BackingTake["plan"]["bars"] = [];
  for (const section of genre.form.sections)
    for (let pos = 0; pos < section.bars; pos++) {
      const index = bars.length,
        c = genreChord("country", quality, index),
        root = (tonic + c.degree) % 12;
      let db =
        section.db[0] +
        ((section.db[1] - section.db[0]) * pos) / Math.max(1, section.bars - 1);
      const bridge = Math.max(0, (index - (genre.form.bars - 8)) / 7);
      db = db * (1 - bridge) + genre.form.sections[0].db[0] * bridge;
      db +=
        Math.sin((Math.PI * index) / (genre.form.bars - 1)) *
        ((cycle % 3) - 1) *
        0.35;
      const phrase = Math.floor(index / genre.form.phraseBars),
        filling =
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
        motif: (phrase + cycle) % 3,
        fillStart: filling ? 3.5 : undefined,
        level: 10 ** (db / 20),
      });
    }
  const progression = genre.harmony[quality],
    length = progression.length * genre.harmony.barsPerChord;
  const grips = voiceCycle(
    bars.slice(0, length).map((b) => concertGrips(b.root, b.minor)),
  );
  const events: BackingEvent[] = [];
  const add = (
    part: BackingEvent["part"],
    beat: number,
    note: number,
    velocity: number,
    duration: number,
    level: number,
    extra: Partial<BackingEvent> = {},
  ) => events.push({ part, beat, note, velocity, duration, level, ...extra });
  const micro = (seconds: number) => (seconds * tempo) / 60;
  let lastBass = 33;
  for (const b of bars) {
    const t = b.index * beatsPerBar,
      quiet = b.texture === "crossstick",
      fill = b.fillStart !== undefined;
    const pocket = [0, 0.003, -0.002, 0.004][b.index % 4];
    for (const pos of genre.rhythm.kick)
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, pocket) : pocket + 0.002),
        36,
        quiet ? 53 : 65,
        0.14,
        b.level,
      );
    for (const pos of genre.rhythm.backbeat)
      add(
        "drums",
        t + pos + micro(0.009 + pocket),
        quiet ? 37 : 38,
        quiet ? 45 : 59 + (pos === 3 ? 2 : 0),
        0.15,
        b.level,
      );
    // Eighth-note pulse; a fill replaces the final hat strokes rather than adding
    // more simultaneous hands. Steady/Active never increase the bass attack count.
    for (let j = 0; j < 8; j++) {
      const pos = j / 2;
      if (fill && pos >= 3.5) continue;
      add(
        "drums",
        t + pos + micro(j === 0 ? Math.max(0, pocket) : pocket + 0.003),
        42,
        quiet ? (j % 2 ? 26 : 35) : j % 2 ? 31 : 44,
        0.12,
        b.level,
      );
    }
    if (fill) {
      add("drums", t + 3.5, 38, mode === "active" ? 48 : 39, 0.12, b.level);
      if (mode === "active")
        add("drums", t + 3.75, b.motif === 1 ? 45 : 38, 43, 0.12, b.level);
    }
    if (!quiet && (b.index % 4 === 1 || b.index % 4 === 3))
      add("percussion", t + 2.5, 70, 28, 0.08, b.level * 0.65);
    const roots = Array.from({ length: 20 }, (_, i) => i + 28).filter(
      (n) => n % 12 === b.root,
    );
    const root = roots.reduce((a, n) =>
      Math.abs(n - lastBass) < Math.abs(a - lastBass) ? n : a,
    );
    const answerInterval =
      b.motif === 1 &&
      b.index % genre.form.phraseBars === genre.form.phraseBars - 1
        ? b.minor
          ? 3
          : 4
        : 7;
    const answer = [root + answerInterval, root + answerInterval - 12]
      .filter((n) => n >= 28 && n <= 55)
      .reduce((a, n) => (Math.abs(n - root) < Math.abs(a - root) ? n : a));
    genre.roles.bassBeats
      .slice(0, genre.interaction.maxBassAttacksPerBar)
      .forEach((pos, j) => {
        add(
          "bass",
          t +
            pos +
            micro((pos === 0 ? Math.max(0, pocket) : pocket + 0.002) + 0.004),
          j === 0 ? root : answer,
          quiet ? 43 : j === 0 ? 57 : 48,
          quiet ? 1.2 : 1.02,
          b.level,
          { absolute: true, articulation: "normal" },
        );
      });
    lastBass = answer;
    const grip = grips[b.index % grips.length],
      third = (b.root + (b.minor ? 3 : 4)) % 12;
    // Short, quiet chord support on the backbeat: the country "chick".
    const voices = grip.filter(
      (n) => b.index % 8 === 0 || n.note % 12 !== third,
    );
    for (const [stroke, pos] of genre.roles.guitarBeats.entries()) {
      const order = stroke === 1 ? [...voices].reverse() : voices;
      order.forEach((n, j) =>
        add(
          "guitar",
          t + pos + micro(0.013 + pocket + j * (stroke === 0 ? 0.018 : 0.013)),
          n.note,
          quiet ? 26 : 31 + (stroke === 0 ? 1 : -1),
          quiet ? 0.92 : mode === "steady" ? 0.72 : 0.6,
          b.level,
          { absolute: true, string: n.string, articulation: "normal" },
        ),
      );
    }
  }
  const beats = genre.form.bars * beatsPerBar;
  for (const e of events)
    e.duration = Math.max(0.04, Math.min(e.duration, beats - 0.04 - e.beat));
  return {
    nativeTempo: genre.tempo.preferred,
    sourceKey: 9,
    beats,
    events: events.sort((a, b) => a.beat - b.beat),
    quality,
    cycle,
    seed: 3701 + cycle,
    phrasing: "country-two-step-v1",
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style: "country", mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
