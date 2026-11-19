import type { GenreDefinition } from "./backing-genres";
import type { BackingMode } from "./backing-track-model";

/** Factory trims calibrated near -24 LUFS; see docs/backing-loudness.md.
 * Post-compression loudness trims; the app's master fader follows these and
 * the peak protection. Separate feels retain balance when the band gets busier.
 */
const gains: Record<
  GenreDefinition["instrumentation"]["mix"],
  number | Record<BackingMode, number>
> = {
  "approved-drum-forward": 1,
  "roots-room": { steady: 0.803345, active: 0.776072 },
  "blues-room": { steady: 1.229991, active: 1.188234 },
  "intimate-acoustic": { steady: 1.380072, active: 1.380072 },
  "strummed-acoustic": { steady: 1.840356, active: 1.840356 },
  "dry-country": { steady: 1.819291, active: 1.819291 },
  "gospel-room": { steady: 0.660544, active: 0.602424 },
  "dry-reggae": { steady: 2.017911, active: 1.927091 },
  "dry-funk": { steady: 0.907803, active: 0.928949 },
  "warm-soul": { steady: 0.907804, active: 0.763822 },
};
export function backingMixGain(
  profile: GenreDefinition["instrumentation"]["mix"],
  mode: BackingMode = "steady",
) {
  const gain = gains[profile];
  return typeof gain === "number" ? gain : gain[mode];
}
