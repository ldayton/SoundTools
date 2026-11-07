import {
  KEYS,
  POSITIONS,
  ROUND_LENGTHS,
  readProgress,
  type RoundLength,
  type Stats,
} from "./model";
import { PIANO_POSITIONS } from "./piano-model";
import { MODES, type Mode, type Profile } from "./guitar";
export const STORAGE_KEY = "soundtools:notecards:v1";
export type RecordStats = {
  attempts: number;
  correct: number;
  streak: number;
  lastSeen: number;
  due: number;
};
export type Progress = {
  version: 4;
  roundLength: RoundLength;
  mode: Mode;
  profiles: Record<Mode, Profile>;
  stats: Record<string, RecordStats>;
};
export function defaultProgress(): Progress {
  const profiles = Object.fromEntries(
    MODES.map((m) => [
      m.id,
      {
        low: m.id === "piano" ? "C4" : "E3",
        high: m.id === "piano" ? "B5" : "F4",
        key: "C",
        strings: m.id === "name" ? [1, 2, 3, 4, 5, 6] : [6],
        minFret: 0,
        maxFret: 5,
      },
    ]),
  ) as Record<Mode, Profile>;
  return { version: 4, roundLength: 12, mode: "staff", profiles, stats: {} };
}
export function loadProgress(raw: string | null): Progress {
  const result = defaultProgress();
  try {
    const data = JSON.parse(raw || "null");
    if (!data) return result;
    if (![3, 4].includes(data.version)) {
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
    if (MODES.some((m) => m.id === data.mode)) result.mode = data.mode;
    for (const mode of MODES.map((m) => m.id)) {
      const source = data.profiles?.[mode],
        profile = result.profiles[mode];
      if (!source) continue;
      if (KEYS.some((k) => k.id === source.key)) profile.key = source.key;
      if (mode === "piano" && ["staff", "name"].includes(source.pianoPrompt))
        profile.pianoPrompt = source.pianoPrompt;
      const positions = mode === "piano" ? PIANO_POSITIONS : POSITIONS;
      if (source.naturalsOnly === true) profile.naturalsOnly = true;
      if (
        positions.includes(source.low) &&
        positions.includes(source.high) &&
        positions.indexOf(source.low) <= positions.indexOf(source.high) &&
        (mode !== "piano" ||
          positions.indexOf(source.high) - positions.indexOf(source.low) < 14)
      ) {
        profile.low = source.low;
        profile.high = source.high;
      }
      if (Array.isArray(source.strings)) {
        const strings = [
          ...new Set<number>(
            source.strings.filter(
              (n: unknown) =>
                typeof n === "number" &&
                Number.isInteger(n) &&
                n >= 1 &&
                n <= 6,
            ),
          ),
        ];
        if (strings.length) profile.strings = strings;
      }
      if (
        Number.isInteger(source.minFret) &&
        Number.isInteger(source.maxFret) &&
        source.minFret >= 0 &&
        source.maxFret <= 12 &&
        source.minFret <= source.maxFret
      ) {
        profile.minFret = source.minFret;
        profile.maxFret = source.maxFret;
      }
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
      /^((piano-(staff|name)):[A-G][3-6]:-?[01]|staff:[A-G][234]:-?[01]|(name|find|tab|staff-find):[1-6]:([0-9]|1[0-2]))$/;
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
