/** Shared by live playback, level measurement and offline listening comparisons. */
export function performanceEnvelope(param: AudioParam, level: number, start: number, end: number, release: number, endGain = 1) {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(level, start + 0.005);
  if (endGain < 1) {
    param.setValueAtTime(level, Math.max(start + 0.005, start + (end - start) * 0.6));
    param.linearRampToValueAtTime(level * Math.max(0, endGain), end);
  } else param.setValueAtTime(level, end);
  param.linearRampToValueAtTime(0, end + release);
}
