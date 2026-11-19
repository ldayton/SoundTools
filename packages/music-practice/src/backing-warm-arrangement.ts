/** Sparse Soul arrangement; acoustic styles have their own string technique. */
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
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 88,
  tonic = 9,
): BackingTake {
  const style = "soul";
  const genre = BACKING_GENRES[style],
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
        pianoGrips(
          b.root,
          b.minor,
          genreChord(style, quality, b.index).seventh ?? 10,
        ),
      ),
  );
  const guitarGrips = voiceCycle(
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
        quiet ? 48 : 64,
        0.14,
        b.level,
      );
    for (const pos of genre.rhythm.backbeat)
      add(
        "drums",
        t + pos + micro(0.018 + p),
        !quiet ? 38 : 37,
        quiet ? 37 : 65,
        0.15,
        b.level,
      );
    const hats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    for (const pos of hats) {
      if (fill && pos >= 3.5) continue;
      add(
        "drums",
        t + pos + micro(pos === 0 ? Math.max(0, p) : p + 0.003),
        42,
        quiet ? 24 : pos % 1 ? 27 : 39,
        0.12,
        b.level,
      );
    }
    if (mode === "active" && !quiet && !fill && b.index % 4 === 3)
      add("drums", t + 2.75 + micro(0.016 + p), 38, 24, 0.1, b.level);
    if (fill) {
      add("drums", t + 3.5, 38, 43, 0.12, b.level);
      if (mode === "active") add("drums", t + 3.75, 45, 39, 0.12, b.level);
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
    genre.roles.bassBeats.slice(0, space ? 1 : 2).forEach((pos, j) =>
      add(
        "bass",
        t + pos + micro((pos === 0 ? Math.max(0, p) : p + 0.003) + 0.004),
        j === 0 ? root : answer,
        quiet ? 41 : j === 0 ? 54 : 46,
        quiet ? 1.3 : 1.15,
        b.level,
        {
          absolute: true,
          instrument: "soul-bass",
          articulation: "normal",
          naturalReleaseOnly: true,
        },
      ),
    );
    if (mode === "active" && !quiet && !space)
      add(
        "bass",
        t + 3.5 + micro(0.006),
        root + (b.minor ? 3 : 4),
        45,
        0.27,
        b.level,
        { absolute: true, instrument: "soul-bass", naturalReleaseOnly: true },
      );
    previousBass = space ? root : answer;
    const grip = grips[b.index % grips.length];
    const voices = grip.filter((n) => n.note % 12 !== b.root);
    const first = b.index % genre.harmony.barsPerChord === 0;
    const active = mode === "active" && !quiet;
    // Leave the root to the bass. Common-tone seventh voicings are the call;
    // short upper-voice replies leave a clear gap instead of constant comping.
    if (first || active)
      for (const [j, n] of voices.entries()) {
        const duration = active
          ? first
            ? 3.15
            : 1.25
          : Math.min(6.85, (5.4 * tempo) / 60);
        add(
          "keys",
          t + micro(0.02 + j * 0.004),
          n.note,
          quiet ? 35 : 44 + (j === 1 ? 2 : 0),
          duration,
          b.level,
          { absolute: true, instrument: "soul-keys", noteReleaseSeconds: 0.16 },
        );
      }
    if (active && !first)
      for (const [j, n] of voices.slice(-2).entries())
        add(
          "keys",
          t + 2.5 + micro(0.02 + j * 0.004),
          n.note,
          47,
          0.65,
          b.level * 0.82,
          { absolute: true, instrument: "soul-keys", noteReleaseSeconds: 0.1 },
        );
    const guitarAnswer = active
      ? b.index % 4 === 1
      : !quiet && b.index % 8 === 3;
    if (guitarAnswer)
      guitarGrips[b.index % guitarGrips.length].slice(1).forEach((n, j) =>
        add(
          "guitar",
          t + (active ? 1.5 : 3.25) + micro(0.022 + j * 0.009),
          n.note,
          39 + j * 2,
          0.55,
          b.level * 0.9,
          {
            absolute: true,
            instrument: "soul-guitar",
            string: n.string,
            guitarReleaseSeconds: 0.045,
            naturalReleaseOnly: true,
          },
        ),
      );
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
    seed: 8407 + cycle,
    phrasing: "soul-mellow-conversation-v2",
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style, mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
