import type { plannedBackingArrangement } from "./backing-musical-plan";
import type { BackingStyle } from "./backing-track-model";
type LegacyTake = ReturnType<typeof plannedBackingArrangement>;
export type BackingTake = Omit<LegacyTake, "plan"> & {
  /** Authored ensemble scores selected at phrase boundaries, when applicable. */
  phraseIds?: readonly string[];
  plan: Omit<LegacyTake["plan"], "style"> & { style: BackingStyle };
};
