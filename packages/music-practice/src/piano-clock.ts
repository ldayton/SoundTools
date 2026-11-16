/** Audio render time is ahead of what reaches the speakers. Keep visuals on the heard clock. */
export function audiblePianoTime(
  source: {
    currentTime: number;
    baseLatency?: number;
    outputLatency?: number;
    getOutputTimestamp?: () => {
      contextTime?: number;
      performanceTime?: number;
    };
  },
  now: number,
): number {
  const stamp = source.getOutputTimestamp?.();
  const heard =
    stamp && (stamp.contextTime ?? 0) > 0 && (stamp.performanceTime ?? 0) > 0
      ? stamp.contextTime! + Math.max(0, now - stamp.performanceTime!) / 1000
      : source.currentTime -
        (source.baseLatency || 0) -
        (source.outputLatency || 0);
  return Math.max(0, Math.min(source.currentTime, heard));
}
