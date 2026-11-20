import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
  waitForServer,
} from "../../../scripts/ci/browser-harness.cjs";
const { values } = parseArgs({
  options: {
    output: { type: "string", default: "work/backing-loudness" },
    styles: { type: "string", default: "*" },
    patterns: { type: "string", default: "*" },
    keys: { type: "string", default: "0" },
    qualities: { type: "string", default: "major,minor" },
    modes: { type: "string", default: "steady,active" },
    tempos: { type: "string", default: "genre" },
    excerpts: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    "scale-harmony": { type: "boolean", default: false },
    "gospel-phrases": { type: "boolean", default: false },
    "folk-fingerstyle-ab": { type: "boolean", default: false },
    "save-excerpts": { type: "boolean", default: false },
    "reference-arranger": { type: "boolean", default: false },
  },
});
if (values["gospel-phrases"]) {
  values.styles = "gospel";
  values["scale-harmony"] = true;
  values.excerpts = true;
}
if (values["folk-fingerstyle-ab"]) {
  assert.ok(!values["gospel-phrases"], "Choose one audition mode");
  values.styles = "folk";
  values["scale-harmony"] = true;
  values.excerpts = true;
}
if (values["save-excerpts"]) {
  values.excerpts = true;
  values["scale-harmony"] = true;
}
const keys = values.keys.split(",").map(Number),
  qualities = values.qualities.split(","),
  modes = values.modes.split(",");
assert.ok(
  keys.every((k) => Number.isInteger(k) && k >= 0 && k < 12) &&
    qualities.every((q) => ["major", "minor"].includes(q)) &&
    modes.every((m) => ["steady", "active"].includes(m)),
  "Invalid calibration matrix",
);
const tempos =
  values.tempos === "genre" ? undefined : values.tempos.split(",").map(Number);
assert.ok(
  !tempos || tempos.every((t) => Number.isFinite(t) && t >= 50 && t <= 180),
  "Tempos must be between 50 and 180 BPM",
);
const output = pathToFileURL(resolve(values.output) + "/");
await mkdir(output, { recursive: true });
const reservation = createServer();
await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((r, j) => reservation.close((e) => (e ? j(e) : r())));
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: new URL("../", import.meta.url), stdio: "ignore" },
);
const source =
  "/@fs" +
  new URL("../../../packages/music-practice/src/", import.meta.url).pathname;
