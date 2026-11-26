import { notePitchAt, type Exercise, type NoteEvent } from './music';

export type RibbonPoint = { beat: number; midi: number; segment: number };
export type RibbonGuide = { start: number; end: number; pitches: number[] };
export function ribbonGuides(exercise: Exercise, round: number): RibbonGuide[] {
  const range = exercise.rounds[round];
  if (!range) return [];
  const guides = exercise.guideNotes || exercise.notes;
  return guides
    .filter((n) => n.onsetBeat >= range.onsetBeat && n.onsetBeat < range.endBeat)
    .map((n) => ({
      start: n.onsetBeat,
      end: n.onsetBeat + n.slotBeats,
      pitches: Array.from({ length: n.glideSpan ? 41 : 2 }, (_, i) =>
        notePitchAt(n, n.onsetBeat + (n.slotBeats * i) / (n.glideSpan ? 40 : 1))
      ),
    }));
}

/** No target attraction or octave correction: uncertainty creates a real gap. */
export class RibbonTracker {
  points: RibbonPoint[] = [];
  private last: { time: number; midi: number } | null = null;
  private pending: { time: number; midi: number } | null = null;
  private segment = 0;
  reset() {
    this.points = [];
    this.gap();
  }
  gap() {
    this.last = this.pending = null;
    this.segment++;
  }
  push(time: number, beat: number, hz: number, strength: number) {
    if (
      ![time, beat, hz, strength].every(Number.isFinite) ||
      hz < 50 ||
      hz > 1200 ||
      strength < 0.75
    ) {
      this.gap();
      return;
    }
    const midi = 69 + 12 * Math.log2(hz / 440);
    if (
      this.last &&
      (time <= this.last.time ||
        time - this.last.time > 0.08 ||
        Math.abs(midi - this.last.midi) > 3)
    )
      this.gap();
    if (!this.last) {
      if (
        !this.pending ||
        time <= this.pending.time ||
        time - this.pending.time > 0.15 ||
        Math.abs(midi - this.pending.midi) > 0.7
      ) {
        this.pending = { time, midi };
        return;
      }
      if (time - this.pending.time < 0.06) return;
    }
    const smoothed = this.last
      ? this.last.midi + (1 - Math.exp(-(time - this.last.time) / 0.035)) * (midi - this.last.midi)
      : midi;
    this.last = { time, midi: smoothed };
    this.pending = null;
    this.points.push({ beat, midi: smoothed, segment: this.segment });
    // One bounded phrase history, even for long or stalled sessions.
    if (this.points.length > 6000) this.points.splice(0, this.points.length - 6000);
  }
}

export function guideAt(exercise: Exercise, beat: number): NoteEvent | undefined {
  return (exercise.guideNotes || exercise.notes).find(
    (n) => n.onsetBeat <= beat && beat < n.onsetBeat + n.slotBeats
  );
}
