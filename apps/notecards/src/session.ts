import { type Card } from "./model";
import { recordAnswer, reviewWeight, type Progress } from "./progress";
export class PracticeSession<T extends Card> {
  answered = 0;
  correct = 0;
  recent: string[] = [];
  current: T | null = null;
  private retry = new Map<string, number>();
  private phase: "question" | "feedback" | "complete" = "complete";
  constructor(
    public pool: T[],
    private progress: Progress,
    private prefix: string,
    public readonly length = progress.roundLength,
  ) {}
  next(random = Math.random): T | null {
    if (this.answered >= this.length || !this.pool.length) {
      this.phase = "complete";
      return (this.current = null);
    }
    const cooldown = Math.min(3, Math.max(0, this.pool.length - 1));
    const exclude = new Set(cooldown ? this.recent.slice(-cooldown) : []);
    const available = this.pool.filter((c) => !exclude.has(c.id));
    const cards = available.length ? available : this.pool;
    const retry = cards.find(
      (c) => this.retry.has(c.id) && this.retry.get(c.id)! <= this.answered,
    );
    let card = retry;
    if (!card) {
      let point =
        random() *
        cards.reduce(
          (sum, c) =>
            sum + reviewWeight(this.progress.stats[this.prefix + c.id]),
          0,
        );
      card =
        cards.find(
          (c) =>
            (point -= reviewWeight(this.progress.stats[this.prefix + c.id])) <
            0,
        ) || cards.at(-1)!;
    }
    this.retry.delete(card.id);
    this.current = card;
    this.recent.push(card.id);
    this.phase = "question";
    return card;
  }
  submit(correct: boolean): boolean {
    if (this.phase !== "question" || !this.current) return false;
    this.phase = "feedback";
    this.answered++;
    if (correct) this.correct++;
    recordAnswer(this.progress, this.prefix + this.current.id, correct);
    if (!correct) this.retry.set(this.current.id, this.answered + 3);
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