const configurations = [
  ["rock", "standard", 100],
  ["blues", "standard", 90],
  ["folk", "fingerpicked", 88],
  ["folk", "strummed", 88],
  ["country", "two-step", 104],
  ["gospel", "standard", 76],
  ["reggae", "standard", 78],
  ["funk", "standard", 104],
  ["soul", "standard", 84],
] as const;
const rows: any[] = [];
let browser;
// FFmpeg's EBU R128 and reconstructed-peak meters validate rendered browser audio.
function meter(pcm: Buffer) {
  const h = Buffer.alloc(44);
  h.write("RIFF");
  h.writeUInt32LE(pcm.length + 36, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24);
  h.writeUInt32LE(384000, 28);
  h.writeUInt16LE(8, 32);
  h.writeUInt16LE(32, 34);
  h.writeUInt32LE(pcm.length, 40);
  h.write("data", 36);
  const process = spawnSync(
    globalThis.process.env.FFMPEG_BIN || "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      "pipe:0",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    {
      input: Buffer.concat([h, pcm]),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.equal(process.status, 0, process.error?.message || process.stderr);
  const result = process.stderr;
  const summary = result.slice(result.lastIndexOf("Summary:"));
  const frames = [
    ...result.matchAll(/t:\s*([\d.]+).*?M:\s*([-\d.]+)\s+S:\s*([-\d.]+)/g),
  ].map((m) => ({ t: +m[1], m: +m[2], s: +m[3] }));
  const shorts = frames
    .filter((f) => f.t >= 3 && f.s > -100)
    .map((f) => f.s)
    .sort((a, b) => a - b);
  const q = (p: number) => shorts[Math.floor((shorts.length - 1) * p)];
  const lufs = Number(summary.match(/I:\s*([-\d.]+) LUFS/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s*([-\d.]+) dBFS/)?.[1]);
  assert.ok(
    Number.isFinite(lufs) && Number.isFinite(truePeak) && shorts.length > 0,
    summary,
  );
  return {
    lufs,
    truePeak,
    lra: Number(summary.match(/LRA:\s*([-\d.]+) LU/)?.[1]),
    plr: truePeak - lufs,
    maxShort: Math.max(...shorts),
    maxMomentary: Math.max(...frames.map((f) => f.m)),
    short10: q(0.1),
    short50: q(0.5),
    short90: q(0.9),
    shortSpread: q(0.9) - q(0.1),
    opening: frames
      .filter((f) => f.t >= 3 && f.t <= 10)
      .reduce((sum, f, _, a) => sum + f.s / a.length, 0),
  };
}
try {
  await waitForServer(`http://127.0.0.1:${port}`, { server });
  browser = await launchBrowser();
  const page = await newPage(browser, {
    viewport: { width: 1680, height: 1050 },
  });
  await page.addInitScript(() => {
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (
        !(this.context instanceof OfflineAudioContext) &&
        args[0] === this.context.destination
      ) {
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(mute, this.context.destination);
        return connect.call(this, mute);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(`http://127.0.0.1:${port}/guitar/scales?key=C&scale=major`);
  await page.exposeFunction("startLoudnessAudit", async () => {
    await page.locator("#loudness-start").click();
  });
  for (const [style, pattern, defaultTempo] of configurations.filter(
    ([id, pattern]) =>
      (values.styles === "*" || values.styles.split(",").includes(id)) &&
      (!values["folk-fingerstyle-ab"] || pattern === "fingerpicked") &&
      (values.patterns === "*" || values.patterns.split(",").includes(pattern)),
  ))
    for (const tempo of tempos ?? [defaultTempo])
      for (const quality of qualities)
        for (const tonic of keys)
          for (const mode of modes) {
            console.log("AUDIT", style, pattern, quality, tonic, mode);
            await page.evaluate(
              async ({
                source,
                style,
                pattern,
                tempo,
                mode,
                quality,
                tonic,
                scaleHarmony,
              }) => {
                const { BackingTrackPlayer } = await import(
                  /* @vite-ignore */ source + "backing-track-audio.ts"
                );
                const p: any = new BackingTrackPlayer();
                p.setStyle(style);
                p.setPattern(pattern);
                p.setKey(
                  tonic,
                  String(tonic),
                  quality,
                  scaleHarmony ? quality : undefined,
                );
                p.setMode(mode);
                p.setTempo(tempo);
                p.resetMixer();
                const ready = new Promise<void>((r, j) => {
                  const b = document.createElement("button");
                  b.id = "loudness-start";
                  b.textContent = "Start audio audit";
                  b.style.cssText =
                    "position:fixed;top:0;left:0;z-index:100000";
                  b.onclick = () =>
                    void p.play().then(() => {
                      b.remove();
                      r();
                    }, j);
                  document.body.appendChild(b);
                });
                await (window as any).startLoudnessAudit();
                await ready;
                if (p.model.getSnapshot().status !== "playing")
                  throw Error(JSON.stringify(p.model.getSnapshot()));
                const live = p.context;
                p.pauseAll();
                await new Promise((r) => setTimeout(r, 100));
                (window as any).__loudness = { p, live };
              },
              {
                source,
                style,
                pattern,
                tempo,
                mode,
                quality,
                tonic,
                scaleHarmony: values["scale-harmony"],
              },
            );
            const variants = values["folk-fingerstyle-ab"]
              ? ["A", "B"]
              : values["gospel-phrases"]
                ? [32, 64].flatMap((from) =>
                    [
                      "mix",
                      "organ",
                      "piano",
                      "bass",
                      "drums",
                      "percussion",
                    ].map((stem) => `${from}:${stem}`),
                  )
                : [
                    values["save-excerpts"]
                      ? "preview"
                      : values.excerpts
                        ? "excerpt100"
                        : "full",
                  ];
            for (const variant of variants) {
              const r = await page.evaluate(
                async ({
                  source,
                  variant,
                  tempo,
                  folkAudition,
                  referenceArranger,
                }) => {
                  const { backingAudioGraph } = await import(
                    /* @vite-ignore */ source + "backing-performance.ts"
                  );
                  const p = (window as any).__loudness.p;
                  let take = p.take();
                  if (folkAudition || referenceArranger) {
                    const { referenceGenreBackingArrangement } = await import(
                      /* @vite-ignore */ source + "backing-genre-engine.ts"
                    );
                    const state = p.model.getSnapshot();
                    take = referenceGenreBackingArrangement(
                      state.style,
                      state.mode,
                      state.quality,
                      0,
                      state.tempo,
                      state.tonic,
                      state.pattern,
                      state.quality,
                    );
                  }
                  if (folkAudition && variant === "B") {
                    const { folkFingerstyleTake } = await import(
                      /* @vite-ignore */ source + "backing-folk-phrases.ts"
                    );
                    take = folkFingerstyleTake(take);
                  }
                  const phraseRender = variant.includes(":"),
                    [start, stem] = variant.split(":"),
                    from =
                      variant === "preview" &&
                      p.model.getSnapshot().style === "blues"
                        ? 48
                        : folkAudition
                          ? 32
                          : phraseRender
                            ? Number(start)
                            : variant === "full"
                              ? 0
                              : 32,
                    to =
                      variant === "preview"
                        ? from +
                          (p.model.getSnapshot().style === "blues" ? 48 : 32)
                        : folkAudition
                          ? 96
                          : phraseRender
                            ? from + 32
                            : variant === "full"
                              ? take.beats
                              : 64,
                    seconds = ((to - from) * 60) / tempo + 0.5;
                  const c = new OfflineAudioContext(
                      2,
                      Math.ceil(seconds * 48000),
                      48000,
                    ),
                    graph = backingAudioGraph(
                      c,
                      p.pack.levels,
                      p.mixProfile,
                      p.model.getSnapshot().mode,
                    );
                  graph.output.gain.value = variant === "excerpt50" ? 0.5 : 1;
                  p.context = c;
                  p.buses = graph.buses;
                  p.voices.clear();
                  p.counter.clear();
                  p.lastDrumFile.clear();
                  for (const e of take.events) {
                    if (
                      phraseRender &&
                      stem !== "mix" &&
                      (stem === "organ"
                        ? e.instrument !== "tonewheel-organ"
                        : stem === "piano"
                          ? e.instrument !== "acoustic-piano"
                          : e.part !== stem)
                    )
                      continue;
                    if (e.beat >= from && e.beat < to)
                      p.sound(e, ((e.beat - from) * 60) / tempo);
                    else if (
                      ["bass", "guitar", "keys"].includes(e.part) &&
                      e.beat < from &&
                      e.beat + e.duration > from
                    )
                      p.sound(e, 0, false, from - e.beat);
                  }
                  const audio = await c.startRendering(),
                    pcm = new Uint8Array(audio.length * 8),
                    view = new DataView(pcm.buffer);
                  let peak = 0;
                  for (let ch = 0; ch < 2; ch++)
                    for (let i = 0; i < audio.length; i++) {
                      const n = audio.getChannelData(ch)[i];
                      if (!Number.isFinite(n)) throw Error("Nonfinite audio");
                      peak = Math.max(peak, Math.abs(n));
                      view.setFloat32(i * 8 + ch * 4, n, true);
                    }
                  let encoded = "";
                  for (let i = 0; i < pcm.length; i += 16384)
                    encoded += String.fromCharCode(
                      ...pcm.subarray(i, i + 16384),
                    );
                  return {
                    pcm: btoa(encoded),
                    seconds: audio.duration,
                    peak,
                    phrasing: take.phrasing,
                    phraseId: phraseRender
                      ? take.phraseIds?.[Math.floor(from / 32)]
                      : undefined,
                    stem: phraseRender ? stem : undefined,
                  };
                },
                {
                  source,
                  variant,
                  tempo,
                  folkAudition: values["folk-fingerstyle-ab"],
                  referenceArranger: values["reference-arranger"],
                },
              );
              const { pcm, ...render } = r,
                row = {
                  style,
                  pattern,
                  mode,
                  quality,
                  tonic,
                  variant,
                  tempo,
                  ...render,
                  silent: render.peak === 0,
                  ...(render.peak === 0
                    ? { lufs: -Infinity, truePeak: -Infinity, lra: 0 }
                    : meter(Buffer.from(pcm, "base64"))),
                };
              assert.ok(
                !row.silent ||
                  (values["gospel-phrases"] &&
                    row.stem === "percussion" &&
                    mode === "steady"),
                "Only the intentionally resting Steady tambourine may be silent",
              );
              if (
                values["gospel-phrases"] ||
                values["folk-fingerstyle-ab"] ||
                values["save-excerpts"]
              ) {
                if (values["gospel-phrases"])
                  assert.ok(
                    row.phraseId,
                    "production must select an authored phrase",
                  );
                const conversion = spawnSync(
                  globalThis.process.env.FFMPEG_BIN || "ffmpeg",
                  [
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "f32le",
                    "-ar",
                    "48000",
                    "-ac",
                    "2",
                    "-i",
                    "pipe:0",
                    "-c:a",
                    "pcm_s16le",
                    new URL(
                      values["save-excerpts"]
                        ? `${style}-${pattern}-${quality}-${mode}-${tonic}-${tempo}.wav`
                        : values["folk-fingerstyle-ab"]
                          ? `folk-fingerstyle-${quality}-${mode}-${tonic}-${tempo}-${variant}.wav`
                          : `${row.phraseId}-${tonic}-${tempo}-${row.stem}.wav`,
                      output,
                    ).pathname,
                  ],
                  { input: Buffer.from(pcm, "base64"), encoding: "utf8" },
                );
                assert.equal(conversion.status, 0, conversion.stderr);
              }
              rows.push(row);
              console.log(JSON.stringify(row));
              await writeFile(
                new URL("metrics.json", output),
                JSON.stringify(
                  {
                    sampleRate: 48000,
                    scaleHarmony: values["scale-harmony"],
                    referenceArranger: values["reference-arranger"],
                    keys,
                    qualities,
                    tempos: tempos ?? "genre defaults",
                    mixer: "genre defaults",
                    master: "100%",
                    rows,
                  },
                  null,
                  2,
                ) + "\n",
              );
            }
            await page.evaluate(() => {
              const { p, live } = (window as any).__loudness;
              p.context = live;
              p.dispose();
              delete (window as any).__loudness;
            });
          }
  assert.ok(rows.length, "No configurations selected");
  if (values.check)
    for (const row of rows) {
      assert.ok(
        row.truePeak <= -1.5,
        `True peak exceeded: ${JSON.stringify(row)}`,
      );
      if (!values.excerpts) {
        assert.ok(
          Math.abs(row.lufs + 24) <= 1,
          `Loudness target missed: ${JSON.stringify(row)}`,
        );
        assert.ok(
          row.lra <= 7,
          `Loudness range exceeded: ${JSON.stringify(row)}`,
        );
      }
    }
  console.log(
    "PASS current-arrangement loudness audit",
    rows.length,
    "renders",
  );
} catch (e) {
  await captureFailure(browser, e);
  throw e;
} finally {
  await closeBrowser(browser);
  server.kill();
}
