import {
  AccountDataError,
  checkSchema,
  type Json,
  type Records,
} from "@ldayton/account/model";
import { decodeState, migrateLegacy, type DurableState } from "./durable-state";
import { APP_EXERCISES, isFlashcardMode } from "./exercise-catalog";
import type { RecordStats } from "./progress";
import { isBackingMixerKey } from "./backing-mixer";

function settingsRecords(state: DurableState): Records {
  const p = state.progress;
  const records: Records = {
    schema: 1,
    current: { mode: p.mode, roundLength: p.roundLength },
  };
  for (const [mode, profile] of Object.entries(p.profiles)) {
    records[`profile:${mode}`] = profile as unknown as Json;
    records[`round:${mode}`] =
      p.roundLengths?.[mode as keyof typeof p.roundLengths] || p.roundLength;
  }
  for (const [id, value] of Object.entries(state.activities))
    if (
      isFlashcardMode(id) ||
      isBackingMixerKey(id) ||
      [
        "patterns",
        "guitar-scales",
        "backing-track",
        "theory-scales",
        "theory-intervals",
        "audio",
        "presentation",
      ].includes(id)
    )
      records[`activity:${id}`] = value as Json;
  return records;
}

/** Pure decoder: validation must never change the adapter's counter baseline. */
export function restoreNotewiseRecords(records: Records): DurableState {
  checkSchema(records);
  const state = migrateLegacy({});
  const latest = new Map<string, string>();
  for (const [key, value] of Object.entries(records).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (value === null) continue;
    if (key === "schema" || key === "activity:rhythm") continue;
    if (key === "current") {
      const saved = value as { mode?: unknown; roundLength?: unknown };
      const current = saved?.mode === "rhythm" ? {...saved,mode:state.progress.mode} : saved;
      if (
        !current ||
        !APP_EXERCISES.some((e) => e.mode === current.mode) ||
        ![12, 24, 36, 48].includes(Number(current.roundLength))
      )
        throw new AccountDataError(
          "Invalid exercise settings. Your cloud data is preserved.",
        );
      Object.assign(state.progress, {
        mode: current.mode,
        roundLength: current.roundLength,
      });
    } else if (key.startsWith("profile:") && isFlashcardMode(key.slice(8)))
      (state.progress.profiles as Record<string, unknown>)[key.slice(8)] =
        value;
    else if (key.startsWith("round:") && isFlashcardMode(key.slice(6)))
      ((state.progress.roundLengths ??= {}) as Record<string, unknown>)[
        key.slice(6)
      ] = value;
    else if (
      key.startsWith("activity:") &&
      (APP_EXERCISES.some((e) => e.mode === key.slice(9)) ||
        ["audio", "presentation", "backing-track"].includes(key.slice(9)) ||
        isBackingMixerKey(key.slice(9)))
    )
      state.activities[key.slice(9)] = value;
    else if (key.startsWith("stat:")) {
      const id = key.slice(5, key.lastIndexOf(":"));
      const s = value as unknown as RecordStats;
      if (
        !s ||
        !Number.isSafeInteger(s.attempts) ||
        s.attempts < 0 ||
        !Number.isSafeInteger(s.correct) ||
        s.correct < 0 ||
        s.correct > s.attempts ||
        !Number.isSafeInteger(s.streak) ||
        s.streak < 0 ||
        !Number.isFinite(s.lastSeen) ||
        s.lastSeen < 0 ||
        !Number.isFinite(s.due) ||
        s.due < 0
      )
        throw new AccountDataError(
          "Invalid practice totals. Your cloud data is preserved.",
        );
      const prior = state.progress.stats[id];
      const newer =
        !prior ||
        s.lastSeen > prior.lastSeen ||
        (s.lastSeen === prior.lastSeen && key > (latest.get(id) || ""));
      state.progress.stats[id] = {
        ...(newer ? s : prior),
        attempts: (prior?.attempts || 0) + s.attempts,
        correct: (prior?.correct || 0) + s.correct,
      };
      if (
        !Number.isSafeInteger(state.progress.stats[id].attempts) ||
        !Number.isSafeInteger(state.progress.stats[id].correct)
      )
        throw new AccountDataError(
          "Practice totals are too large. Your cloud data is preserved.",
        );
      if (newer) latest.set(id, key);
    } else
      throw new AccountDataError(
        "Update NoteWise before opening these cloud settings. Your saved data is preserved.",
      );
  }
  return decodeState(state);
}

/** Cumulative contributions avoid conflicts/lost attempts when two devices
 * practise the same card. Growth is bounded by cards × replicas, not answers. */
export class NotewiseAccountRecords {
  private previous: Records = {};
  private totals: Record<string, RecordStats> = {};
  accept(records: Records | null, state: DurableState) {
    this.previous = structuredClone(records || {});
    this.totals = structuredClone(state.progress.stats);
  }
  read(state: DurableState, device?: string): Records {
    const records = settingsRecords(state);
    if (!device) {
      for (const [id, stats] of Object.entries(state.progress.stats))
        records[`stat:${id}:base`] = stats as unknown as Json;
      return records;
    }
    for (const [key, value] of Object.entries(this.previous))
      if (key.startsWith("stat:")) records[key] = value;
    for (const [id, stats] of Object.entries(state.progress.stats)) {
      const before = this.totals[id];
      const attempts = stats.attempts - (before?.attempts || 0);
      const correct = stats.correct - (before?.correct || 0);
      if (attempts < 0 || correct < 0 || correct > attempts)
        throw new AccountDataError(
          "Practice totals changed unexpectedly. Reload to preserve both copies.",
        );
      if (!attempts) continue;
      const key = `stat:${id}:${device}`;
      const own = records[key] as unknown as RecordStats | undefined;
      records[key] = {
        ...stats,
        attempts: (own?.attempts || 0) + attempts,
        correct: (own?.correct || 0) + correct,
      };
    }
    this.previous = structuredClone(records);
    this.totals = structuredClone(state.progress.stats);
    return records;
  }
}
