import score from "./backing-phrases/approved.json";
import mix from "./backing-phrases/approved-mix.json";
import acoustic from "./assets/backing-folk-country/manifest.json";
import piano from "./assets/backing-gospel/manifest.json";
import keys from "./assets/backing-soul-folk/manifest.json";
import { backingPack, type BackingEvent } from "./backing-track-model";
import type { BackingTake } from "./backing-plan-types";
import type { BackingPattern } from "./backing-patterns";
import { backingPattern } from "./backing-patterns";
import {
  practicePitchClasses,
  type ScalePracticeQuality,
} from "./backing-scale-harmony";
import { isMaqam } from "./maqamat";
type Preset = keyof typeof score.profiles;
type Profile = {
  tempo: number;
  bars: { role: string; fillStart?: number }[];
  events: BackingEvent[];
};
const profiles = score.profiles as unknown as Record<Preset, Profile>;
const tuning = [40, 45, 50, 55, 59, 64];
const pc = (n: number) => ((n % 12) + 12) % 12;
export function approvedPreset(
  style: BackingTake["plan"]["style"],
  pattern?: BackingPattern,
): Preset {
  return style === "folk"
    ? (backingPattern(style, pattern) as "strummed" | "fingerpicked")
    : style;
}
export function approvedMixGain(
  style: BackingTake["plan"]["style"],
  pattern: BackingPattern | undefined,
  event: Pick<BackingEvent, "part" | "instrument">,
) {
  const file = style + "-" + backingPattern(style, pattern);
  const id =
    event.instrument === "electric-twang"
      ? "twang"
      : event.instrument === "blues-lead"
        ? "lead"
        : event.instrument === "tonewheel-organ"
          ? "organ"
          : event.instrument === "acoustic-piano"
            ? "piano"
            : event.part;
  const values = (
    mix.genres as Record<string, Record<string, { db: number; muted: boolean }>>
  )[file];
  return values?.[id]?.muted ? 0 : 10 ** ((values?.[id]?.db ?? 0) / 20);
}
const nativeCache = new Map<string, Set<number>>();
function native(event: BackingEvent) {
  const key = event.part + ":" + event.instrument + ":" + event.articulation;
  if (nativeCache.has(key)) return nativeCache.get(key)!;
  const source =
    event.instrument === "acoustic-steel" ||
    event.instrument === "electric-twang"
      ? acoustic.samples
      : event.instrument === "acoustic-piano"
        ? piano.samples
        : event.instrument === "soul-keys"
          ? keys.samples
          : backingPack.samples;
  const samples = Object.values(source).filter(
    (s) =>
      s.part === event.part &&
      !s.release &&
      (event.part !== "guitar" ||
        (s.articulation ?? "normal") === (event.articulation ?? "normal")),
  );
  const notes = new Set(samples.map((s) => s.note));
  nativeCache.set(key, notes);
  return notes;
}
const gripCache = new Map<string, { note: number; string: number }[]>();
function guitarGrip(events: BackingEvent[], desired: number[]) {
  const key = events
    .map((e, i) =>
      [e.instrument, e.articulation, e.string, desired[i]].join(":"),
    )
    .join("|");
  const cached = gripCache.get(key);
  if (cached) return cached;
  const options = events.map((e, i) =>
    [...native(e)]
      .filter((n) => pc(n) === pc(desired[i]))
      .flatMap((note) =>
        tuning.flatMap((open, string) =>
          note >= open && note <= open + 19
            ? [
                {
                  note,
                  string,
                  fret: note - open,
                  cost:
                    Math.abs(note - desired[i]) * 2 +
                    Math.abs(string - (e.string ?? string)) * 0.6 +
                    (note - open) * 0.02,
                },
              ]
            : [],
        ),
      )
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 10),
  );
  let best: { note: number; string: number }[] | undefined,
    price = Infinity;
  function visit(i: number, chosen: (typeof options)[number], cost: number) {
    if (cost >= price) return;
    if (i === events.length) {
      best = chosen.map(({ note, string }) => ({ note, string }));
      price = cost;
      return;
    }
    for (const n of options[i]) {
      if (chosen.some((c) => c.string === n.string)) continue;
      const frets = [...chosen, n].map((c) => c.fret).filter((f) => f > 0);
      if (Math.max(...frets) - Math.min(...frets) > 4) continue;
      visit(i + 1, [...chosen, n], cost + n.cost);
    }
  }
  visit(0, [], 0);
  if (!best) throw Error("No playable approved guitar grip: " + key);
  gripCache.set(key, best);
  return best;
}
/** Realize the approved sixteen-bar conversation across the existing full form.
 * Legacy arrangers remain the source of form, section dynamics and reference A/Bs. */
