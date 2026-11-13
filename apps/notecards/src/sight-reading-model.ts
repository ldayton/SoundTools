export type SightStep = { pitches: number[]; retryPitches?: number[] };
/** Untimed matching: fresh attacks for repeated notes; chords may be rolled, but held together. */
export class WaitForMe {
  index: number;
  private pressed = new Set<number>();
  private middleCs = 0;
  private retrying = true;
  constructor(
    readonly steps: readonly SightStep[],
    position = 0,
  ) {
    if (
      !steps.length ||
      steps.some(
        (s) =>
          !s.pitches.length ||
          s.pitches.some((n) => !Number.isInteger(n) || n < 0 || n > 127),
      )
    )
      throw Error("Invalid sight-reading sequence");
    this.index =
      Number.isSafeInteger(position) &&
      position >= 0 &&
      position <= steps.length
        ? position
        : 0;
  }
  get complete() {
    return this.index === this.steps.length;
  }
  get current() {
    const step = this.steps[this.index];
    return this.retrying && step?.retryPitches?.length
      ? { ...step, pitches: step.retryPitches }
      : step;
  }
  get selected() {
    return [...this.pressed];
  }
  resetGesture() {
    this.pressed.clear();
    this.middleCs = 0;
    this.retrying = true;
  }
  answer(note: number, held?: readonly number[], allowAdvance = true) {
    // Expected Cs always belong to the music, including partial chords. Only
    // three consecutive, unexpected C4 attacks form the restart command.
    if (note === 60 && !this.current?.pitches.includes(60)) {
      if (++this.middleCs === 3) {
        this.index = 0;
        this.resetGesture();
        return "restarted";
      }
    } else this.middleCs = 0;
    // Keep the hands-free restart available while paused or after finishing.
    if (!allowAdvance || this.complete) return "ignored";
    if (!this.current.pitches.includes(note)) {
      if (this.current.retryPitches) {
        this.pressed.clear();
        this.retrying = true;
      }
      return "wrong";
    }
    this.pressed.add(note);
    if (
      !this.current.pitches.every(
        (n) => this.pressed.has(n) && (!held || held.includes(n)),
      )
    )
      return "partial";
    this.index++;
    this.resetGesture();
    this.retrying = false;
    return this.complete ? "complete" : "advanced";
  }
}
export function searchHymns<T extends { title: string; aliases?: string[] }>(
  hymns: readonly T[],
  query: string,
): T[] {
  const normalize = (s: string) =>
    s
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const words = normalize(query).split(" ").filter(Boolean);
  return hymns.filter((h) =>
    words.every((word) =>
      normalize([h.title, ...(h.aliases || [])].join(" ")).includes(word),
    ),
  );
}
