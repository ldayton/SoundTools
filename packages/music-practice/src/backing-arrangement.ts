import {
  backingPack,
  type BackingEvent,
  type BackingMode,
  type BackingStyle,
} from "./backing-track-model";
export type BackingQuality = "major" | "minor";
export const ARRANGEMENT_VERSION = "ensemble-v1";
const scale = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
type Chord = { degree: number; minor: boolean };
const majorRock: Chord[] = [
  { degree: 0, minor: false },
  { degree: 5, minor: false },
  { degree: 9, minor: true },
  { degree: 7, minor: false },
];
const minorRock: Chord[] = [
  { degree: 0, minor: true },
  { degree: 8, minor: false },
  { degree: 3, minor: false },
  { degree: 10, minor: false },
];
const majorBlues: Chord[] = [0, 5, 0, 0, 5, 5, 0, 2, 7, 5, 0, 7].map(
  (degree) => ({ degree, minor: degree === 2 }),
);
const minorBlues: Chord[] = [0, 5, 0, 0, 5, 5, 0, 8, 7, 5, 0, 7].map(
  (degree) => ({ degree, minor: degree !== 8 }),
);
export function scalePitchClasses(tonic: number, quality: BackingQuality) {
  return scale[quality].map((n) => (n + tonic + 12) % 12);
}
export function backingChord(
  style: BackingStyle,
  quality: BackingQuality,
  bar: number,
): Chord {
  return style === "rock"
    ? (quality === "major" ? majorRock : minorRock)[Math.floor((bar % 8) / 2)]
    : (quality === "major" ? majorBlues : minorBlues)[bar % 12];
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type StringNote = { note: number; string: number; fret: number };
const tuning = [40, 45, 50, 55, 59, 64];
/** Three different chord tones, on playable strings, without impossible stretches. */
export function guitarVoicings(chord: Chord): StringNote[][] {
  const pcs = [
    (9 + chord.degree) % 12,
    (9 + chord.degree + (chord.minor ? 3 : 4)) % 12,
    (9 + chord.degree + 7) % 12,
  ];
  const result: StringNote[][] = [];
  for (const strings of [
    [2, 3, 4],
    [3, 4, 5],
    [2, 4, 5],
  ]) {
    const candidates = strings.map((string) =>
      Array.from({ length: 13 }, (_, fret) => ({
        note: tuning[string] + fret,
        string,
        fret,
      })).filter(
        (x) => pcs.includes(x.note % 12) && x.note >= 50 && x.note <= 76,
      ),
    );
    for (const a of candidates[0])
      for (const b of candidates[1])
        for (const c of candidates[2]) {
          const notes = [a, b, c],
            fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
          if (
            new Set(notes.map((n) => n.note % 12)).size === 3 &&
            Math.max(...fretted) - Math.min(...fretted) <= 4
          )
            result.push(notes);
        }
  }
  return result;
}
function voicingCost(
  notes: StringNote[],
  previous: StringNote[],
  center: number,
) {
  return (
    notes.reduce((cost, n) => {
      const before = previous.find((p) => p.string === n.string);
      return (
        cost +
        (before ? Math.abs(n.note - before.note) : 5) +
        (before?.note === n.note ? -2 : 0)
      );
    }, 0) +
    Math.abs(notes.reduce((n, x) => n + x.note, 0) / notes.length - center) *
      0.7
  );
}
function nearest(values: number[], target: number) {
  return values.reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
}

/** A whole long-form take. Seeded phrase decisions preserve meter and the authored arc. */
export function backingArrangement(
  style: BackingStyle,
  mode: BackingMode,
  quality: BackingQuality,
  cycle = 0,
  seed = 20261118,
) {
  const template = backingPack.patterns[style][mode];
  const rng = random(
    seed +
      cycle * 7919 +
      (style === "rock" ? 73 : 0) +
      (quality === "minor" ? 113 : 0) +
      (mode === "active" ? 331 : 0),
  );
  const bars = template.beats / 4;
  let parts: BackingEvent[] = template.events
    .filter((e) => e.part === "drums" || e.part === "percussion")
    .map((e) => ({ ...e }));
  const hand = (note: number) =>
    [37, 38, 42, 43, 45, 46, 47, 49, 51].includes(note);
  const fillBars = Array.from({ length: bars }, (_, bar) => {
    const hits = parts.filter(
      (e) =>
        e.part === "drums" && e.beat >= bar * 4 + 2 && e.beat < (bar + 1) * 4,
    );
    const isFill =
      hits.filter((e) => [43, 45, 47].includes(e.note)).length >= 2 ||
      hits.filter((e) => e.note === 38).length >= 4;
    return isFill && !hits.some((e) => e.note === 37)
      ? { bar, hits: hits.filter((e) => [38, 43, 45, 47].includes(e.note)) }
      : undefined;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  let previousFill = -1;
  for (const destination of fillBars) {
    const choices = fillBars.filter((x) => x.bar !== previousFill);
    const chosen = choices[Math.floor(rng() * choices.length)];
    previousFill = chosen.bar;
    const strength =
      destination.hits.reduce((n, e) => n + e.velocity, 0) /
      destination.hits.length /
      (chosen.hits.reduce((n, e) => n + e.velocity, 0) / chosen.hits.length);
    parts = parts.filter(
      (e) =>
        !(
          e.part === "drums" &&
          e.beat >= destination.bar * 4 + 2 &&
          e.beat < (destination.bar + 1) * 4 &&
          hand(e.note)
        ),
    );
    for (const source of chosen.hits) {
      const beat = destination.bar * 4 + (source.beat - chosen.bar * 4);
      const reference = destination.hits.reduce((best, e) =>
        Math.abs(e.beat - beat) < Math.abs(best.beat - beat) ? e : best,
      );
      parts.push({
        ...source,
        beat,
        level: reference.level,
        velocity: Math.round(
          source.velocity * Math.max(0.85, Math.min(1.15, strength)),
        ),
      });
    }
  }
  const crashes = parts.filter((e) => e.part === "drums" && e.note === 49);
  parts = parts.filter(
    (e) =>
      !(
        e.part === "drums" &&
        [42, 46, 51].includes(e.note) &&
        crashes.some((c) => Math.abs(c.beat - e.beat) < 0.04)
      ),
  );
  // Slow, correlated intensity changes; never jitter the human drummer's timing.
  const phraseStrength = Array.from(
    { length: Math.ceil(bars / 4) },
    () => 0.97 + rng() * 0.06,
  );
  for (const e of parts)
    e.velocity = Math.max(
      1,
      Math.round(e.velocity * phraseStrength[Math.floor(e.beat / 16)]),
    );
  let previous: StringNote[] = [];
  let lastBass = 33;
  const ringing = new Map<number, BackingEvent>();
  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4,
      chord = backingChord(style, quality, bar),
      next = backingChord(style, quality, (bar + 1) % bars);
    const hits = parts.filter(
      (e) => e.part === "drums" && e.beat >= t && e.beat < t + 4,
    );
    const lifted = hits.some((e) => e.note === 51);
    const quiet =
      hits.some((e) => e.note === 37) &&
      !hits.some((e) => e.note === 38 && e.velocity > 55);
    const filling =
      hits.filter((e) => [38, 43, 45, 47].includes(e.note) && e.beat >= t + 2)
        .length >= 4;
    const level = (part: "bass" | "guitar", at: number) => {
      const source = template.events.filter(
        (e) => e.part === part && Math.floor(e.beat / 4) === bar,
      );
      if (source.length)
        return nearest(
          source.map((e) => e.level),
          source[0].level,
        );
      // Reconstruct the same macro envelope from the percussion/drum reference.
      const ref = hits.reduce(
        (best, e) =>
          Math.abs(e.beat - at) < Math.abs(best.beat - at) ? e : best,
        hits[0],
      );
      return (ref?.level ?? 0.6) ** (part === "bass" ? 0.8 : 0.85);
    };
    const root = 33 + chord.degree,
      third = chord.minor ? 3 : 4;
    const bassRoot = nearest(
      [root - 12, root, root + 12].filter((n) => n >= 28 && n <= 47),
      33 + (chord.degree > 7 ? chord.degree - 12 : chord.degree),
    );
    const rootHit =
      hits.find((e) => e.note === 36 && e.beat < t + 0.12)?.beat ?? t;
    const kick = hits.filter(
      (e) => e.note === 36 && e.beat >= t + 1.25 && e.beat < t + 2.7,
    );
    const secondAt =
      mode === "active" && kick.length
        ? nearest(
            kick.map((e) => e.beat),
            t + 2,
          )
        : t + 2;
    const tone =
      mode === "steady"
        ? [7, 12, third, 7][bar % 4]
        : [third, 7, 12][Math.floor(rng() * 3)];
    const pitch = nearest(
      [bassRoot + tone, bassRoot + tone - 12].filter((n) => n >= 28 && n <= 55),
      lastBass,
    );
    const bass: BackingEvent[] = [
      {
        part: "bass",
        beat: rootHit + 0.006,
        note: bassRoot,
        duration: quiet ? 1.55 : 1.1,
        velocity: quiet ? 62 : lifted ? 76 : 72,
        level: level("bass", t),
      },
      {
        part: "bass",
        beat: secondAt + 0.006,
        note: pitch,
        duration: filling ? 0.3 : quiet ? 1.2 : 0.8,
        velocity: quiet ? 52 : 60,
        level: level("bass", secondAt),
      },
    ];
    if (mode === "active" && !quiet && !filling) {
      const target = nearest(
        [33 + next.degree - 12, 33 + next.degree, 45 + next.degree].filter(
          (n) => n >= 28 && n <= 55,
        ),
        pitch,
      );
      bass.push({
        part: "bass",
        beat: t + (style === "blues" ? 3 + 2 / 3 : 3.5),
        note: target,
        duration: 0.22,
        velocity: 49,
        level: level("bass", t + 3),
        articulation: "muted",
      });
    }
    bass.sort((a, b) => a.beat - b.beat);
    bass.forEach((e, i) => {
      if (bass[i + 1])
        e.duration = Math.min(e.duration, bass[i + 1].beat - e.beat - 0.06);
      parts.push(e);
    });
    lastBass = bass.at(-1)!.note;
    const before = bar > 0 ? backingChord(style, quality, bar - 1) : undefined;
    const changed =
      !before || before.degree !== chord.degree || before.minor !== chord.minor;
    if (!changed && (quiet || bar % 2 !== 0)) continue;
    const choices = guitarVoicings(chord);
    const center = quiet ? 60 : mode === "active" ? 62 : 61;
    choices.sort(
      (a, b) =>
        voicingCost(a, previous, center) - voicingCost(b, previous, center),
    );
    // The best connection dominates; a small seeded choice makes successive phrases differ.
    const chosen =
      choices[
        mode === "active" && rng() < 0.18 ? Math.min(1, choices.length - 1) : 0
      ];
    const down = bar % 4 !== 2;
    const ordered = [...chosen].sort((a, b) =>
      down ? a.string - b.string : b.string - a.string,
    );
    const at = changed
      ? t + 0.035
      : nearest(
          hits
            .filter((e) => [37, 38].includes(e.note) && e.beat < t + 2)
            .map((e) => e.beat)
            .concat(t + 1),
          t + 1,
        ) + 0.018;
    const nextChange =
      Array.from({ length: bars - bar - 1 }, (_, i) => bar + i + 1).find(
        (b) => {
          const c = backingChord(style, quality, b);
          return c.degree !== chord.degree || c.minor !== chord.minor;
        },
      ) ?? bars;
    const until = Math.min(
      t + 7.7,
      nextChange * 4 - 0.08,
      template.beats - 0.05,
    );
    const brush =
      mode === "active" && !quiet && !filling && bar % 4 === 0 && rng() < 0.65;
    // Damp strings absent from the new grip; retain common ringing tones in quiet passages.
    for (const [string, event] of ringing) {
      const same = chosen.find(
        (n) => n.string === string && n.note === event.note,
      );
      if (!same || !quiet)
        event.duration = Math.min(
          event.duration,
          Math.max(0.05, at - event.beat - 0.02),
        );
    }
    ordered.forEach((n, j) => {
      const held = ringing.get(n.string);
      if (quiet && held?.note === n.note) {
        held.duration = until - held.beat;
        return;
      }
      const beat = at + j * (down ? 0.025 : 0.017),
        end = brush ? Math.min(until, t + 2.7) : until;
      const e: BackingEvent = {
        part: "guitar",
        beat,
        note: n.note,
        string: n.string,
        duration: Math.max(0.1, end - beat),
        velocity: (quiet ? 37 : lifted ? 48 : 42) + (down ? j : 2 - j),
        level: level("guitar", beat),
        articulation: "normal",
      };
      parts.push(e);
      ringing.set(n.string, e);
    });
    if (brush) {
      const notes = ordered.slice(1).reverse();
      notes.forEach((n, j) => {
        const prior = ringing.get(n.string);
        if (prior)
          prior.duration = Math.min(prior.duration, t + 2.74 - prior.beat);
        const e: BackingEvent = {
          part: "guitar",
          beat: t + 2.75 + j * 0.018,
          note: n.note,
          string: n.string,
          duration: Math.max(0.1, until - (t + 2.75 + j * 0.018)),
          velocity: 32 + j,
          level: level("guitar", t + 2.75),
          articulation: "normal",
        };
        parts.push(e);
        ringing.set(n.string, e);
      });
    }
    // A quiet, short percussive brush leaves the harmonic foreground to the player.
    if (
      mode === "active" &&
      !quiet &&
      !filling &&
      bar % 4 === 2 &&
      rng() < 0.45
    ) {
      const n = ordered[1];
      parts.push({
        part: "guitar",
        beat: t + 3.45,
        note: n.note,
        string: n.string,
        duration: 0.13,
        velocity: 29,
        level: level("guitar", t + 3.45) * 0.7,
        articulation: "muted",
      });
      const prior = ringing.get(n.string);
      if (prior)
        prior.duration = Math.min(prior.duration, t + 3.42 - prior.beat);
      ringing.delete(n.string);
    }
    previous = chosen;
  }
  for (const e of parts)
    if (e.part === "bass" || e.part === "guitar")
      e.duration = Math.max(
        0.04,
        Math.min(e.duration, template.beats - e.beat - 0.025),
      );
  return {
    ...template,
    events: parts.sort((a, b) => a.beat - b.beat),
    quality,
    cycle,
    seed,
  };
}
