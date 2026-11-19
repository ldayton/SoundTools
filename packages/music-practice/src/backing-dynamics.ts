import type { BackingTake } from "./backing-plan-types";
import type { BackingPattern } from "./backing-patterns";
import type { BackingStyle, BackingSample } from "./backing-track-model";

/** Retain phrasing without the 8–13 LU swells measured in the original loops.
 * Cross-stick sections also use much quieter recordings/voicings; compensate
 * those textures independently. Nothing changes note timing or velocity/timbre.
 */
const sections: Record<BackingStyle, { retention: number; quietDb: number }> = {
  rock: { retention: 0.35, quietDb: 0.5 },
  blues: { retention: 0.35, quietDb: 1.5 },
  folk: { retention: 0.55, quietDb: 0 },
  country: { retention: 0.7, quietDb: 0 },
  gospel: { retention: 1, quietDb: 0 },
  reggae: { retention: 0.4, quietDb: 1 },
  funk: { retention: 0.35, quietDb: 8 },
  soul: { retention: 0.2, quietDb: 4.5 },
};
export function levelBackingSections(
  take: BackingTake,
  pattern?: BackingPattern,
): BackingTake {
  const profile = sections[take.plan.style];
  const retention = pattern === "strummed" ? 0.8 : profile.retention;
  return {
    ...take,
    events: take.events.map((event) => {
      const bar =
        take.plan.bars[
          Math.min(take.plan.bars.length - 1, Math.floor(event.beat / 4))
        ];
      const db = Math.max(
        -6,
        Math.min(
          12,
          -bar.db * (1 - retention) +
            (bar.texture === "crossstick" ? profile.quietDb : 0),
        ),
      );
      return { ...event, level: event.level * 10 ** (db / 20) };
    }),
  };
}

type Dynamics = {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
};
export function backingSampleDynamics(
  sample: BackingSample,
): Dynamics | undefined {
  if (sample.release || sample.part === "percussion") return;
  if (sample.part === "drums")
    return { threshold: -18, ratio: 3, attack: 0.001, release: 0.06 };
  if (sample.part === "bass")
    return { threshold: -28, ratio: 2.5, attack: 0.008, release: 0.16 };
  if (sample.instrument === "electric-twang")
    return { threshold: -37, ratio: 2.5, attack: 0.004, release: 0.12 };
  if (sample.instrument === "acoustic-steel")
    return { threshold: -32, ratio: 2, attack: 0.004, release: 0.12 };
  if (sample.part === "keys")
    return { threshold: -28, ratio: 2, attack: 0.006, release: 0.18 };
  if (sample.part === "guitar")
    return { threshold: -30, ratio: 2, attack: 0.004, release: 0.12 };
}

/** Deterministic stereo-linked RMS compression once after decode, not in the
 * render callback. Measure after the recording's gain trim; no automatic makeup
 * or noise-floor boost. Original recordings and velocity layers remain intact.
 */
export function compressBackingSample(
  buffer: AudioBuffer,
  sample: BackingSample,
) {
  const profile = backingSampleDynamics(sample);
  if (!profile) return buffer;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    buffer.getChannelData(ch),
  );
  const detector = Math.exp(-1 / (buffer.sampleRate * 0.004));
  const attack = Math.exp(-1 / (buffer.sampleRate * profile.attack));
  const release = Math.exp(-1 / (buffer.sampleRate * profile.release));
  const slope = 1 / profile.ratio - 1,
    knee = 6;
  let power = 0,
    gain = 1;
  for (let frame = 0; frame < buffer.length; frame++) {
    let instant = 0;
    for (const channel of channels)
      instant += (channel[frame] * sample.gain) ** 2 / channels.length;
    power = detector * power + (1 - detector) * instant;
    const over = 10 * Math.log10(Math.max(1e-12, power)) - profile.threshold;
    const db =
      over <= -knee / 2
        ? 0
        : over >= knee / 2
          ? slope * over
          : (slope * (over + knee / 2) ** 2) / (2 * knee);
    const target = 10 ** (db / 20),
      smoothing = target < gain ? attack : release;
    gain = smoothing * gain + (1 - smoothing) * target;
    for (const channel of channels) channel[frame] *= gain;
  }
  return buffer;
}
