/** Two distinct roots-guitar performances over the established recorded drummer. */
import {
  plannedBackingArrangement,
  voiceCycle,
  concertGrips,
} from "./backing-musical-plan";
import { scalePitchClasses, type BackingQuality } from "./backing-arrangement";
import type { BackingEvent, BackingMode } from "./backing-track-model";
const tuning = [40, 45, 50, 55, 59, 64];
/** Low/middle string triads with bounded fretting stretches and native recordings. */
export function rootsGrips(root: number, minor: boolean) {
  const pcs = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12],
    out: ReturnType<typeof concertGrips> = [];
  for (let start = 0; start < 4; start++) {
    const choices = [start, start + 1, start + 2].map((string) =>
      Array.from({ length: 13 }, (_, fret) => ({
        string,
        fret,
        note: tuning[string] + fret,
      })).filter(
        (n) => n.note >= 44 && n.note <= 72 && pcs.includes(n.note % 12),
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
        a.reduce((s, n) => s + n.note, 0) - b.reduce((s, n) => s + n.note, 0),
    )
    .slice(0, 24);
}
export function rootsArrangement(
  style: "rock" | "blues",
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = style === "rock" ? 100 : 90,
  tonic = 9,
) {
  const take = plannedBackingArrangement(
      style,
      mode,
      quality,
      cycle,
      tempo,
      tonic,
    ),
    micro = (s: number) => (s * tempo) / 60;
  const changes = style === "rock" ? 8 : 12,
    grips = voiceCycle(
      take.plan.bars.slice(0, changes).map((b) => rootsGrips(b.root, b.minor)),
    );
  const events: BackingEvent[] = take.events
    .filter(
      (e) => e.part === "drums" || e.part === "percussion" || e.part === "bass",
    )
    .map((e) =>
      e.part === "bass"
        ? {
            ...e,
            instrument: style === "rock" ? "rock-bass" : "blues-bass",
            duration: Math.min(e.duration, 1.2),
            naturalReleaseOnly: true,
          }
        : e,
    );
  const add = (e: BackingEvent) => events.push(e),
    pcs = scalePitchClasses(tonic, quality);
  for (const b of take.plan.bars) {
    const t = b.index * 4,
      quiet = b.texture === "crossstick",
      fill = b.fillStart !== undefined,
      grip = grips[b.index % grips.length];
    if (style === "rock") {
      const open = b.texture === "ride",
        positions = quiet ? [0, 2] : open ? [0, 2] : [0, 0.5, 2, 2.5];
      if (mode === "active" && !quiet && !fill && b.role === "guitar")
        positions.push(3.5);
      for (const [posIndex, pos] of positions.entries()) {
        const muted = !open || pos === 3.5,
          voices = muted
            ? grip.filter(
                (n) => n.note % 12 !== (b.root + (b.minor ? 3 : 4)) % 12,
              )
            : grip;
        (posIndex % 2 ? [...voices].reverse() : voices).forEach((n, j) =>
          add({
            part: "guitar",
            instrument: muted ? "rock-muted" : "rock-guitar",
            articulation: muted ? "muted" : "normal",
            absolute: true,
            beat: t + pos + micro(0.008 + j * (muted ? 0.006 : 0.014)),
            note: n.note,
            string: n.string,
            duration: muted ? (pos % 1 ? 0.18 : 0.26) : 1.65,
            guitarReleaseSeconds: muted ? 0.025 : 0.06,
            guitarAttackSeconds: 0.003,
            velocity: quiet ? 41 : open ? 53 : 47,
            level: b.level,
            naturalReleaseOnly: true,
          }),
        );
      }
      if (mode === "active" && !quiet && !fill && b.role === "bass") {
        const root = 28 + ((b.root - 28 + 36) % 12);
        add({
          part: "bass",
          instrument: "rock-bass",
          absolute: true,
          beat: t + 3.5 + micro(0.006),
          note: root + 7,
          duration: 0.24,
          velocity: 45,
          level: b.level,
          naturalReleaseOnly: true,
        });
      }
    } else {
      const answering =
        mode === "active" && !quiet && !fill && b.index % 4 === 2;
      const rootNote = grip.find((n) => n.note % 12 === b.root)!;
      const fifth = grip.find((n) => n.note % 12 === (b.root + 7) % 12)!;
      // Alternate fifth/sixth only when the sixth belongs to the selected scale.
      // Minor keys therefore never acquire an unwanted raised sixth.
      const sixth = [...Array(13)]
        .map((_, fret) => ({
          string: fifth.string,
          fret,
          note: tuning[fifth.string] + fret,
        }))
        .find(
          (n) =>
            n.note % 12 === (b.root + 9) % 12 &&
            n.note >= 44 &&
            n.note <= 76 &&
            pcs.includes(n.note % 12) &&
            Math.abs(n.fret - rootNote.fret) <= 4,
        );
      const positions = quiet
        ? [0, 2 / 3, 2, 2 + 2 / 3]
        : [0, 2 / 3, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3];
      for (const [i, pos] of positions.entries()) {
        if ((answering && pos >= 2) || (fill && pos >= (b.fillStart ?? 4)))
          continue;
        const short = pos % 1 > 0.3,
          partner = i % 4 >= 2 && sixth ? sixth : fifth;
        [rootNote, partner].forEach((n, j) =>
          add({
            part: "guitar",
            instrument: "blues-rhythm",
            articulation: "muted",
            absolute: true,
            beat: t + pos + micro(0.012 + j * 0.006),
            note: n.note,
            string: n.string,
            duration: short ? 0.13 : 0.42,
            guitarReleaseSeconds: 0.025,
            velocity: quiet ? 37 : short ? 40 : 48,
            level: b.level * (short ? 0.72 : 0.88),
            naturalReleaseOnly: true,
          }),
        );
      }
      if (answering) {
        const upper = [
          ...take.plan.grips[b.index % take.plan.grips.length],
        ].sort((a, b) => a.note - b.note);
        const line = b.motif === 1 ? upper : [...upper].reverse();
        line.forEach((n, j) =>
          add({
            part: "guitar",
            instrument: "blues-lead",
            absolute: true,
            articulation: "normal",
            beat: t + [2, 2 + 2 / 3, 3 + 2 / 3][j] + micro(0.016),
            note: n.note,
            string: n.string,
            duration: j === 0 ? 0.42 : 0.21,
            guitarReleaseSeconds: 0.065,
            guitarAttackSeconds: 0.005,
            velocity: 52 + j * 2,
            level: b.level,
            naturalReleaseOnly: true,
          }),
        );
      }
    }
  }
  take.events = events.sort((a, b) => a.beat - b.beat);
  take.plan.grips = grips;
  take.phrasing =
    style === "rock" ? "roots-rock-dynamics-v3" : "blues-shuffle-answers-v3";
  return take;
}
