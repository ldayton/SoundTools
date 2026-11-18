import sustainSeconds from "./backing-guitar-sustain.json";
/** Guitar-only transition experiment; all other ensemble events are preserved. */
import type { BackingEvent } from "./backing-track-model";
import type { plannedBackingArrangement } from "./backing-musical-plan";
type Take = ReturnType<typeof plannedBackingArrangement>;
export function connectBackingGuitar(take: Take, tempo: number) {
  const secondsToBeats = tempo / 60;
  const guitar = take.events
    .filter((e) => e.part === "guitar")
    .map((e) => ({ ...e }));
  const groups: BackingEvent[][] = [];
  for (const e of guitar) {
    const group = groups.at(-1);
    if (group && e.beat - group[0].beat < 0.16) group.push(e);
    else groups.push([e]);
  }
  const ringing = new Map<number, BackingEvent>(),
    kept: BackingEvent[] = [];
  let carried = 0;
  for (const [index, group] of groups.entries()) {
    const start = group[0].beat,
      bar = Math.floor(start / 4),
      phrase = Math.floor(bar / 8);
    const upstroke = index % 3 === 2;
    const ordered = [...group].sort((a, b) =>
      upstroke
        ? (b.string ?? 0) - (a.string ?? 0)
        : (a.string ?? 0) - (b.string ?? 0),
    );
    // A single hand gesture has correlated timing and strength across strings.
    const spacing = upstroke
      ? [0, 0.015, 0.035]
      : phrase % 2
        ? [0, 0.021, 0.052]
        : [0, 0.028, 0.061];
    const boundaries = take.plan.bars;
    for (const [j, e] of ordered.entries()) {
      const oldEnd = e.beat + e.duration;
      e.beat = start + spacing[j] * secondsToBeats;
      e.duration = Math.max(0.04, oldEnd - e.beat);
      e.guitarReleaseSeconds = 0.025 + (upstroke ? 0.012 : 0);
      e.guitarReleaseScale = 0.65;
      e.guitarAttackSeconds = 0.0035;
      e.velocity = Math.max(1, e.velocity + (j === 0 ? 1 : -1));
      const string = e.string ?? -1,
        previous = ringing.get(string);
      const elapsed = previous
        ? (e.beat - previous.beat) / secondsToBeats
        : Infinity;
      // Carry only a note still ringing on the same physical string. Bound elapsed
      // sustain; do not stretch or loop a sample to manufacture an infinite note.
      if (
        previous &&
        previous.note === e.note &&
        previous.beat + previous.duration >= start - 0.12 &&
        elapsed <
          (sustainSeconds[
            String(previous.note) as keyof typeof sustainSeconds
          ] ?? 1.2) -
            0.1 &&
        (oldEnd - previous.beat) / secondsToBeats < 6 &&
        j !== ordered.length - 1
      ) {
        previous.duration = Math.max(previous.duration, oldEnd - previous.beat);
        carried++;
        continue;
      }
      if (previous) {
        const different = previous.note !== e.note;
        const gapSeconds = different ? 0.035 + (string % 3) * 0.009 : 0.008;
        previous.duration = Math.max(
          0.04,
          Math.min(
            previous.duration,
            e.beat - gapSeconds * secondsToBeats - previous.beat,
          ),
        );
        previous.guitarReleaseSeconds = different ? 0.025 : 0.035;
      }
      // Stop foreign tones before a change even if a later brush omits this string.
      for (
        let b = bar + 1;
        b < boundaries.length && b * 4 < e.beat + e.duration;
        b++
      ) {
        const chord = boundaries[b],
          pcs = [
            chord.root,
            (chord.root + (chord.minor ? 3 : 4)) % 12,
            (chord.root + 7) % 12,
          ];
        if (!pcs.includes(e.note % 12)) {
          e.duration = Math.min(
            e.duration,
            b * 4 - 0.04 * secondsToBeats - e.beat,
          );
          break;
        }
      }
      e.duration = Math.max(
        0.04,
        Math.min(e.duration, take.beats - 0.04 * secondsToBeats - e.beat),
      );
      kept.push(e);
      ringing.set(string, e);
    }
  }
  const events = [
    ...take.events.filter((e) => e.part !== "guitar"),
    ...kept,
  ].sort((a, b) => a.beat - b.beat);
  return {
    ...take,
    events,
    guitarTransitions: "connected-strings-v1",
    carriedGuitarNotes: carried,
  };
}
