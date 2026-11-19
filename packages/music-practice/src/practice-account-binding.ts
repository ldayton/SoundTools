import type { Records } from "@ldayton/account";
import { account } from "./account";
import { persistence } from "./persistence";
import type { DurableState } from "./durable-state";
import { shellStatus } from "./shell-status";
import { refreshPianoVolume } from "./piano-audio";
import { restorePianoVisibility } from "./practice-piano";

/** Common guest/cloud ownership and update flushing for both practice apps. */
export async function startPracticeAccount(options: {
  records(state: DurableState): Records;
  restore(records: Records): DurableState;
  pause(): void;
  canApply(): boolean;
  beforeApply(): void;
  liveKeys?(keys: string[]): string[];
  liveApplied?(records: Records, state: DurableState): void;
  applied(records: Records | null, state: DurableState): void;
}) {
  persistence.accountFlush = () => account.flush();
  await account.start({
    read: () => options.records(persistence.state),
    validate: (records) => {
      options.restore(records);
    },
    pause: options.pause,
    canApply: options.canApply,
    applyPartial: async (records, keys) => {
      const accepted = options.liveKeys?.(keys) || [];
      if (!accepted.length) return [];
      const merged = options.records(persistence.state);
      for (const key of accepted) {
        if (key in records) merged[key] = records[key];
        else delete merged[key];
      }
      const next = options.restore(merged);
      persistence.state = next;
      refreshPianoVolume();
      options.liveApplied?.(merged, next);
      return accepted;
    },
    apply: async (records) => {
      const next = records
        ? options.restore(records)
        : persistence.store!.state;
      options.beforeApply();
      persistence.state = next;
      persistence.accountSave = records
        ? async () => {
            await account.changed();
            return account.getSnapshot().status !== "error";
          }
        : undefined;
      shellStatus.set({ saved: records ? "" : "Saved on this device." });
      refreshPianoVolume();
      restorePianoVisibility();
      options.applied(records, next);
    },
  });
}
