import type { BackingTake } from "./backing-plan-types";
/** A deterministic ensemble pocket follows the approved drummer; no extra notes. */
import type { BackingEvent } from "./backing-track-model";
import type { plannedBackingArrangement } from "./backing-musical-plan";
type Take = BackingTake;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : 0;
};
export function sharedBackingPocket(take: Take, tempo: number) {
  const spb = 60 / tempo,
    grid = take.plan.style === "blues" ? 3 : 2;
  const drums = take.events.filter((e) => e.part === "drums");
  // Recover placement around the existing subdivision grid, never quantize or
  // move the drummer. Exclude tom/fill strokes from the shared pulse estimate.
  const pulse = drums
    .filter(
      (e) =>
        [36, 37, 38, 42, 44, 51].includes(e.note) &&
        (![37, 38].includes(e.note) || e.velocity >= 45),
    )
    .map((e) => {
      const nominal = Math.round(e.beat * grid) / grid,
        residual = e.beat - nominal;
      return { event: e, nominal, residual };
    })
    .filter((p) => Math.abs(p.residual) * spb <= 0.065);
  const globalHands = pulse.filter((p) => [37, 38].includes(p.event.note));
  const center =
    0.7 * median(pulse.map((p) => p.residual)) +
    0.3 *
      median((globalHands.length ? globalHands : pulse).map((p) => p.residual));
  const phaseAt = (beat: number) => {
    const bar = Math.min(take.plan.bars.length - 1, Math.floor(beat / 4));
    const section = take.plan.bars[bar].section;
    const nearby = pulse.filter(
      (p) =>
        Math.abs(p.nominal - beat) <= 2 &&
        take.plan.bars[Math.floor(p.event.beat / 4)]?.section === section,
    );
    const hands = nearby.filter((p) => [37, 38].includes(p.event.note));
    // Local kick/hat placement plus the backbeat's laid-back/forward tendency.
    return (
      0.7 * median(nearby.map((p) => p.residual)) +
      0.3 * median((hands.length ? hands : nearby).map((p) => p.residual)) -
      center
    );
  };
  const shifts = new Map<BackingEvent, number>();
  for (const e of take.events.filter((e) => e.part === "bass")) {
    const nominal = Math.round(e.beat * grid) / grid;
    const kicks = drums.filter(
      (d) => d.note === 36 && Math.abs(d.beat - e.beat) * spb < 0.09,
    );
    const kick = kicks.sort(
      (a, b) => Math.abs(a.beat - e.beat) - Math.abs(b.beat - e.beat),
    )[0];
    const desired = kick
      ? kick.beat + 0.004 / spb
      : nominal + 0.8 * phaseAt(nominal) + 0.006 / spb;
    shifts.set(e, clamp((desired - e.beat) * spb, -0.018, 0.018) / spb);
  }
  const guitar = take.events.filter((e) => e.part === "guitar"),
    groups: BackingEvent[][] = [];
  for (const e of guitar) {
    const prev = groups.at(-1);
    if (prev && e.beat - prev[0].beat < 0.16) prev.push(e);
    else groups.push([e]);
  }
  for (const group of groups) {
    const first = group[0],
      nominal = Math.round(first.beat * grid) / grid;
    const desired = nominal + 0.8 * phaseAt(nominal) + 0.014 / spb;
    const shift = clamp((desired - first.beat) * spb, -0.024, 0.024) / spb;
    const bounded = clamp(
      shift,
      Math.floor(first.beat / 4) * 4 - first.beat,
      take.beats - 0.06 / spb - group.at(-1)!.beat,
    );
    for (const e of group) shifts.set(e, bounded);
  }
  const events = take.events
    .map((e) => {
      const shift = shifts.get(e);
      if (shift === undefined) return { ...e };
      const bar = Math.floor(e.beat / 4),
        start = bar * 4;
      // Keep harmonic arrivals inside their bar and the circular boundary fixed.
      const beat = clamp(e.beat + shift, start, take.beats - 0.06 / spb);
      return { ...e, beat };
    })
    .sort((a, b) => a.beat - b.beat);
  // Changed attack placement must not create overlapping physical string/bass
  // voices or extend a pitch through a foreign chord. Never lengthen a note.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.part !== "bass" && e.part !== "guitar") continue;
    const next = events
      .slice(i + 1)
      .find(
        (n) =>
          n.part === e.part && (e.part === "bass" || n.string === e.string),
      );
    let end = Math.min(
      e.beat + e.duration,
      take.beats - 0.03 / spb,
      next ? next.beat - 0.012 / spb : Infinity,
    );
    if (e.part === "guitar")
      for (let bar = Math.floor(e.beat / 4) + 1; bar * 4 < end; bar++) {
        const c = take.plan.bars[bar];
        if (
          ![
            c.root,
            (c.root + (c.minor ? 3 : 4)) % 12,
            (c.root + 7) % 12,
          ].includes(e.note % 12)
        ) {
          end = bar * 4 - 0.04 / spb;
          break;
        }
      }
    e.duration = Math.max(0.025, Math.min(e.duration, end - e.beat));
  }
  return { ...take, events, sharedPocket: "drummer-relative-v1" };
}
