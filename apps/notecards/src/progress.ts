import { ROUND_LENGTHS, readProgress, type RoundLength } from "./model";
import {
  EXERCISES,
  FLASHCARD_EXERCISES,
  type FlashcardMode,
  type Mode,
} from "./exercises";
import {
  defaultProfile,
  mergeProfile,
  type Profile,
} from "./exercise-settings";
export const STORAGE_KEY = "soundtools:notecards:v1";
export type RecordStats = {
  attempts: number;
  correct: number;
  streak: number;
  lastSeen: number;
  due: number;
};
export type Progress = {
  version: 5;
  roundLength: RoundLength;
  mode: Mode;
  profiles: Record<FlashcardMode, Profile>;
  stats: Record<string, RecordStats>;
};
export function defaultProgress(): Progress {
  const profiles = Object.fromEntries(
    FLASHCARD_EXERCISES.map((m) => [m.mode, defaultProfile(m.mode)]),
  ) as Record<FlashcardMode, Profile>;
  return { version: 5, roundLength: 12, mode: "staff", profiles, stats: {} };
}
export function loadProgress(raw: string | null): Progress {
  const result = defaultProgress();
  try {
    const data = JSON.parse(raw || "null");
    if (!data) return result;
    if (![3, 4, 5].includes(data.version)) {
      if (![1, 2].includes(data.version)) return result;
      const old = readProgress(raw);
      result.mode = "staff";
      Object.assign(result.profiles.staff, old.settings);
      for (const [id, s] of Object.entries(old.stats))
        result.stats[`staff:${id}`] = { ...s, streak: 0, lastSeen: 0, due: 0 };
      return result;
    }
    if (ROUND_LENGTHS.includes(data.roundLength))
      result.roundLength = data.roundLength;
    if (EXERCISES.some((m) => m.mode === data.mode)) result.mode = data.mode;
    for (const { mode } of FLASHCARD_EXERCISES) {
      if (!data.profiles?.[mode]) continue;
      const base = result.profiles[mode];
      if (mode === "piano" && data.version < 5) base.staffLayout = "treble";
      result.profiles[mode] = mergeProfile(mode, base, data.profiles?.[mode]);
    }
    // Upgrade the old introductory Name default; retain deliberately narrowed ranges/subsets.
    const oldName = data.profiles?.name;
    if (
      data.version === 3 &&
      oldName?.strings?.length === 1 &&
      oldName.strings[0] === 6 &&
      oldName.minFret === 0 &&
      oldName.maxFret === 5 &&
      oldName.key === "C"
    )
      result.profiles.name.strings = [1, 2, 3, 4, 5, 6];
    const patterns =
      /^(theory-(scales|intervals):[A-Za-z0-9:#-]+|signature:(major|minor):[A-G](#|b)?|(piano-(staff|name)):[A-G][2-6]:-?[01]|staff:[A-G][234]:-?[01]|(name|find|tab|staff-find):[1-6]:([0-9]|1[0-2]))$/;
    for (const [id, s] of Object.entries(data.stats || {}) as [string, any][]) {
      if (
        patterns.test(id) &&
        Number.isSafeInteger(s?.attempts) &&
        s.attempts > 0 &&
        Number.isSafeInteger(s.correct) &&
        s.correct >= 0 &&
        s.correct <= s.attempts
      )
        result.stats[id] = {
          attempts: s.attempts,
          correct: s.correct,
          streak: Number.isSafeInteger(s.streak)
            ? Math.max(0, Math.min(100, s.streak))
            : 0,
          lastSeen: Number.isFinite(s.lastSeen) ? Math.max(0, s.lastSeen) : 0,
          due: Number.isFinite(s.due) ? Math.max(0, s.due) : 0,
        };
    }
  } catch {}
  return result;
}
export function recordAnswer(
  progress: Progress,
  id: string,
  correct: boolean,
  now = Date.now(),
) {
  const s = (progress.stats[id] ||= {
    attempts: 0,
    correct: 0,
    streak: 0,
    lastSeen: 0,
    due: 0,
  });
  s.attempts++;
  if (correct) s.correct++;
  s.streak = correct ? s.streak + 1 : 0;
  s.lastSeen = now;
  // Lightweight review spacing; within-session mistakes are also revisited.
  s.due =
    now +
    (correct ? [1, 3, 7, 14, 30][Math.min(s.streak - 1, 4)] * 86400000 : 0);
}
export function reviewWeight(s: RecordStats | undefined, now = Date.now()) {
  if (!s) return 4;
  return (
    1 +
    3 * (1 - s.correct / s.attempts) +
    (s.due <= now ? 2 : 0) +
    1 / (1 + s.attempts)
  );
}
