export { isLiveMode } from "./exercises";
export type { LiveMode } from "./exercises";
export type Interruption =
  "navigation" | "focus" | "visibility" | "connection" | "controls" | "resize";
export type InputPolicy = "none" | "answer" | "restart";
export interface LivePractice {
  applyRoute?(route: import("./navigation").PracticeRoute): boolean;
  /** Paused/completed note sequences can still accept the intentional hands-free restart gesture. */
  readonly inputPolicy: InputPolicy;
  enter(): void;
  leave(): void;
  interrupt(reason: Interruption): void;
  answer(note: number, held?: readonly number[], timestamp?: number): void;
}
