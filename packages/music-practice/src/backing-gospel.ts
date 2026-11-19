/** Organ-led traditional gospel: rolling pulse, church cadences, room to answer. */
import { BACKING_GENRES, genreChord } from "./backing-genres";
import { scalePitchClasses, type BackingQuality } from "./backing-arrangement";
import { voiceCycle } from "./backing-musical-plan";
import type { BackingTake } from "./backing-plan-types";
import type { BackingEvent, BackingMode } from "./backing-track-model";
import type { OrganScene } from "./backing-organ";

export function gospelChordPitches(
  quality: BackingQuality,
  tonic: number,
  bar: number,
) {
  const c = genreChord("gospel", quality, bar),
    root = (tonic + c.degree) % 12;
  return [
    root,
    (root + (c.minor ? 3 : 4)) % 12,
    (root + (c.fifth ?? 7)) % 12,
    (root + (c.seventh ?? c.addedTone ?? 9)) % 12,
  ];
}

/** Shared by live and offline scheduling; any drum hit can move a held organ. */
export function gospelOrganScene(
  take: { plan: { mode: BackingMode; bars: BackingTake["plan"]["bars"] } },
  beat: number,
): OrganScene {
  const bars = take.plan.bars,
    b = bars[Math.min(bars.length - 1, Math.floor(beat / 4))];
  const intensity = Math.max(0, Math.min(1, (b.db + 7) / 7));
  const active = take.plan.mode === "active",
    swell = Math.sin((Math.PI * (beat % 8)) / 8) ** 2;
  return {
    registration: 0.18 + intensity * (active ? 0.62 : 0.28),
    expression: 0.55 + intensity * 0.25 + swell * (active ? 0.1 : 0.04),
    rotary: active && intensity > 0.82 ? "fast" : "slow",
  };
}

