import type { HymnSettings } from "./hymn-settings";
import type { HymnKey } from "./hymn-transpose";

export type HymnOptionsChange = Partial<
  Pick<
    HymnSettings,
    | "hymn"
    | "key"
    | "mode"
    | "bpm"
    | "countIn"
    | "arrangement"
    | "viewHands"
    | "hands"
    | "reattackTies"
  >
> & { zoom?: number };
export type HymnOptionsSnapshot = Required<HymnOptionsChange> & {
  searchOpen: boolean;
  unmetered: boolean;
  originalKey: string;
  noMatchingKey: boolean;
  availableKeys: HymnKey[];
  range: string;
};
/** The music controller remains the source of truth, including URL and range-driven changes. */
export function hymnOptionsState(initial: HymnOptionsSnapshot) {
  let state = initial;
  let signature = JSON.stringify(state);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: HymnOptionsSnapshot) {
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      state = next;
      signature = nextSignature;
      listeners.forEach((listener) => listener());
    },
  };
}
export type HymnOptionsState = ReturnType<typeof hymnOptionsState>;
