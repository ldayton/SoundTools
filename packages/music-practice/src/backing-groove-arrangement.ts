/** Shared drummer, section dynamics and playable grips for the two groove bands. */
import { BACKING_GENRES, genreChord } from "./backing-genres";
import { concertGrips, voiceCycle } from "./backing-musical-plan";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";
export function grooveFoundation(
  style: "reggae" | "funk",
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
  tonic = 9,
): BackingTake {
  const genre = BACKING_GENRES[style],
    reggae = genre.rhythm.strategy === "one-drop";
  const bars: BackingTake["plan"]["bars"] = [];
  for (const section of genre.form.sections)
    for (let pos = 0; pos < section.bars; pos++) {
      const index = bars.length,
        c = genreChord(style, quality, index),
        root = (tonic + c.degree) % 12;
      const bridge = Math.max(0, (index - (genre.form.bars - 8)) / 7);
      let db =
        section.db[0] +
        ((section.db[1] - section.db[0]) * pos) / Math.max(1, section.bars - 1);
      db = db * (1 - bridge) + genre.form.sections[0].db[0] * bridge;
      db +=
        Math.sin((Math.PI * index) / (genre.form.bars - 1)) *
        ((cycle % 3) - 1) *
        0.35;
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
        motif: (Math.floor(index / genre.form.phraseBars) + cycle) % 3,
        fillStart: fill ? 3.5 : undefined,
        level: 10 ** (db / 20),
      });
    }
  const length = genre.harmony[quality].length * genre.harmony.barsPerChord;
  const grips = voiceCycle(
    bars.slice(0, length).map((b) => concertGrips(b.root, b.minor)),
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
  for (const b of bars) {
    const t = b.index * 4,
      quiet = b.texture === "crossstick",
      fill = b.fillStart !== undefined;
    const placement = [0, 0.003, -0.002, 0.004][b.index % 4];
    const kicks = quiet && !reggae ? [0, 2.5] : genre.rhythm.kick;
    for (const pos of kicks)
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, placement) : placement + 0.003),
        36,
        quiet ? 53 : reggae ? 65 : 70,
        0.14,
        b.level,
      );
    for (const pos of genre.rhythm.backbeat)
      add(
        "drums",
        t + pos + micro((reggae ? 0.014 : 0.012) + placement),
        reggae || quiet ? 37 : 38,
        reggae ? 61 : quiet ? 47 : 70 + (pos === 3 ? 3 : 0),
        0.15,
        b.level,
      );
    const hatBeats =
      reggae || quiet || mode === "steady"
        ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
        : [0, 0.5, 0.75, 1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 3.75];
    for (const pos of hatBeats) {
      if (fill && pos >= 3.5) continue;
      const sixteenth = Math.abs(pos * 2 - Math.round(pos * 2)) > 0.1;
      const open =
        mode === "active" && !quiet && (b.index + 1) % 8 === 0 && pos === 3.5;
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, placement) : placement + 0.003),
        open ? 46 : 42,
        quiet ? (pos % 1 ? 25 : 34) : sixteenth ? 25 : pos % 1 ? 34 : 43,
        0.12,
        b.level,
      );
    }
    if (!reggae && mode === "active" && !quiet && !fill && b.index % 2 === 1)
      add("drums", t + 2.75 + micro(0.009 + placement), 38, 25, 0.1, b.level);
    if (fill) {
      add("drums", t + 3.5, 38, reggae ? 44 : 49, 0.12, b.level);
      if (mode === "active")
        add(
          "drums",
          t + 3.75,
          b.motif === 1 ? 45 : 38,
          reggae ? 39 : 45,
          0.12,
          b.level,
        );
    }
    if (!quiet && b.index % 2 === 1)
      add("percussion", t + (reggae ? 3.5 : 1.5), 70, 26, 0.08, b.level * 0.6);
  }

  const beats = genre.form.bars * 4;
  for (const e of events)
    e.duration = Math.max(0.04, Math.min(e.duration, beats - 0.04 - e.beat));
  return {
    nativeTempo: genre.tempo.preferred,
    sourceKey: 9,
    beats,
    events: events.sort((a, b) => a.beat - b.beat),
    quality,
    cycle,
    seed: (reggae ? 7907 : 10427) + cycle,
    phrasing: reggae ? "reggae-one-drop-v1" : "funk-syncopation-v1",
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style, mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
