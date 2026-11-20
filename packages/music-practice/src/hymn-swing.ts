import type { AudioTracks } from "abcjs";

/** A conventional Swing indication affects performance, not written note values. */
export function hasSwing(abc: string): boolean {
  return /^Q:\s*"Swing"\s*$/m.test(abc);
}

/** Quarter-note beats stay fixed; each eighth-note offbeat moves to two-thirds. */
export function swingBeat(beat: number): number {
  const whole = Math.floor(beat);
  const fraction = beat - whole;
  return whole + (fraction <= 0.5 ? fraction * 4 / 3 : 2 / 3 + (fraction - 0.5) * 2 / 3);
}

const swung = new WeakSet<AudioTracks>();
export function swingAudio(audio: AudioTracks, enabled: boolean): AudioTracks {
  if (!enabled || swung.has(audio)) return audio;
  const result: AudioTracks = {
    ...audio,
    tracks: audio.tracks.map(track => track.map(item => {
      if (item.cmd !== "note") return item;
      const start = swingBeat(item.start * 4) / 4;
      const end = swingBeat((item.start + item.duration) * 4) / 4;
      return { ...item, start, duration: end - start };
    })),
  };
  swung.add(result);
  return result;
}
