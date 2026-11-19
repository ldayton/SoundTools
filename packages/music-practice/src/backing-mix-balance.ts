import type { GenreDefinition } from "./backing-genres";

/** Constant post-limiter trims, calibrated from both feels and scale qualities.
 * Approximate -24 LUFS at the settled section; retain each style's dynamics.
 * Full Active arrangements were checked with extra interpolation headroom.
 * Folk strumming has its own trim because it shares recordings with picking.
 */
const gains: Record<GenreDefinition["instrumentation"]["mix"], number> = {
  "approved-drum-forward": 1,
  "roots-room": 0.60256,
  "blues-room": 0.881049,
  "intimate-acoustic": 0.749894,
  "strummed-acoustic": 1.035142,
  "dry-country": 0.954993,
  "gospel-room": 0.451856,
  "dry-reggae": 1.28825,
  "dry-funk": 0.749894,
  "warm-soul": 0.732825,
};
export function backingMixGain(
  profile: GenreDefinition["instrumentation"]["mix"],
) {
  return gains[profile];
}
