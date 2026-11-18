/** Open harmony and coordinated phrasing, approved in the A/B listening test. */
import {
  backingChord,
  type BackingQuality,
  backingArrangement,
} from "./backing-arrangement";
import type {
  BackingEvent,
  LegacyBackingStyle as BackingStyle,
  BackingMode,
} from "./backing-track-model";
type Take = ReturnType<typeof backingArrangement>;
type Role = "foundation" | "bass" | "guitar" | "drums" | "space";
const plans: Role[][] = [
  ["foundation", "bass", "guitar", "drums"],
  ["foundation", "space", "bass", "drums"],
  ["foundation", "guitar", "space", "drums"],
];
export function applyBackingPhrasing(
  take: Take,
  style: BackingStyle,
  quality: BackingQuality,
  tempo: number,
  mode: BackingMode = "active",
) {
  const slow = tempo < 86,
    fast = tempo >= 112;
  let events: BackingEvent[] = take.events.map((e) => ({ ...e }));
  const bars = take.beats / 4;
  const roles = Array.from(
    { length: bars },
    (_, bar) => plans[Math.floor(bar / 4) % plans.length][bar % 4],
  );
  const fills = Array.from({ length: bars }, (_, bar) => {
    const hits = take.events.filter(
      (e) =>
        e.part === "drums" &&
        e.beat >= bar * 4 + 2 &&
        e.beat < (bar + 1) * 4 &&
        [38, 43, 45, 47].includes(e.note),
    );
    return hits.filter((e) => [43, 45, 47].includes(e.note)).length >= 2 ||
      hits.filter((e) => e.note === 38).length >= 4
      ? { bar, hits }
      : undefined;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4,
      role = roles[bar];
    const source = take.events.filter((e) => Math.floor(e.beat / 4) === bar);
    const quiet =
      source.some((e) => e.part === "drums" && e.note === 37) &&
      !source.some(
        (e) => e.part === "drums" && e.note === 38 && e.velocity > 55,
      );
    const filling = fills.some((f) => f.bar === bar);
    const chord = backingChord(style, quality, bar),
      root = (9 + chord.degree) % 12,
      third = (root + (chord.minor ? 3 : 4)) % 12,
      fifth = (root + 7) % 12;
    // Favor open dyads, with a complete triad retained as a recurring harmonic landmark.
    const omit =
      Math.floor(bar / 2) % 4 === 0
        ? -1
        : Math.floor(bar / 2) % 4 === 3
          ? fifth
          : third;
    events = events.filter((e) => {
      if (Math.floor(e.beat / 4) !== bar) return true;
      const pos = e.beat - t;
      if (e.part === "guitar") {
        if (e.articulation !== "muted" && e.note % 12 === omit) return false;
        if (e.articulation === "muted" && (slow || role !== "guitar"))
          return false;
        if (pos >= 2.25 && (role !== "guitar" || filling || quiet))
          return false;
      }
      if (
        e.part === "bass" &&
        pos >= 2.75 &&
        (role !== "bass" || filling || quiet)
      )
        return false;
      if (e.part === "bass" && role === "space" && pos >= 1) return false;
      if (
        e.part === "drums" &&
        slow &&
        [42, 51].includes(e.note) &&
        e.velocity < 43
      ) {
        // Preserve the shuffle's triplet pulse; omit only additional soft subdivisions.
        const grid = style === "blues" ? 3 : 2;
        if (Math.abs(pos * grid - Math.round(pos * grid)) > 0.12) return false;
      }
      return true;
    });
    for (const e of events.filter(
      (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
    )) {
      if (e.articulation !== "muted")
        e.duration = Math.min(
          slow ? e.duration * 1.35 : fast ? e.duration * 0.78 : e.duration,
          slow ? 1.75 : 1.2,
        );
    }
    if (mode === "active" && role === "bass" && !quiet && !filling) {
      const bass = events.filter(
        (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
      );
      if (!bass.some((e) => e.beat >= t + 3) && bass.length) {
        const next = backingChord(style, quality, (bar + 1) % bars);
        const candidates = [
          21 + next.degree,
          33 + next.degree,
          45 + next.degree,
        ].filter((n) => n >= 28 && n <= 55);
        const note = candidates.reduce((best, n) =>
          Math.abs(n - bass.at(-1)!.note) < Math.abs(best - bass.at(-1)!.note)
            ? n
            : best,
        );
        events.push({
          ...bass.at(-1)!,
          note,
          beat: t + (style === "blues" ? 3 + 2 / 3 : 3.5),
          duration: slow ? 0.33 : 0.19,
          velocity: 49,
          articulation: "muted",
        });
      }
    }
    if (mode === "active" && role === "guitar" && !quiet && !filling) {
      const voices = events.filter(
        (e) =>
          e.part === "guitar" &&
          e.articulation !== "muted" &&
          e.beat < t + 2 &&
          e.beat + e.duration > t + 0.5,
      );
      voices.sort((a, b) => a.beat - b.beat);
      const strings = new Map(voices.map((e) => [e.string, e]));
      const answer = [...strings.values()]
        .filter((e) => [root, fifth].includes(e.note % 12))
        .slice(-2)
        .reverse();
      if (
        answer.length &&
        !events.some(
          (e) => e.part === "guitar" && e.beat >= t + 2.25 && e.beat < t + 4,
        )
      )
        answer.forEach((e, j) =>
          events.push({
            ...e,
            beat: t + (style === "blues" ? 2 + 2 / 3 : 2.5) + j * 0.018,
            duration: slow ? 2.5 : 1.15,
            velocity: 34 + j,
            articulation: "normal",
          }),
        );
    }
    if (
      role === "drums" &&
      !quiet &&
      (filling || (mode === "active" && bar % 8 === 7)) &&
      fills.length
    ) {
      const candidate = fills[Math.floor(bar / 8) % fills.length];
      const fillStart = slow ? 3 : fast ? 3 : 2.5;
      const selected = candidate.hits.filter(
        (e) => e.beat - candidate.bar * 4 >= fillStart,
      );
      const thinned: BackingEvent[] = [];
      for (const e of selected) {
        if (
          !thinned.length ||
          e.beat - thinned.at(-1)!.beat >= (fast ? 0.23 : 0.19)
        )
          thinned.push(e);
      }
      if (thinned.length) {
        events = events.filter(
          (e) =>
            !(
              e.part === "drums" &&
              e.beat >= t + fillStart &&
              e.beat < t + 4 &&
              [37, 38, 42, 43, 45, 46, 47, 49, 51].includes(e.note)
            ),
        );
        const ref = source.find((e) => e.part === "drums")!;
        events.push(
          ...thinned.map((e) => ({
            ...e,
            beat: t + (e.beat - candidate.bar * 4),
            level: ref.level,
            velocity: Math.min(e.velocity, slow ? 70 : 82),
          })),
        );
      }
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  // Recompute physical note lengths after removing/replacing brushes. Sustain may
  // cross a chord boundary only while the ringing pitch belongs to that chord.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.part !== "guitar" && e.part !== "bass") continue;
    const bar = Math.floor(e.beat / 4);
    const next = events
      .slice(i + 1)
      .find(
        (n) =>
          n.part === e.part && (e.part === "bass" || n.string === e.string),
      );
    let end = Math.min(
      take.beats - 0.03,
      next ? next.beat - 0.045 : take.beats - 0.03,
    );
    if (e.part === "guitar" && e.articulation !== "muted") {
      end = Math.min(end, e.beat + (slow ? 9 : fast ? 6 : 7.7));
      for (let b = bar + 1; b < Math.ceil(end / 4); b++) {
        const c = backingChord(style, quality, b),
          r = (9 + c.degree) % 12;
        if (
          ![r, (r + (c.minor ? 3 : 4)) % 12, (r + 7) % 12].includes(e.note % 12)
        ) {
          end = Math.min(end, b * 4 - 0.06);
          break;
        }
      }
      e.duration = Math.max(0.05, end - e.beat);
    } else e.duration = Math.max(0.04, Math.min(e.duration, end - e.beat));
  }
  return {
    ...take,
    events,
    phrasing: "open-conversation-tempo-v1",
    tempo,
    roles,
  };
}

/** Production entry point: the approved phrasing always receives the live BPM. */
export function practiceBackingArrangement(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  tempo = 90,
) {
  return applyBackingPhrasing(
    backingArrangement(style, mode, quality, cycle),
    style,
    quality,
    tempo,
    mode,
  );
}
