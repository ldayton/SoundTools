/** Render equal-duration A/B excerpts; only B applies the experimental phrasing. */
import { chromium } from "playwright";
import { createServer, type AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  output = process.argv[2];
if (!output)
  throw Error("Usage: tsx scripts/render-backing-ab.mts OUTPUT_DIRECTORY");
await mkdir(output, { recursive: true });
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const reservation = createServer();
await new Promise<void>((resolve) =>
  reservation.listen(0, "127.0.0.1", resolve),
);
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: resolve(root, "apps/notewise"), stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  await page.goto(base + "/guitar/scales?key=A&scale=minor");
  const moduleUrl =
      "/@fs" +
      resolve(root, "packages/music-practice/src/backing-track-audio.ts"),
    metadata = [];
  for (const style of ["blues", "rock"])
    for (const tempo of process.argv[3] === "modes" ? [90] : [72, 120])
      for (const mode of process.argv[3] === "modes"
        ? ["steady", "active"]
        : ["active"]) {
        const quality = style === "blues" ? "minor" : "major";
        console.log("Rendering pair", style, mode, tempo);
        const results = await page.evaluate(
          async ({ moduleUrl, style, quality, tempo, mode }) => {
            const { BackingTrackPlayer } = await import(
              /* @vite-ignore */ moduleUrl
            );
            const { practiceBackingArrangement } = await import(
              /* @vite-ignore */ moduleUrl.replace(
                "backing-track-audio.ts",
                "backing-phrasing.ts",
              )
            );
            const { plannedBackingArrangement } = await import(
              /* @vite-ignore */ moduleUrl.replace(
                "backing-track-audio.ts",
                "backing-musical-plan.ts",
              )
            );
            const { backingAudioGraph } = await import(
              /* @vite-ignore */ moduleUrl.replace(
                "backing-track-audio.ts",
                "backing-performance.ts",
              )
            );
            const { backingPack } = await import(
              /* @vite-ignore */ moduleUrl.replace(
                "backing-track-audio.ts",
                "backing-track-model.ts",
              )
            );
            const a = practiceBackingArrangement(
                style,
                mode,
                quality,
                0,
                tempo,
              ),
              b = plannedBackingArrangement(style, mode, quality, 0, tempo, 9);
            const from = (style === "blues" ? 12 : 8) * 4,
              to = from + 24 * 4,
              lead = 8,
              start = from - lead;
            const output = [];
            for (const [variant, take] of [
              ["A", a],
              ["B", b],
            ] as const) {
              const p: any = new BackingTrackPlayer(variant === "B");
              p.setKey(9, "A", quality);
              p.setStyle(style);
              p.setMode(mode);
              await p.play();
              if (p.model.getSnapshot().status !== "playing")
                throw Error("Sample loading failed");
              const live = p.context;
              p.pauseAll();
              await new Promise((r) => setTimeout(r, 100));
              const unique = new Set(p.buffers.values());
              const bufferBytes = [...unique].reduce(
                (sum: any, x: any) => sum + x.length * x.numberOfChannels * 4,
                0,
              );
              p.counter.clear();
              p.voices.clear();
              const offline = new OfflineAudioContext(
                2,
                Math.ceil((((to - start) * 60) / tempo + 2) * 48000),
                48000,
              );
              p.context = offline;
              p.buses = backingAudioGraph(offline, p.pack.levels).buses;
              p.model.set({ ...p.model.getSnapshot(), style, quality, tempo });
              for (const e of take.events) {
                if (e.beat >= start && e.beat < to)
                  p.sound(e, ((e.beat - start) * 60) / tempo);
                else if (
                  (e.part === "guitar" || e.part === "bass") &&
                  e.beat < start &&
                  e.beat + e.duration > start
                )
                  p.sound(e, 0, false, start - e.beat);
              }
              const rendered = await offline.startRendering(),
                offset = Math.round(((lead * 60) / tempo) * 48000),
                left = rendered.getChannelData(0).subarray(offset),
                right = rendered.getChannelData(1).subarray(offset);
              let peak = 0,
                sum = 0;
              for (let i = 0; i < left.length; i++) {
                peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
                sum += left[i] ** 2 + right[i] ** 2;
              }
              const gain = Math.min(1, 0.95 / peak),
                pcm = new Uint8Array(left.length * 4),
                view = new DataView(pcm.buffer);
              for (let i = 0; i < left.length; i++) {
                view.setInt16(
                  i * 4,
                  Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767),
                  true,
                );
                view.setInt16(
                  i * 4 + 2,
                  Math.round(
                    Math.max(-1, Math.min(1, right[i] * gain)) * 32767,
                  ),
                  true,
                );
              }
              let encoded = "";
              for (let i = 0; i < pcm.length; i += 16384)
                encoded += String.fromCharCode(...pcm.subarray(i, i + 16384));
              const selected = take.events.filter(
                (e) => e.beat >= from && e.beat < to,
              );
              output.push({
                variant,
                bufferBytes,
                pcm: btoa(encoded),
                peak,
                gain,
                seconds: left.length / 48000,
                rmsDb:
                  20 * Math.log10(Math.sqrt(sum / (2 * left.length)) * gain),
                notes: Object.fromEntries(
                  ["drums", "percussion", "bass", "guitar"].map((part) => [
                    part,
                    selected.filter((e) => e.part === part).length,
                  ]),
                ),
              });
              p.context = live;
              p.dispose();
            }
            return output;
          },
          { moduleUrl, style, quality, tempo, mode },
        );
        if (results[0].seconds !== results[1].seconds)
          throw Error("Mismatched A/B durations");
        for (const result of results) {
          const name = `${style}-${mode}-${tempo}-${result.variant}`,
            pcm = Buffer.from(result.pcm, "base64"),
            header = Buffer.alloc(44);
          header.write("RIFF");
          header.writeUInt32LE(36 + pcm.length, 4);
          header.write("WAVEfmt ", 8);
          header.writeUInt32LE(16, 16);
          header.writeUInt16LE(1, 20);
          header.writeUInt16LE(2, 22);
          header.writeUInt32LE(48000, 24);
          header.writeUInt32LE(192000, 28);
          header.writeUInt16LE(4, 32);
          header.writeUInt16LE(16, 34);
          header.write("data", 36);
          header.writeUInt32LE(pcm.length, 40);
          await writeFile(
            resolve(output, name + ".wav"),
            Buffer.concat([header, pcm]),
          );
          const { pcm: _, ...data } = result;
          metadata.push({
            name,
            style,
            quality,
            tempo,
            bars: 24,
            sourceStartBar: style === "blues" ? 13 : 9,
            ...data,
          });
          console.log(JSON.stringify({ name, ...data }));
        }
      }
  if (errors.length) throw Error(errors.join("\n"));
  await writeFile(
    resolve(output, "render-validation.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
} finally {
  await browser?.close();
  server.kill();
}