export function approvedBackingTake(
  base: BackingTake,
  pattern?: BackingPattern,
  scale?: ScalePracticeQuality,
): BackingTake {
  if (scale && isMaqam(scale)) return base; // Keep the dedicated maqam pedal harmony contract.
  const preset = approvedPreset(base.plan.style, pattern),
    profile = profiles[preset],
    events: BackingEvent[] = [],
    bars = base.plan.bars.map((b) => ({ ...b }));
  const major = [0, 2, 4, 5, 7, 9, 11],
    minor = [0, 2, 3, 5, 7, 10, 10];
  for (let bar = 0; bar < bars.length; bar++) {
    const phase = (bar + (base.plan.cycle % 2) * 8) % 16,
      source = profile.events.filter((e) => Math.floor(e.beat / 4) === phase),
      target = bars[bar],
      root = scale ? base.plan.tonic : target.root,
      quality = scale ?? (target.minor ? "minor" : "major"),
      allowed = practicePitchClasses(root, quality).filter(
        (pitch) =>
          scale ||
          practicePitchClasses(base.plan.tonic, base.plan.quality).includes(
            pitch,
          ),
      ),
      shift = root > 6 ? root - 12 : root;
    const mapNote = (e: BackingEvent) => {
      const degree = major.indexOf(pc(e.note)),
        octave = e.note - pc(e.note);
      let note =
        octave +
        (quality.startsWith("minor") && degree >= 0
          ? minor[degree]
          : pc(e.note)) +
        shift;
      if (!allowed.includes(pc(note)))
        note = Array.from({ length: 25 }, (_, i) => note + i - 12)
          .filter((n) => allowed.includes(pc(n)))
          .sort((a, b) => Math.abs(a - note) - Math.abs(b - note) || a - b)[0];
      return note;
    };
    const plan = profile.bars[phase];
    bars[bar] = {
      ...target,
      role: plan.role as typeof target.role,
      fillStart: plan.fillStart,
    };
    const selected = source.filter((e) => {
      if (base.plan.mode === "active") return true;
      const pos = e.beat - phase * 4;
      if (e.part === "drums" && [42, 46, 51].includes(e.note))
        return Math.abs(pos - Math.round(pos)) < 0.08;
      if (e.part === "bass") return pos < 2.45;
      if ((e.part === "guitar" || e.part === "keys") && plan.role === e.part)
        return pos < 3.25;
      return true;
    });
    const mapped = new Map<BackingEvent, { note: number; string?: number }>();
    const groups = new Map<string, BackingEvent[]>();
    for (const e of selected) {
      if (e.part === "drums" || e.part === "percussion") continue;
      if (e.part === "guitar") {
        const key =
          (e.instrument ?? "guitar") +
          ":" +
          Math.round((e.beat - phase * 4) * 4);
        const group = groups.get(key) ?? [];
        group.push(e);
        groups.set(key, group);
      } else {
        const desired = mapNote(e);
        const choices =
          e.instrument === "tonewheel-organ"
            ? Array.from({ length: 48 }, (_, i) => i + 36)
            : [...native(e)];
        const note = choices
          .filter((n) => pc(n) === pc(desired))
          .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))[0];
        if (note === undefined)
          throw Error(
            "No approved native pitch " + e.instrument + ":" + desired,
          );
        mapped.set(e, { note });
      }
    }
    for (const group of groups.values()) {
      const grip = guitarGrip(group, group.map(mapNote));
      group.forEach((e, i) => mapped.set(e, grip[i]));
    }
    for (const e of selected) {
      const pos = e.beat - phase * 4,
        grid = Math.round(pos * 24) / 24,
        micro = ((pos - grid) * 60) / profile.tempo,
        beat = bar * 4 + grid + (micro * base.tempo) / 60;
      const end = base.beats - 0.03;
      events.push({
        ...e,
        ...mapped.get(e),
        beat,
        duration: Math.min(e.duration, end - beat),
        level:
          e.level *
          target.level *
          10 **
            (((base.plan.style === "gospel" ? -target.db * 0.35 : 0) -
              (target.texture === "crossstick"
                ? {
                    rock: 0.5,
                    blues: 1.5,
                    folk: 0,
                    country: 0,
                    gospel: 0,
                    reggae: 1,
                    funk: 8,
                    soul: 4.5,
                  }[base.plan.style]
                : 0)) /
              20),
        absolute: e.part !== "drums" && e.part !== "percussion",
      });
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  const next = new Map<string, number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!["guitar", "bass", "keys"].includes(e.part)) continue;
    const key =
      e.part +
      ":" +
      e.instrument +
      ":" +
      (e.part === "bass" ? "mono" : e.part === "guitar" ? e.string : e.note);
    if (next.has(key))
      e.duration = Math.min(e.duration, next.get(key)! - e.beat - 0.01);
    next.set(key, e.beat);
  }
  return {
    ...base,
    phrasing: "approved-ensemble-v1",
    events: events.filter((e) => e.duration > 0.015),
    plan: { ...base.plan, bars },
    phraseIds: Array.from(
      { length: Math.ceil(bars.length / 8) },
      (_, i) =>
        `approved-${preset}-${base.plan.mode}-${(i + base.plan.cycle) % 2}`,
    ),
  };
}
