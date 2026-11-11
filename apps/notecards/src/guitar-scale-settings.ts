import { choice, object } from "./exercise-settings";
import {
  SCALE_TONICS,
  scaleKeyPitch,
  type ScaleSelection,
} from "./guitar-scales";
export type GuitarScaleSettings = ScaleSelection;
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
  const tonic = name ? scaleKeyPitch(name, quality) : -1;
  return mergeGuitarScaleSettings(
    { tonic, quality, ...(tonic >= 0 ? { spelling: name } : {}) },
    base,
  );
}
/** The unpublished preview used profiles.scales; upstream now reserves scales for theory. */
export function legacyGuitarScaleProfile(progress: unknown) {
  const profile = object(object(object(progress).profiles).scales);
  return Object.keys(profile).length > 0 ? profile : undefined;
}
