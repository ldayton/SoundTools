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
