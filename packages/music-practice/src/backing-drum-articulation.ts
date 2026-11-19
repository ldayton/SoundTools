import type { BackingTake } from "./backing-plan-types";
/** Experimental timbral interpretation of the approved performance. No new hits. */
import type { BackingEvent, BackingSample } from "./backing-track-model";
import type { plannedBackingArrangement } from "./backing-musical-plan";
export type DrumArticulation =
  "normal" | "hat-half" | "hat-loose" | "rimshot" | "offcenter";
export function articulateDrums(take: BackingTake) {
  const events = take.events.map((e) => {
    if (e.part !== "drums" || e.instrument === "brush-drums") return { ...e };
    const b = take.plan.bars[Math.floor(e.beat / 4)];
    if (!b) return { ...e };
    const pos = e.beat % 4,
      quiet = b.texture === "crossstick";
    let articulation: DrumArticulation = "normal";
    if (e.note === 42 && !quiet) {
      const phraseEnd = Math.floor(e.beat / 4) % 4 === 3;
      if (b.section_pos === b.section_bars - 1 && pos >= 3.4)
        articulation = "hat-loose";
      else if (
        (phraseEnd && pos >= 2.5) ||
        (Math.floor(e.beat / 4) % 2 === 1 && pos >= 3.4)
      )
        articulation = "hat-half";
    }
    if (e.note === 38) {
      if (e.velocity < 45) articulation = "offcenter";
      else if (
        b.texture === "ride" &&
        e.velocity >= 72 &&
        b.section_pos % 8 === 0 &&
        Math.abs(pos - 1) < 0.13
      )
        articulation = "rimshot";
    }
    return { ...e, articulation };
  });
  return { ...take, events, drumInterpretation: "recorded-articulations-v1" };
}
/** Independent shuffled bags, avoiding a repeated take at their boundaries. */
export function drumRoundRobin(index: number, size: number, seed = 0) {
  if (size < 2) return 0;
  const bag = Math.floor(index / size),
    pos = index % size;
  // A fixed permutation per instrument, rotated each bag; adjacent bags cannot
  // repeat their boundary take, unlike re-shuffling independently each time.
  const order = Array.from({ length: size }, (_, i) => i);
  let state = (seed + 7919) >>> 0;
  for (let i = size - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[(pos + bag * (size === 2 ? 0 : 1)) % size];
}
/** Neighbouring recorded snare layers give a second stroke when a map has no RR. */
export function snareAlternates(
  event: BackingEvent,
  pack: Record<string, BackingSample>,
) {
  return Object.entries(pack).filter(
    ([, s]) =>
      s.part === "drums" &&
      s.note === 38 &&
      !s.release &&
      (s.articulation ?? "normal") === (event.articulation ?? "normal") &&
      Math.abs(s.velocity - event.velocity) <= 7,
  );
}
