import { Account } from "@ldayton/account";
import {
  restoreSoundglowRecords,
  soundglowRecords,
  audioFingerprint,
  type Models,
  type SoundglowSettings,
} from "./account-records";
export const account = new Account("soundglow", (code) =>
  window.SoundglowDiagnostics?.event?.("account." + code),
);
type Bridge = {
  read(): SoundglowSettings;
  apply(settings: SoundglowSettings): void;
  pause(): void;
  applyPartial?(settings: SoundglowSettings, keys: string[]): void;
  idle(): boolean;
  models: Models;
};
let active = false;
let bridge: Bridge | undefined;
let saving = false;
export const soundglowAccount = {
  get active() {
    return active;
  },
  fingerprint: audioFingerprint,
  pause() {
    bridge?.pause();
  },
  /** Called after canonical model commands. Coalescing includes pre-commit preset writes. */
  save() {
    if (!active) return false;
    if (!saving) {
      saving = true;
      queueMicrotask(() => {
        saving = false;
        void account
          .changed()
          .catch((error) =>
            window.SoundglowDiagnostics?.capture(error, "account.save_failed"),
          );
      });
    }
    return true;
  },
  async flush() {
    if (saving) {
      await Promise.resolve();
    }
    await account.flush();
  },
  async start(host: Bridge) {
    bridge = host;
    let guest: SoundglowSettings | undefined;
    await account.start({
      read: () => soundglowRecords(host.read()),
      validate: (records) => {
        restoreSoundglowRecords(records, host.models);
      },
      pause: host.pause,
      canApply: () =>
        host.idle() &&
        !document.querySelector('[role="dialog"]') &&
        !document.activeElement?.matches(
          'input,select,textarea,[role="slider"],[role="spinbutton"]',
        ),
      applyPartial: async (records, keys) => {
        if (
          !active ||
          !host.applyPartial ||
          document.querySelector('[role="dialog"]') ||
          document.activeElement?.closest(
            'input,select,textarea,[role="slider"],[role="spinbutton"]',
          )
        )
          return [];
        const accepted = keys.filter(
          (key) =>
            key.startsWith("bookmark:") ||
            key.startsWith("pitch-preset:") ||
            key.startsWith("spectrogram-preset:"),
        );
        if (!accepted.length) return [];
        const merged = soundglowRecords(host.read());
        for (const key of accepted) {
          if (key in records) merged[key] = records[key];
          else delete merged[key];
        }
        host.applyPartial(
          restoreSoundglowRecords(merged, host.models),
          accepted,
        );
        return accepted;
      },
      apply: async (records) => {
        if (records && !active) guest = structuredClone(host.read());
        const next = records
          ? restoreSoundglowRecords(records, host.models)
          : guest || host.read();
        active = !!records;
        host.apply(next);
      },
    });
  },
};
declare global {
  interface Window {
    SoundglowAccount: typeof soundglowAccount;
  }
}
