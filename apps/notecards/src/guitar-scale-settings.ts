import { choice, object } from "./exercise-settings";
import { SCALE_TONICS, type ScaleQuality } from "./guitar-scales";
export type GuitarScaleSettings = { tonic: number; quality: ScaleQuality };
export function mergeGuitarScaleSettings(
  input: unknown,
  base: GuitarScaleSettings = { tonic: 4, quality: "major" },
): GuitarScaleSettings {
  const source = object(input);
  return {
    tonic:
      typeof source.tonic === "number" &&
      Number.isInteger(source.tonic) &&
      source.tonic >= 0 &&
      source.tonic < 12
        ? source.tonic
        : base.tonic,
    quality: choice(source.quality, ["major", "minor"], base.quality),
  };
}
export function guitarScaleFromQuery(
  query: URLSearchParams,
  base: GuitarScaleSettings,
) {
  const quality = choice(query.get("scale"), ["major", "minor"], base.quality);
  const tonic = SCALE_TONICS[quality].findIndex((n) => n === query.get("key"));
  return mergeGuitarScaleSettings({ tonic, quality }, base);
}
/** The unpublished preview used profiles.scales; upstream now reserves scales for theory. */
export function legacyGuitarScaleProfile(progress: unknown) {
  const profile = object(object(object(progress).profiles).scales);
  return Object.keys(profile).length > 0 ? profile : undefined;
}
