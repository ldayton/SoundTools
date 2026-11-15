/** Contracts at the existing model/UI boundary; these are not another settings owner. */
export type PitchBand = { name: string; low: number; high: number; colour: string };
export type PitchValues = {
  ranges: PitchBand[];
  minimum: number; maximum: number; history: number;
  targetLow: number; targetHigh: number;
  confirmationMs: number; voicingCeiling: number; confidence: number;
  outlineWidth: number; lineWidth: number; markerRadius: number;
  samplingMs: number; gapMs: number; jumpCents: number; cornerRadius: number;
  axis: string; smoothing: string; method: string; drawing: string;
  edgeExtension: string; aggregation: string; markers: string; bandMode: string;
  speechGate: boolean; breakUnconfirmedJumps: boolean; bridgeUnvoiced: boolean; bands: boolean;
};
export type PitchKey = keyof PitchValues;
export type PitchEdit = <K extends PitchKey>(field: K, value: PitchValues[K]) => boolean;
export type NumericPitchKey = { [K in PitchKey]: PitchValues[K] extends number ? K : never }[PitchKey];
export type PitchLimits = Record<NumericPitchKey, { min: number; max: number; step: number }>;
export type WorkspaceState = {
  active: "spectrogram" | "pitch";
  pitch: PitchValues;
  selected: string;
  presets: { id: string; name: string; settings: PitchValues }[];
};
export type PitchModel = {
  pitch(input?: Partial<PitchValues>): PitchValues;
  changed(state: WorkspaceState, values: PitchValues): WorkspaceState;
  choose(state: WorkspaceState, id: string): WorkspaceState;
  save(state: WorkspaceState, name: string, id: string): WorkspaceState;
  remove(state: WorkspaceState): WorkspaceState;
};
export const displayControlIds = ["maximum", "scale", "history"] as const;
export const colourControlIds = ["palette", "gain", "floor", "colourLevels", "fixedMaximum", "suppression", "preemphasis", "compression"] as const;
export const formantControlIds = ["formants", "formantSmoothing", "formantFiltering", "formantCeiling"] as const;
export const analysisControlIds = ["window", "windowShape", "analysisRate", "frameStep", "fftPadding", "removeDC", "spectrumUnits", "resampling", "resampleQuality"] as const;
export const advancedColourIds = ["normalizationClock", "interpolation", "frameInterpolation", "peakSeconds", "peakDecay"] as const;
export const settingIds = [...displayControlIds, ...colourControlIds, ...formantControlIds, ...analysisControlIds, ...advancedColourIds] as const;
export type SettingId = typeof settingIds[number];
export type SpectrogramValues = Record<SettingId, string>;
export type SettingRegistry = Record<SettingId, { default: string; values?: readonly string[]; min?: number; max?: number; step?: number }>;
export type SpectrogramEdit = (id: SettingId, value: string) => void;
