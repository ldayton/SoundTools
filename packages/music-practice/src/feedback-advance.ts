/** A pending save must not schedule another card after navigation or interruption. */
export class FeedbackAdvance {
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  cancel() {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  schedule(
    committed: Promise<boolean>,
    delay: number,
    eligible: () => boolean,
    advance: () => void,
  ) {
    this.cancel();
    const generation = this.generation;
    void committed.then((saved) => {
      if (!saved || generation !== this.generation || !eligible()) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (generation === this.generation && eligible()) advance();
      }, delay);
    });
  }
}
