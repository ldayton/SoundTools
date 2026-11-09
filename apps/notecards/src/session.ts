import { type Card } from "./model";
import { recordAnswer, reviewWeight, type Progress } from "./progress";
import type { PianoNotation } from "./piano-notation";
export type SessionSnapshot = {
  version: 1;
  pool: string[];
  prefix: string;
  length: number;
  answered: number;
  correct: number;
  current: string | null;
  recent: string[];
  retry: [string, number][];
  visits: [string, { count: number; last: number }][];
  draws: number;
  phase: "question" | "feedback" | "complete";
  representation?: PianoNotation;
  feedback?: { correct: boolean; text: string };
};
export class PracticeSession<T extends Card> {
  representation?: PianoNotation;
  feedback?: { correct: boolean; text: string };
  snapshot(): SessionSnapshot {
    return structuredClone({
      version: 1,
      pool: this.pool.map((c) => c.id),
      prefix: this.prefix,
      length: this.length,
      answered: this.answered,
      correct: this.correct,
      current: this.current?.id || null,
      recent: this.recent,
      retry: [...this.retry],
      visits: [...this.visits],
      draws: this.draws,
      phase: this.phase,
      ...(this.representation ? { representation: this.representation } : {}),
      ...(this.feedback ? { feedback: this.feedback } : {}),
    });
  }
  static restore<T extends Card>(
    pool: T[],
    progress: Progress,
    prefix: string,
    raw: unknown,
  ): PracticeSession<T> | null {
    try {
      const s = raw as SessionSnapshot;
      const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
      const ids = pool.map((c) => c.id);
      if (
        !s ||
        s.version !== 1 ||
        s.prefix !== prefix ||
        JSON.stringify(s.pool) !== JSON.stringify(ids) ||
        ![12, 24, 36, 48].includes(s.length) ||
        !integer(s.answered) ||
        s.answered > s.length ||
        !integer(s.correct) ||
        s.correct > s.answered ||
        !integer(s.draws) ||
        s.draws < s.answered ||
        !["question", "feedback", "complete"].includes(s.phase) ||
        (s.phase !== "complete" && !ids.includes(s.current!)) ||
        (s.phase === "question" && s.answered >= s.length) ||
        !Array.isArray(s.recent) ||
        s.recent.length > 8 ||
        s.recent.some((id) => !ids.includes(id)) ||
        !Array.isArray(s.retry) ||
        s.retry.some(([id, n]) => !ids.includes(id) || !integer(n)) ||
        !Array.isArray(s.visits) ||
        s.visits.some(
          ([id, v]) =>
            !ids.includes(id) ||
            !integer(v.count) ||
            !integer(v.last) ||
            v.last > s.draws,
        ) ||
        (s.phase === "feedback" &&
          (!s.feedback ||
            typeof s.feedback.text !== "string" ||
            typeof s.feedback.correct !== "boolean"))
      )
        return null;
      const out = new PracticeSession(
        pool,
        progress,
        prefix,
        s.length as Progress["roundLength"],
      );
      out.answered = s.answered;
      out.correct = s.correct;
      out.current = pool.find((c) => c.id === s.current) || null;
      out.recent = [...s.recent];
      out.retry = new Map(s.retry);
      out.visits = new Map(s.visits);
      out.draws = s.draws;
      out.phase = s.phase;
      if (s.representation) {
        const r = s.representation;
        if (
          !["grand", "bass", "treble"].includes(r.layout) ||
          !["bass", "treble"].includes(r.clef) ||
          ![-12, 0, 12].includes(r.octaveShift) ||
          !out.current ||
          r.written.letter !== out.current.letter ||
          r.written.modifier !== out.current.modifier ||
          r.written.octave !== out.current.octave - r.octaveShift / 12
        )
          return null;
        out.representation = structuredClone(r);
      }
      out.feedback = s.feedback && { ...s.feedback };
      return out;
    } catch {
      return null;
    }
  }
  answered = 0;
  correct = 0;
  recent: string[] = [];
  current: T | null = null;
  private retry = new Map<string, number>();
  private visits = new Map<string, { count: number; last: number }>();
  private draws = 0;
  private phase: "question" | "feedback" | "complete" = "complete";
  constructor(
    public pool: T[],
    private progress: Progress,
    private prefix: string,
    public readonly length = progress.roundLength,
  ) {}
  /** All but the immediately preceding question remain possible. */
  choices(now = Date.now()): { card: T; weight: number }[] {
    const last = this.recent.at(-1);
    const cards =
      this.pool.length > 1 ? this.pool.filter((c) => c.id !== last) : this.pool;
    const minimum = Math.min(
      ...this.pool.map((c) => this.visits.get(c.id)?.count || 0),
    );
    const horizon = Math.max(2, Math.min(8, Math.ceil(this.pool.length / 2)));
    return cards.map((card) => {
      const visit = this.visits.get(card.id);
      const gap = visit ? this.draws - visit.last : Infinity;
      const recency = visit ? 0.35 + 0.65 * Math.min(1, gap / horizon) : 1;
      const coverage = 1 + 2 / (1 + (visit?.count || 0) - minimum);
      const revisitAfter = this.retry.get(card.id);
      const revisit =
        revisitAfter !== undefined && this.draws >= revisitAfter
          ? 1 + Math.min(1, 0.25 * (this.draws - revisitAfter + 1))
          : 1;
      // Bound each influence so weak cards do not crowd out the rest of the set.
      const difficulty = Math.sqrt(
        reviewWeight(this.progress.stats[this.prefix + card.id], now),
      );
      return {
        card,
        weight: Math.min(12, difficulty * recency * coverage * revisit),
      };
    });
  }
  next(random = Math.random, now = Date.now()): T | null {
    this.representation = undefined;
    this.feedback = undefined;
    if (this.answered >= this.length || !this.pool.length) {
      this.phase = "complete";
      return (this.current = null);
    }
    const choices = this.choices(now);
    let point = random() * choices.reduce((sum, c) => sum + c.weight, 0);
    const card =
      choices.find((c) => (point -= c.weight) < 0)?.card ||
      choices.at(-1)!.card;
    this.retry.delete(card.id);
    this.draws++;
    const visit = this.visits.get(card.id);
    this.visits.set(card.id, {
      count: (visit?.count || 0) + 1,
      last: this.draws,
    });
    this.current = card;
    this.recent.push(card.id);
    if (this.recent.length > 8) this.recent.shift();
    this.phase = "question";
    return card;
  }
  /** Continue practice without resetting recency, coverage, or pending revisits. */
  continueRound(): boolean {
    if (!this.complete) return false;
    this.answered = this.correct = 0;
    this.current = null;
    this.phase = "complete";
    return true;
  }
  submit(correct: boolean, now = Date.now()): boolean {
    if (this.phase !== "question" || !this.current) return false;
    this.phase = "feedback";
    this.answered++;
    if (correct) this.correct++;
    recordAnswer(this.progress, this.prefix + this.current.id, correct, now);
    this.feedback = { correct, text: correct ? "Correct" : "Try again" };
    if (!correct)
      this.retry.set(
        this.current.id,
        this.draws + Math.min(3, Math.max(1, Math.floor(this.pool.length / 2))),
      );
    return true;
  }
  get accepting() {
    return this.phase === "question";
  }
  get complete() {
    return this.answered >= this.length;
  }
  get suggestion() {
    if (this.pool.length < 2) return "Try adding another note to your range.";
    if (this.pool.length === 2)
      return "Try adding more notes for a less predictable mix.";
    const mastered = this.pool.filter((c) => {
      const s = this.progress.stats[this.prefix + c.id];
      return (
        s && s.attempts >= 4 && s.correct / s.attempts >= 0.9 && s.streak >= 2
      );
    }).length;
    return mastered === this.pool.length
      ? "Feeling comfortable? Try another practice mode or a wider range."
      : "Keep going to revisit notes and build familiarity.";
  }
}
