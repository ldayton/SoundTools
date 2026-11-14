import { LIVE_EXERCISES, isLiveMode, type LiveMode } from "./exercises";
import type { AppRoute } from "./navigation";
import type { LivePractice, Interruption } from "./live-practice";
/** Owns lazy activity instances and activation; a slow import cannot revive an activity after navigation. */
export class ActivityHost {
  private instances = new Map<LiveMode, LivePractice>();
  private pending = new Map<LiveMode, Promise<LivePractice>>();
  private generation = 0;
  active: LivePractice | undefined;
  constructor(
    private options: {
      element(mode: LiveMode): HTMLElement;
      changed(): void;
      missing(): void;
      failed(error: unknown): void;
    },
  ) {}
  async activate(route: AppRoute) {
    const generation = ++this.generation;
    this.active?.leave();
    this.active = undefined;
    this.options.changed();
    if (route.kind !== "exercise" || !isLiveMode(route.mode)) return;
    const mode = route.mode;
    const element = this.options.element(mode);
    try {
      let instance = this.instances.get(mode);
      if (!instance) {
        element.textContent = "Loading practice…";
        let pending = this.pending.get(mode);
        if (!pending) {
          const definition = LIVE_EXERCISES.find((e) => e.mode === mode)!;
          pending = definition.load().then((Controller) => {
            const controller = new Controller(element, this.options.changed);
            this.instances.set(mode, controller);
            return controller;
          });
          this.pending.set(mode, pending);
          void pending.finally(() => this.pending.delete(mode)).catch(() => {});
        }
        instance = await pending;
      }
      if (generation !== this.generation) return;
      if (instance.applyRoute?.(route) === false) {
        this.options.missing();
        return;
      }
      this.active = instance;
      instance.enter();
      this.options.changed();
    } catch (error) {
      if (generation === this.generation)
        element.textContent =
          "Practice couldn’t load. Choose another mode, then try again.";
      this.options.failed(error);
    }
  }
  interrupt(reason: Interruption) {
    this.active?.interrupt(reason);
  }
}
