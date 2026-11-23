import choirManifest from "./assets/songalong-choir/manifest.json";
import choirNotice from "./assets/songalong-choir/NOTICE.txt?url";
import choirAudit from "./assets/songalong-choir/source-sha256.json?url";
import organManifest from "./assets/songalong-organ/manifest.json";
import organNotice from "./assets/songalong-organ/NOTICE.txt?url";
import organAudit from "./assets/songalong-organ/source-sha256.json?url";
import guitarManifest from "./assets/backing-folk-country/manifest.json";
import { pianoLayer, type PlaybackInstrument } from "./playback-performance";
import pianoNotice from "./assets/songalong-piano/NOTICE.txt?url";
import pianoAudit from "./assets/songalong-piano/source-sha256.json?url";
import guitarNotice from "./assets/backing-folk-country/NOTICE.txt?url";
import guitarAudit from "./assets/backing-folk-country/source-sha256.json?url";
// Retain provenance in the same fingerprinted, verified offline pack as the recordings.
export const playbackCredits = [
  pianoNotice,
  pianoAudit,
  guitarNotice,
  guitarAudit,
  organNotice,
  organAudit,
  choirNotice,
  choirAudit,
];
const pianoFiles = import.meta.glob<string>("./assets/songalong-piano/*.flac", {
  eager: true,
  query: "?url",
  import: "default",
});
const guitarFiles = import.meta.glob<string>(
  [
    "./assets/backing-folk-country/acoustic-*.flac",
    "./assets/backing-soul-folk/folk-steel-*.flac",
  ],
  { eager: true, query: "?url", import: "default" },
);
export type PlaybackSample = {
  url: string;
  pitch: number;
  layer: number;
  string?: number;
  low?: number;
  high?: number;
  loopStart?: number;
  loopEnd?: number;
};
const organFiles = import.meta.glob<string>("./assets/songalong-organ/*.flac", {
  eager: true,
  query: "?url",
  import: "default",
});
const choirFiles = import.meta.glob<string>("./assets/songalong-choir/*.flac", {
  eager: true,
  query: "?url",
  import: "default",
});
const choir: PlaybackSample[] = choirManifest.samples.map((sample) => {
  const file = Object.keys(choirFiles).find((path) =>
    path.endsWith("/" + sample.file),
  );
  if (!file) throw Error(`Missing choir recording: ${sample.file}`);
  return { ...sample, url: choirFiles[file], layer: 0 };
});
const organ: PlaybackSample[] = organManifest.samples.map((sample) => {
  const file = Object.keys(organFiles).find((path) =>
    path.endsWith("/" + sample.file),
  );
  if (!file) throw Error(`Missing organ recording: ${sample.file}`);
  return { ...sample, url: organFiles[file], layer: 0 };
});
const piano: PlaybackSample[] = Object.entries(pianoFiles).map(
  ([file, url]) => {
    const [, pitch, layer] = file.match(/\/(\d+)-v(\d+)\.flac$/)!;
    return { url, pitch: Number(pitch), layer: Number(layer) };
  },
);
const guitar: PlaybackSample[] = Object.values(guitarManifest.samples)
  .filter((s) => s.instrument === "acoustic-steel")
  .map((s) => {
    const path = Object.keys(guitarFiles).find((path) =>
      path.endsWith("/" + s.file),
    );
    if (!path) throw Error(`Missing guitar recording: ${s.file}`);
    return {
      url: guitarFiles[path],
      pitch: s.note,
      layer: s.velocity,
      string: (s as typeof s & { string: number }).string,
    };
  });
export function playbackSample(
  instrument: PlaybackInstrument,
  pitch: number,
  volume: number,
  string?: number,
): PlaybackSample {
  const layer =
    instrument === "organ" || instrument === "choir"
      ? 0
      : instrument === "piano"
        ? pianoLayer(volume)
        : volume < 0.55
          ? 40
          : 72;
  const bank = (
    instrument === "choir"
      ? choir
      : instrument === "organ"
        ? organ
        : instrument === "piano"
          ? piano
          : guitar
  ).filter((s) => s.layer === layer);
  const zone =
    instrument === "organ" || instrument === "choir"
      ? bank.find((s) => pitch >= s.low! && pitch <= s.high!)
      : undefined;
  if (zone) return zone;
  return bank.reduce((best, s) => {
    const cost = (n: PlaybackSample) =>
      Math.abs(n.pitch - pitch) +
      (string !== undefined && n.string !== string ? 100 : 0);
    return cost(s) < cost(best) ? s : best;
  });
}
export function playbackSamplesFor(
  instrument: PlaybackInstrument,
  pitches: number[],
) {
  const samples = new Map<string, PlaybackSample>();
  for (const pitch of new Set(pitches))
    for (const volume of [0.3, 0.6, 0.9])
      for (const string of instrument === "guitar"
        ? [0, 1, 2, 3, 4, 5]
        : [undefined]) {
        const sample = playbackSample(instrument, pitch, volume, string);
        samples.set(sample.url, sample);
      }
  return [...samples.values()];
}
