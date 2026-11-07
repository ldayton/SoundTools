import { type Card } from "./model";
import { recordAnswer, reviewWeight, type Progress } from "./progress";
export class PracticeSession<T extends Card> {
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
  next(random = Math.random): T | null {
    if (this.answered >= this.length || !this.pool.length) {
      this.phase = "complete";
      return (this.current = null);
    }
    const choices = this.choices();
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
  submit(correct: boolean): boolean {
    if (this.phase !== "question" || !this.current) return false;
    this.phase = "feedback";
    this.answered++;
    if (correct) this.correct++;
    recordAnswer(this.progress, this.prefix + this.current.id, correct);
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
      ? "Feeling comfortable? Try another string or a wider range."
      : "Keep going to revisit notes and build familiarity.";
  }
}
