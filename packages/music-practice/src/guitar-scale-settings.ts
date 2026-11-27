import {isMaqam} from "./maqamat";
import { BERKLEE_SHAPES, berkleeShift, type BerkleeShape } from "./berklee-scale-shapes";
import { choice, object } from "./exercise-settings";
import {
  SCALE_FRET_LIMIT,
  SCALE_TONICS,
  SCALE_QUALITIES,
  scaleKeyPitch,
  relativeScale,
  type ScaleQuality,
  type ScaleSelection,
} from "./guitar-scales";
import {
  SCALE_SHAPES,
  migratePattern,
  patternShift,
  relativePattern,
  type ScalePattern,
} from "./guitar-scale-patterns";
export type GuitarScaleSettings = ScaleSelection & {
  shapeSet?: "standard" | "hila";
  hilaShape?: BerkleeShape;
  pattern?: ScalePattern;
  shift?: number;
  labels?: "fingers" | "notes" | "none";
  wholeRoute?: boolean;
  firstFret?: number;
  lastFret?: number;
  returnPosition?: { pattern: ScalePattern; shift: number; tonic?: number; quality?: ScaleQuality; spelling?: string };
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
    quality: choice(source.quality, SCALE_QUALITIES, base.quality),
  };
  const patterns = ["map", ...SCALE_SHAPES] as const;
  const sourcePattern = migratePattern(source.pattern, settings.quality);
  const explicitPattern = patterns.includes(sourcePattern as ScalePattern);
  // Unspecified Western settings start in CAGED. Preserve explicit Berklee
  // selections and the meaning of saved patterns and legacy bookmarks.
  const defaultSet = explicitPattern
    ? "standard"
    : base.shapeSet || "standard";
  if ((!isMaqam(settings.quality) && !explicitPattern && base.pattern === undefined) || source.shapeSet !== undefined || base.shapeSet !== undefined)
    settings.shapeSet =
      !isMaqam(settings.quality)
        ? choice(
            source.shapeSet,
            ["standard", "hila"],
            defaultSet,
          )
        : "standard";
  if (source.hilaShape !== undefined || base.hilaShape !== undefined)
    settings.hilaShape = BERKLEE_SHAPES.includes(source.hilaShape as BerkleeShape)
      ? (source.hilaShape as BerkleeShape)
      : base.hilaShape || 1;
  if (source.labels !== undefined || base.labels !== undefined)
    settings.labels = choice(
      source.labels,
      ["fingers", "notes", "none"],
      base.labels || "fingers",
    );
  const validFret = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= SCALE_FRET_LIMIT;
  if (
    source.firstFret !== undefined ||
    source.lastFret !== undefined ||
    base.firstFret !== undefined ||
    base.lastFret !== undefined
  ) {
    settings.firstFret = validFret(source.firstFret)
      ? source.firstFret
      : validFret(base.firstFret)
        ? base.firstFret
        : 0;
    settings.lastFret = Math.max(
      1,
      settings.firstFret,
      validFret(source.lastFret)
        ? source.lastFret
        : validFret(base.lastFret)
          ? base.lastFret
          : 5,
    );
  }
  const pattern = choice(
    sourcePattern,
    patterns,
    base.pattern || "map",
  );
  if(source.wholeRoute!==undefined||base.wholeRoute!==undefined)
    settings.wholeRoute=(settings.shapeSet||'standard')==='standard'&&!isMaqam(settings.quality)&&
      (typeof source.wholeRoute==='boolean'?source.wholeRoute:!!base.wholeRoute);
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
  const previousTonic = previous.tonic === undefined ? settings.tonic : previous.tonic;
  const previousQuality = previous.quality === undefined ? settings.quality : previous.quality;
  if (
    !isMaqam(settings.quality) && patterns.includes(previous.pattern as ScalePattern) &&
    validShift(previous.shift) && typeof previousTonic === 'number' &&
    Number.isInteger(previousTonic) && previousTonic >= 0 && previousTonic < 12 &&
    SCALE_QUALITIES.includes(previousQuality as ScaleQuality) && !isMaqam(previousQuality as ScaleQuality)
  ) {
    const previousPattern = previous.pattern as ScalePattern;
    if (
      settings.shapeSet === "hila"
        ? berkleeShift(previousTonic, previousQuality as ScaleQuality, settings.hilaShape || 1, previous.shift) === previous.shift
        : previousPattern === "map"
        ? previous.shift === 0
        : patternShift(
            previousTonic,
            previousQuality as ScaleQuality,
            previousPattern,
            previous.shift,
          ) === previous.shift
    )
      settings.returnPosition = {
        pattern: previousPattern,
        shift: previous.shift,
        ...(previous.tonic !== undefined ? {tonic:previousTonic} : {}),
        ...(previous.quality !== undefined ? {quality:previousQuality as ScaleQuality} : {}),
        ...(typeof previous.spelling === 'string' && scaleKeyPitch(previous.spelling,previousQuality as ScaleQuality) === previousTonic ? {spelling:previous.spelling} : {}),
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
  if(isMaqam(settings.quality)){
    settings.shapeSet='standard'; settings.pattern='map'; settings.shift=0;
    settings.firstFret=Math.max(1,Math.min(14,settings.firstFret ?? 1));
    settings.lastFret=settings.firstFret+4;
    settings.labels=settings.labels ?? 'fingers';
    delete settings.returnPosition;
  }
  return settings;
}
/** Switch the tonal center as well as the region; preserve a durable way back. */
export function toggleRelativeScale(settings: GuitarScaleSettings): GuitarScaleSettings {
  const { returnPosition, ...current } = settings;
  if (returnPosition) return {
    ...current, ...returnPosition,
    tonic: returnPosition.tonic ?? current.tonic,
    quality: returnPosition.quality ?? current.quality,
    spelling: returnPosition.tonic === undefined && returnPosition.quality === undefined ? current.spelling : returnPosition.spelling,
  };
  const relative = relativeScale(current.tonic,current.quality,current.spelling);
  const cagedPattern = current.pattern && current.pattern !== 'map'
    ? relativePattern(current.pattern,current.quality) : '1';
  const pattern = current.shapeSet === "hila" ? current.pattern || "map" : cagedPattern;
  return {
    ...current, ...relative, spelling:relative.spelling, pattern,
    shift: current.shapeSet === "hila"
      ? berkleeShift(relative.tonic, relative.quality, current.hilaShape || 1, current.shift)
      : patternShift(relative.tonic,relative.quality,cagedPattern,current.shift),
    returnPosition:{tonic:current.tonic,quality:current.quality,pattern:current.pattern || 'map',shift:current.shift || 0,
      ...(current.spelling ? {spelling:current.spelling} : {})},
  };
}
export function guitarScaleFromQuery(
  query: URLSearchParams,
  base: GuitarScaleSettings,
) {
  const quality = choice(query.get("scale"), SCALE_QUALITIES, base.quality);
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
      ...(query.has("set") ? { shapeSet: query.get("set") === "berklee" ? "hila" : query.get("set") } : {}),
      ...(query.has("shape") ? { hilaShape: Number(query.get("shape")) } : {}),
      ...(query.has("from") ? { firstFret: Number(query.get("from")) } : {}),
      ...(query.has("to") ? { lastFret: Number(query.get("to")) } : {}),
      ...(query.has("labels") ? { labels: query.get("labels") } : {}),
      ...(query.has('link') ? {wholeRoute:query.get('link')==='all'} : {}),
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
