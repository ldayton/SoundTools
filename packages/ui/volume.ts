/** Preserve saved dB values; only the user-facing scale is normalized. */
export const volumePercent = (db: number) =>
  db <= -60 ? 0 : Math.max(1, Math.round(100 * 10 ** (db / 20)));
export const volumeDecibels = (percent: number) =>
  percent <= 0
    ? -60
    : Math.min(0, 20 * Math.log10(Math.min(100, percent) / 100));
