export const LIVE_MODES = ["sight", "patterns", "rhythm"] as const;
export type LiveMode = (typeof LIVE_MODES)[number];
export function isLiveMode(mode: string): mode is LiveMode {
  return (LIVE_MODES as readonly string[]).includes(mode);
}
export interface LivePractice {
  readonly midiSlot: HTMLElement;
  readonly listening: boolean;
  setActive(active: boolean): void;
  interrupted(): void;
  answer(note: number, held?: readonly number[], timestamp?: number): void;
}
