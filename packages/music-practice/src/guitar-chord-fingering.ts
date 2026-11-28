export type GuitarFrets = readonly (number | null)[];
export type Barre = {
  finger: number;
  fret: number;
  fromString: number;
  toString: number;
};
export type GuitarFingering = {
  fingers: (number | null)[];
  barres: Barre[];
  fingerCount: number;
  effort: number;
};
export type FingeringLimits = {
  maxFingers: number;
  allowBarres: boolean;
  /** Null strings explicitly absent from playback, numbered 1=high E.
   * Other null strings retain the conservative muted-string policy. */
  unplayedStrings?: readonly number[];
};
const reaches = [
  [0, 3, 4, 5],
  [3, 0, 2, 3],
  [4, 2, 0, 2],
  [5, 3, 2, 0],
];
function validLimits(limits: FingeringLimits) {
  return (
    Number.isInteger(limits.maxFingers) &&
    limits.maxFingers >= 0 &&
    limits.maxFingers <= 4 &&
    typeof limits.allowBarres === "boolean" &&
    (limits.unplayedStrings === undefined ||
      (Array.isArray(limits.unplayedStrings) &&
        limits.unplayedStrings.every(
          (s) => Number.isInteger(s) && s >= 1 && s <= 6,
        )))
  );
}

function canBarreCross(
  frets: GuitarFrets,
  index: number,
  fret: number,
  limits: FingeringLimits,
) {
  return frets[index] === null
    ? !!limits.unplayedStrings?.includes(6 - index)
    : frets[index]! >= fret;
}

/** Conservative four-finger model. No thumb wrapping, bent barres or finger rolls. */
export function assessGuitarFingering(
  frets: GuitarFrets,
  fingers: readonly (number | null)[],
  limits: FingeringLimits,
): GuitarFingering | null {
  if (!validLimits(limits) || frets.length !== 6 || fingers.length !== 6)
    return null;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < 6; i++) {
    const fret = frets[i],
      finger = fingers[i];
    if (fret === null) {
      if (finger !== null) return null;
      continue;
    }
    if (!Number.isInteger(fret) || fret < 0 || fret > 24) return null;
    if (fret === 0) {
      if (finger !== 0) return null;
      continue;
    }
    if (
      finger === null ||
      !Number.isInteger(finger) ||
      finger < 1 ||
      finger > 4
    )
      return null;
    groups.set(finger, [...(groups.get(finger) ?? []), i]);
  }
  if (groups.size > limits.maxFingers) return null;
  const barres: Barre[] = [];
  const entries = [...groups].sort(([a], [b]) => a - b);
  for (const [finger, strings] of entries) {
    const fret = frets[strings[0]]!;
    if (strings.some((i) => frets[i] !== fret)) return null;
    if (strings.length > 1) {
      if (!limits.allowBarres) return null;
      const from = strings[0],
        to = strings.at(-1)!;
      for (let i = from; i <= to; i++)
        if (!canBarreCross(frets, i, fret, limits)) return null;
      barres.push({ finger, fret, fromString: 6 - from, toString: 6 - to });
    }
  }
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [a, ai] = entries[i],
        [b, bi] = entries[j],
        delta = frets[bi[0]]! - frets[ai[0]]!;
      if (delta < 0 || delta > reaches[a - 1][b - 1]) return null;
    }
  const effort =
    groups.size * 5 +
    barres.reduce((sum, b) => sum + (b.fromString - b.toString) * 4 + 4, 0);
  return { fingers: [...fingers], barres, fingerCount: groups.size, effort };
}

/** Cover fretted contacts with single fingers or legal barres, then assign fingers.
 * A repeated fret is not automatically a barre: open/lower/muted strings block it.
 * Explicitly unplayed null strings may be crossed without adding a sounding note.
 */
export function findGuitarFingering(
  frets: GuitarFrets,
  limits: FingeringLimits,
  preferred?: readonly (number | null)[],
): GuitarFingering | null {
  if (!validLimits(limits)) return null;
  if (preferred) {
    const familiar = assessGuitarFingering(frets, preferred, limits);
    if (familiar) return familiar;
  }
  if (
    frets.length !== 6 ||
    frets.some((f) => f !== null && (!Number.isInteger(f) || f < 0 || f > 24))
  )
    return null;
  const targets = frets.reduce<number>(
    (mask, f, i) => (f !== null && f > 0 ? mask | (1 << i) : mask),
    0,
  );
  type Contact = { fret: number; mask: number; start: number };
  const contacts: Contact[] = [];
  for (let i = 0; i < 6; i++) {
    const fret = frets[i];
    if (fret === null || fret === 0) continue;
    contacts.push({ fret, mask: 1 << i, start: i });
    if (!limits.allowBarres) continue;
    let mask = 1 << i;
    for (let j = i + 1; j < 6; j++) {
      if (!canBarreCross(frets, j, fret, limits)) break;
      if (frets[j] === fret) {
        mask |= 1 << j;
        contacts.push({ fret, mask, start: i });
      }
    }
  }
  let best: GuitarFingering | null = null;
  function assign(plan: Contact[]) {
    const ordered = [...plan].sort(
      (a, b) => a.fret - b.fret || a.start - b.start,
    );
    function visit(index: number, last: number, fingers: (number | null)[]) {
      if (index === ordered.length) {
        const candidate = assessGuitarFingering(frets, fingers, limits);
        if (candidate && (!best || candidate.effort < best.effort))
          best = candidate;
        return;
      }
      for (
        let finger = last + 1;
        finger <= 4 - (ordered.length - index - 1);
        finger++
      ) {
        const next = [...fingers];
        for (let i = 0; i < 6; i++)
          if (ordered[index].mask & (1 << i)) next[i] = finger;
        visit(index + 1, finger, next);
      }
    }
    visit(
      0,
      0,
      frets.map((f) => (f === null ? null : 0)),
    );
  }
  function cover(mask: number, plan: Contact[]) {
    if (mask === targets) {
      assign(plan);
      return;
    }
    if (plan.length >= limits.maxFingers) return;
    let first = 0;
    while (!(targets & ~mask & (1 << first))) first++;
    for (const c of contacts)
      if (c.mask & (1 << first) && !(c.mask & mask))
        cover(mask | c.mask, [...plan, c]);
  }
  cover(0, []);
  return best;
}
