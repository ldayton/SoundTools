/** Roots one-drop: interlocking bass hook, damped skank and low organ bubble. */
import { grooveFoundation } from "./backing-groove-arrangement";
import { BACKING_GENRES } from "./backing-genres";
import type { BackingMode, BackingEvent } from "./backing-track-model";
import type { BackingQuality } from "./backing-arrangement";

export function reggaeArrangement(
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 78,
  tonic = 9,
) {
  // Retain the established one-drop drummer and section dynamics. Funk keeps its
  // original engine and palette; these instrument performances are Reggae-only.
  const take = grooveFoundation("reggae", mode, quality, cycle, tempo, tonic);
  const events = take.events.filter(
    (e) => e.part === "drums" || e.part === "percussion",
  );
  const micro = (seconds: number) => (seconds * tempo) / 60;
  const add = (event: BackingEvent) => events.push(event);
  for (const bar of take.plan.bars) {
    const t = bar.index * 4,
      quiet = bar.texture === "crossstick";
    const third = bar.minor ? 3 : 4;
    const root = 28 + ((bar.root - 28 + 36) % 12);
    // A two-bar hook repeats enough to be memorable. Active adds one short chord
    // tone, rather than filling every gap or playing a generic walking bass.
    const odd = bar.index % 2 === 1;
    const hook = odd
      ? [
          { beat: 0.5, note: root, duration: 0.95 },
          { beat: 2.75, note: root + third, duration: 0.7 },
        ]
      : [
          { beat: 0, note: root, duration: 1.15 },
          { beat: 2.5, note: root + 7, duration: 0.7 },
        ];
    if (mode === "active" && !quiet)
      hook.splice(1, 0, {
        beat: odd ? 1.75 : 1.5,
        note: root + (odd ? 7 : third),
        duration: 0.38,
      });
    if (bar.section === "Breathe" && odd) hook.splice(1);
    hook.forEach((n, i) =>
      add({
        part: "bass",
        instrument: "reggae-bass",
        absolute: true,
        beat: t + n.beat + micro(0.007),
        note: n.note,
        duration: n.duration,
        velocity: i ? 52 : 59,
        level: bar.level,
        naturalReleaseOnly: true,
      }),
    );
    const grip = take.plan.grips[bar.index % take.plan.grips.length];
    for (const pos of BACKING_GENRES.reggae.roles.guitarBeats) {
      // Compact high-string triads, nearly simultaneous upstrokes, then a real
      // gap. Explicit instrument identity bypasses the legato guitar adapter.
      [...grip].reverse().forEach((n, i) =>
        add({
          part: "guitar",
          instrument: "reggae-guitar",
          articulation: "normal",
          absolute: true,
          beat: t + pos + micro(0.009 + i * 0.004),
          note: n.note,
          string: n.string,
          duration: BACKING_GENRES.reggae.activity[mode].guitarDurationBeats,
          velocity: quiet ? 41 : 48,
          level: bar.level,
          guitarReleaseSeconds: 0.018,
          naturalReleaseOnly: true,
        }),
      );
    }
    // The 8-foot registration keeps this quiet low pulse distinct from the
    // higher guitar. It supports the pocket instead of becoming a Gospel pad.
    for (const [i, pos] of BACKING_GENRES.reggae.roles.keysBeats.entries()) {
      if (bar.section === "Breathe" && i % 2) continue;
      const note = 48 + ((bar.root + (i % 2 ? third : 7)) % 12);
      add({
        part: "keys",
        instrument: "tonewheel-organ",
        absolute: true,
        beat: t + pos + micro(0.003),
        note,
        duration: mode === "active" ? 0.17 : 0.21,
        velocity: 48,
        level: bar.level * (quiet ? 0.46 : 0.6),
      });
    }
  }
  take.events = events.sort((a, b) => a.beat - b.beat);
  take.phrasing = "reggae-roots-bubble-v2";
  return take;
}
