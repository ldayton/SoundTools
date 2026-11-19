/** Pocket Funk: clipped accents, muted sixteenths and a repeating bass hook. */
import { grooveFoundation } from "./backing-groove-arrangement";
import type { BackingQuality } from "./backing-arrangement";
import type { BackingEvent, BackingMode } from "./backing-track-model";

export function funkArrangement(
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 104,
  tonic = 9,
) {
  const take = grooveFoundation("funk", mode, quality, cycle, tempo, tonic);
  const events = take.events.filter(
    (e) => e.part === "drums" || e.part === "percussion",
  );
  const micro = (seconds: number) => (seconds * tempo) / 60;
  const add = (event: BackingEvent) => events.push(event);
  for (const bar of take.plan.bars) {
    const t = bar.index * 4,
      quiet = bar.texture === "crossstick",
      active = mode === "active" && !quiet;
    const root = 28 + ((bar.root - 28 + 36) % 12),
      third = bar.minor ? 3 : 4;
    const odd = (bar.index + bar.motif) % 2 === 1;
    const bass = [
      {
        beat: 0,
        note: root,
        duration: quiet ? 0.65 : 0.55,
        articulation: "normal" as const,
      },
      {
        beat: 2.5,
        note: root + (odd ? third : 7),
        duration: 0.36,
        articulation: "normal" as const,
      },
    ];
    const line: {
      beat: number;
      note: number;
      duration: number;
      articulation: "normal" | "muted" | "ghost";
    }[] = [...bass];
    if (!quiet)
      line.splice(1, 0, {
        beat: 0.75,
        note: root,
        duration: active ? 0.09 : 0.22,
        articulation: active ? "ghost" : "muted",
      });
    if (active)
      line.push({
        beat: 3.25,
        note: root + (odd ? 7 : third),
        duration: 0.22,
        articulation: "muted",
      });
    for (const n of line)
      add({
        part: "bass",
        instrument: "funk-bass",
        absolute: true,
        beat: t + n.beat + micro(0.006),
        note: n.note,
        duration: n.duration,
        articulation: n.articulation,
        velocity: n.articulation === "ghost" ? 27 : n.beat ? 49 : 61,
        level: bar.level,
        naturalReleaseOnly: true,
      });
    const grip = take.plan.grips[bar.index % take.plan.grips.length];
    const accents = quiet
      ? [0.5, 2.5]
      : active
        ? [0.5, 1.75, 2.5, 3.75]
        : [0.5, 1.75, 2.5];
    for (const [stroke, pos] of accents.entries()) {
      if (bar.fillStart !== undefined && pos >= bar.fillStart) continue;
      const voices = stroke % 2 ? grip.slice(1) : grip;
      (stroke % 2 ? [...voices].reverse() : voices).forEach((n, i) =>
        add({
          part: "guitar",
          instrument: "funk-guitar",
          absolute: true,
          articulation: "normal",
          beat: t + pos + micro(0.008 + i * 0.003),
          note: n.note,
          string: n.string,
          duration: quiet ? 0.18 : 0.14,
          guitarReleaseSeconds: 0.018,
          velocity: quiet ? 42 : stroke % 2 ? 45 : 52,
          level: bar.level,
          naturalReleaseOnly: true,
        }),
      );
    }
    const scratches = quiet
      ? [1.25, 3.25]
      : active
        ? [0.25, 0.75, 1.25, 2.25, 3.25]
        : [0.25, 1.25, 3.25];
    for (const [i, pos] of scratches.entries()) {
      if (bar.fillStart !== undefined && pos >= bar.fillStart) continue;
      const n = grip[(i + bar.motif) % grip.length];
      add({
        part: "guitar",
        instrument: "funk-scratch",
        absolute: true,
        articulation: "muted",
        beat: t + pos + micro(0.008),
        note: n.note,
        string: n.string,
        duration: 0.055,
        guitarReleaseSeconds: 0.008,
        velocity: 30,
        level: bar.level * (quiet ? 0.25 : 0.4),
        naturalReleaseOnly: true,
      });
    }
    if (active && bar.index % 2 === 1 && bar.fillStart === undefined)
      add({
        part: "drums",
        beat: t + 0.75 + micro(0.012),
        note: 38,
        duration: 0.1,
        velocity: 22,
        level: bar.level,
      });
  }
  take.events = events.sort((a, b) => a.beat - b.beat);
  take.phrasing = "funk-pocket-sixteenths-v2";
  return take;
}