export function gospelArrangement(
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 76,
  tonic = 0,
): BackingTake {
  const genre = BACKING_GENRES.gospel,
    bars: BackingTake["plan"]["bars"] = [];
  for (const section of genre.form.sections)
    for (let pos = 0; pos < section.bars; pos++) {
      const index = bars.length,
        c = genreChord("gospel", quality, index);
      const bridge = Math.max(0, (index - (genre.form.bars - 8)) / 7);
      let db =
        section.db[0] +
        ((section.db[1] - section.db[0]) * pos) / Math.max(1, section.bars - 1);
      db = db * (1 - bridge) + genre.form.sections[0].db[0] * bridge;
      db +=
        Math.sin((Math.PI * index) / (genre.form.bars - 1)) *
        ((cycle % 3) - 1) *
        0.25;
      bars.push({
        index,
        section: section.name,
        texture: section.texture,
        db,
        section_pos: pos,
        section_bars: section.bars,
        root: (tonic + c.degree) % 12,
        minor: c.minor,
        role: index % 4 === 3 ? "keys" : "foundation",
        motif: (Math.floor(index / 8) + cycle) % 3,
        fillStart:
          (index + 1) % genre.activity[mode].fillsEveryBars === 0 &&
          section.texture !== "crossstick"
            ? 3
            : undefined,
        level: 10 ** (db / 20),
      });
    }
  const choices = bars.slice(0, genre.harmony[quality].length).map((b) => {
    const pcs = gospelChordPitches(quality, tonic, b.index);
    const notes = Array.from({ length: 20 }, (_, i) => i + 60).filter((n) =>
      pcs.includes(n % 12),
    );
    return notes
      .slice(0, -3)
      .map((_, i) =>
        notes
          .slice(i, i + 4)
          .map((note, string) => ({ note, string, fret: 0 })),
      );
  });
  const grips = voiceCycle(choices),
    events: BackingEvent[] = [],
    micro = (s: number) => (s * tempo) / 60;
  const pcs = scalePitchClasses(tonic, quality),
    organRinging = new Map<number, BackingEvent>();
  let previousBass = 36;
  for (const b of bars) {
    const t = b.index * 4,
      quiet = b.texture === "crossstick",
      fill = b.fillStart !== undefined;
    const drum = (note: number, beat: number, velocity: number) =>
      events.push({
        part: "drums",
        note,
        beat: t + beat + micro(0.004),
        velocity,
        duration: 0.15,
        level: b.level,
      });
    drum(36, 0, quiet ? 46 : 63);
    drum(36, 2, quiet ? 40 : 57);
    if (mode === "active" && !quiet && b.index % 4 === 1)
      drum(36, 2 + 2 / 3, 42);
    drum(quiet ? 37 : 38, 1 + micro(0.009), quiet ? 40 : 64);
    drum(quiet ? 37 : 38, 3 + micro(0.009), quiet ? 42 : 67);
    // Swung eighths on the first and third triplet of each quarter.
    for (let beat = 0; beat < 4; beat++) {
      drum(42, beat, quiet ? 25 : 37);
      if (!quiet && !(fill && beat === 3)) drum(42, beat + 2 / 3, 24);
    }
    if (fill) {
      drum(38, 3 + 1 / 3, 36);
      drum(mode === "active" ? 45 : 38, 3 + 2 / 3, 41);
    }
    if (mode === "active" && b.texture === "ride")
      for (const pos of [1, 3])
        events.push({
          part: "percussion",
          note: 54,
          beat: t + pos + micro(0.015),
          velocity: 30,
          duration: 0.12,
          level: b.level * 0.7,
        });
    const harmony = genreChord("gospel", quality, b.index);
    const bassClass = (b.root + (harmony.bass ?? 0)) % 12;
    const roots = Array.from({ length: 20 }, (_, i) => i + 28).filter(
      (n) => n % 12 === bassClass,
    );
    const low = roots.reduce((a, n) =>
      Math.abs(n - previousBass) < Math.abs(a - previousBass) ? n : a,
    );
    const fifthClass = (b.root + (harmony.fifth ?? 7)) % 12;
    const alternatives = Array.from({ length: 28 }, (_, i) => i + 28).filter(
      (n) => n % 12 === fifthClass,
    );
    const fifth = alternatives.reduce((a, n) =>
      Math.abs(n - low) < Math.abs(a - low) ? n : a,
    );
    const bass = (note: number, pos: number, duration: number) =>
      events.push({
        part: "bass",
        note,
        beat: t + pos + micro(0.008),
        velocity: quiet ? 39 : 53,
        duration,
        level: b.level,
        absolute: true,
      });
    bass(low, 0, 1.65);
    bass(fifth, 2, 1.1);
    previousBass = fifth;
    if (mode === "active" && !quiet && b.index % 4 === 3) {
      const next = genreChord("gospel", quality, (b.index + 1) % bars.length);
      const targetClass = (tonic + next.degree + (next.bass ?? 0)) % 12;
      const target = Array.from({ length: 28 }, (_, i) => i + 28)
        .filter((n) => n % 12 === targetClass)
        .reduce((a, n) => (Math.abs(n - fifth) < Math.abs(a - fifth) ? n : a));
      const direction = target > fifth ? 1 : -1;
      const passing = Array.from(
        { length: 4 },
        (_, i) => target - direction * (i + 1),
      ).find((n) => n >= 28 && n <= 55 && pcs.includes(n % 12));
      if (passing !== undefined) bass(passing, 3 + 1 / 3, 0.5);
    }
    const grip = grips[b.index % grips.length];
    for (const n of grip) {
      const previous = organRinging.get(n.note);
      if (
        previous &&
        Math.abs(previous.beat + previous.duration - (t + micro(0.015))) < 0.12
      ) {
        previous.duration = t + 3.94 - previous.beat;
      } else {
        const e: BackingEvent = {
          part: "keys",
          instrument: "tonewheel-organ",
          note: n.note,
          beat: t + micro(0.015),
          velocity: 64,
          duration: 3.94 - micro(0.015),
          level: 1,
          absolute: true,
          naturalReleaseOnly: true,
        };
        events.push(e);
        organRinging.set(n.note, e);
      }
    }
    // Piano punctuates; the organ carries the long line. Answers occur at the
    // end of a four-bar phrase, leaving the earlier bars open for the learner.
    const piano = (
      note: number,
      pos: number,
      duration: number,
      velocity: number,
    ) =>
      events.push({
        part: "keys",
        instrument: "acoustic-piano",
        note,
        beat: t + pos + micro(0.021),
        duration,
        velocity,
        level: b.level,
        absolute: true,
        noteReleaseSeconds: 0.1,
      });
    const pianoVoices = grip.slice(1).map((n) => n.note - 12);
    if (mode === "active" && !quiet && b.index % 8 === 7) {
      // A quiet upper-manual answer stays above the held chord, preserving its
      // common tones instead of reattacking/choking the sustained accompaniment.
      [...grip]
        .reverse()
        .slice(0, 2)
        .forEach((n, i) =>
          events.push({
            part: "keys",
            instrument: "tonewheel-organ",
            note: n.note + 12,
            beat: t + 3 + i / 3 + micro(0.018),
            duration: 0.22,
            velocity: 64,
            level: b.level * 0.35,
            absolute: true,
            naturalReleaseOnly: true,
          }),
        );
    }
    for (const n of pianoVoices) piano(n, 0, 1.35, quiet ? 34 : 45);
    if (mode === "active" && !quiet) {
      for (const n of pianoVoices.slice(0, 2)) piano(n, 2 + 2 / 3, 0.75, 38);
      if (b.index % 4 === 3) {
        const answer = grip.slice(-2).map((n) => n.note);
        answer.forEach((n, i) => piano(n, 3 + i / 3, 0.25, 39));
      }
    }
  }
  const beats = bars.length * 4;
  events.sort((a, b) => a.beat - b.beat);
  for (const e of events)
    e.duration = Math.max(0.03, Math.min(e.duration, beats - e.beat - 0.05));
  return {
    nativeTempo: genre.tempo.preferred,
    sourceKey: 9,
    beats,
    events,
    quality,
    cycle,
    seed: 7609 + cycle,
    phrasing: "traditional-gospel-v1",
    tempo,
    roles: bars.map((b) => b.role),
    plan: { style: "gospel", mode, quality, tonic, tempo, cycle, bars, grips },
  };
}
