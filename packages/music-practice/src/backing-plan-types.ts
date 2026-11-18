import type { plannedBackingArrangement } from "./backing-musical-plan";
import type { BackingStyle } from "./backing-track-model";
type LegacyTake = ReturnType<typeof plannedBackingArrangement>;
export type BackingTake = Omit<LegacyTake, "plan"> & {
  plan: Omit<LegacyTake["plan"], "style"> & { style: BackingStyle };
};
