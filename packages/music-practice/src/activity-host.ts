import type { Mode } from "./exercise-catalog";
import type { AppRoute } from "./navigation";
import type {
  PracticeActivity,
  Interruption,
  InputPolicy,
} from "./live-practice";

export type InputEnvironment = {
  writable: boolean;
  blocked: boolean;
  visible: boolean;
  focused: boolean;
};

/** Owns every activity's lifecycle, including flashcards, and rejects stale lazy loads. */
export class ActivityHost {
  private instances = new Map<Mode, PracticeActivity>();
  private pending = new Map<Mode, Promise<PracticeActivity>>();
  private generation = 0;
  private disposed = false;
  active: PracticeActivity | undefined;
  constructor(
    private options: {
      load(mode: Mode): PracticeActivity | Promise<PracticeActivity>;
      changed(): void;
      missing(): void;
      failed(error: unknown, mode: Mode, current: boolean): void;
    },
  ) {}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.active?.leave();
    this.active = undefined;
    for (const instance of new Set(this.instances.values()))
      instance.dispose?.();
    this.instances.clear();
    this.options.changed();
  }
  async activate(route: AppRoute) {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.active?.leave();
    this.active = undefined;
    this.options.changed();
    if (route.kind !== "exercise") return;
    const mode = route.mode;
    try {
      let instance = this.instances.get(mode);
      if (!instance) {
        const existing = this.pending.get(mode);
        if (existing) instance = await existing;
        else {
          const loaded = this.options.load(mode);
          if (loaded instanceof Promise) {
            const pending = loaded.then((controller) => {
              if (this.disposed) controller.dispose?.();
              else this.instances.set(mode, controller);
              return controller;
            });
            this.pending.set(mode, pending);
            void pending
              .finally(() => {
                if (this.pending.get(mode) === pending)
                  this.pending.delete(mode);
              })
              .catch(() => {});
            instance = await pending;
          } else {
            instance = loaded;
            this.instances.set(mode, instance);
          }
        }
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
      if (generation === this.generation) {
        this.active?.leave();
        this.active = undefined;
        this.options.changed();
      }
      if (!this.disposed)
        this.options.failed(error, mode, generation === this.generation);
    }
  }
  canInteract(environment: InputEnvironment) {
    return (
      !!this.active &&
      environment.writable &&
      !environment.blocked &&
      environment.visible &&
      environment.focused
    );
  }
  inputPolicy(environment: InputEnvironment): InputPolicy {
    return this.canInteract(environment) ? this.active!.inputPolicy : "none";
  }
  interrupt(reason: Interruption) {
    this.active?.interrupt(reason);
  }
}
