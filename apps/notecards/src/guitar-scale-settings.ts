import { choice, object } from "./exercise-settings";
import {
  SCALE_TONICS,
  scaleKeyPitch,
  type ScaleSelection,
} from "./guitar-scales";
import {
  SCALE_SHAPES,
  migratePattern,
  patternShift,
  type ScalePattern,
} from "./guitar-scale-patterns";
export type GuitarScaleSettings = ScaleSelection & {
  pattern?: ScalePattern;
  shift?: number;
  labels?: "fingers" | "notes";
  returnPosition?: { pattern: ScalePattern; shift: number };
};
export function mergeGuitarScaleSettings(
  input: unknown,
  base: GuitarScaleSettings = { tonic: 4, quality: "major" },
): GuitarScaleSettings {
  const source = object(input);
  const settings: GuitarScaleSettings = {
    tonic:
      typeof source.tonic === "number" &&
      Number.isInteger(source.tonic) &&
      source.tonic >= 0 &&
      source.tonic < 12
        ? source.tonic
        : base.tonic,
    quality: choice(source.quality, ["major", "minor"], base.quality),
  };
  if (source.labels !== undefined || base.labels !== undefined)
    settings.labels = choice(
      source.labels,
      ["fingers", "notes"],
      base.labels || "fingers",
    );
  const patterns = ["map", ...SCALE_SHAPES] as const;
  const pattern = choice(
    migratePattern(source.pattern, settings.quality),
    patterns,
    base.pattern || "map",
  );
  if (source.pattern !== undefined || base.pattern !== undefined)
    settings.pattern = pattern;
  const validShift = (shift: unknown): shift is number =>
    typeof shift === "number" &&
    Number.isInteger(shift) &&
    Math.abs(shift) <= 24;
  const legacy =
    source.pattern !== undefined &&
    migratePattern(source.pattern, settings.quality) !== source.pattern;
  const shift = legacy
    ? undefined
    : validShift(source.shift)
      ? source.shift
      : base.shift;
  if (validShift(shift)) settings.shift = shift;
  const previous = object(source.returnPosition);
  if (
    patterns.includes(previous.pattern as ScalePattern) &&
    validShift(previous.shift)
  ) {
    const previousPattern = previous.pattern as ScalePattern;
    if (
      previousPattern === "map"
        ? previous.shift === 0
        : patternShift(
            settings.tonic,
            settings.quality,
            previousPattern,
            previous.shift,
          ) === previous.shift
    )
      settings.returnPosition = {
        pattern: previousPattern,
        shift: previous.shift,
      };
  }
  const spelling =
    typeof source.spelling === "string" ? source.spelling : base.spelling;
  if (
    spelling &&
    scaleKeyPitch(spelling, settings.quality) === settings.tonic &&
    spelling !== SCALE_TONICS[settings.quality][settings.tonic]
  )
    settings.spelling = spelling;
  return settings;
}
export function guitarScaleFromQuery(
  query: URLSearchParams,
  base: GuitarScaleSettings,
) {
  const quality = choice(query.get("scale"), ["major", "minor"], base.quality);
  const name = query.get("key");
  const pattern = query.get("pattern");
  const shift = query.has("position")
    ? Number(query.get("position"))
    : undefined;
  const tonic = name ? scaleKeyPitch(name, quality) : -1;
  return mergeGuitarScaleSettings(
    {
      tonic,
      quality,
      ...(tonic >= 0 ? { spelling: name } : {}),
      ...(pattern ? { pattern } : {}),
      ...(shift !== undefined ? { shift } : {}),
    },
    base,
  );
}
/** The unpublished preview used profiles.scales; upstream now reserves scales for theory. */
export function legacyGuitarScaleProfile(progress: unknown) {
  const profile = object(object(object(progress).profiles).scales);
  return Object.keys(profile).length > 0 ? profile : undefined;
}
