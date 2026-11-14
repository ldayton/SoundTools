export { isLiveMode } from "./exercise-catalog";
export type { LiveMode } from "./exercise-catalog";
export type Interruption =
  "navigation" | "focus" | "visibility" | "connection" | "controls" | "resize";
export type InputPolicy = "none" | "answer" | "restart";
export interface PracticeActivity {
  applyRoute?(route: import("./navigation").PracticeRoute): boolean;
  /** Paused/completed note sequences can still accept the intentional hands-free restart gesture. */
  readonly inputPolicy: InputPolicy;
  dispose?(): void;
  enter(): void;
  leave(): void;
  interrupt(reason: Interruption): void;
}
export interface LivePractice extends PracticeActivity {
  answer(note: number, held?: readonly number[], timestamp?: number): void;
}
