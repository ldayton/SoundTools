/** Render listening previews through the app's actual sampler and audio graph. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const output = process.argv[2];
if (!output)
  throw Error("Usage: tsx scripts/render-backing-realism.ts OUTPUT_DIRECTORY");
await mkdir(output, { recursive: true });
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", "4388", "--strictPort"],
  { cwd: resolve(root, "apps/notewise"), stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4388")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4388/guitar/scales?key=A&scale=minor");
  const moduleUrl =
    "/@fs" +
    resolve(root, "packages/music-practice/src/backing-track-audio.ts");
  const metadata = [];
  for (const style of ["blues", "rock"])
    for (const quality of ["major", "minor"]) {
      const name = `${style}-${quality}-active`;
      console.log("Rendering", name);
      const result = await page.evaluate(
        async ({ moduleUrl, style, quality }) => {
          const { BackingTrackPlayer } = await import(
            /* @vite-ignore */ moduleUrl
          );
          const { practiceBackingArrangement } = await import(
            /* @vite-ignore */ moduleUrl.replace(
              "backing-track-audio.ts",
              "backing-phrasing.ts",
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
          const p: any = new BackingTrackPlayer();
          p.setKey(9, "A", quality);
          p.setStyle(style);
          p.setMode("active");
          await p.play();
          if (p.model.getSnapshot().status !== "playing")
            throw Error("Sample loading failed");
          const live = p.context;
          p.pauseAll();
          await new Promise((r) => setTimeout(r, 100));
          const take = practiceBackingArrangement(
              style,
              "active",
              quality,
              0,
              style === "blues" ? 90 : 104,
            ),
            tempo = take.nativeTempo;
          const offline = new OfflineAudioContext(
            2,
            Math.ceil(((take.beats * 60) / tempo + 2) * 48000),
            48000,
          );
          p.context = offline;
          p.buses = backingAudioGraph(offline, backingPack.levels).buses;
          p.model.set({
            ...p.model.getSnapshot(),
            style,
            mode: "active",
            quality,
            tempo,
          });
          for (const event of take.events)
            p.sound(event, (event.beat * 60) / tempo);
          const rendered = await offline.startRendering();
          const left = rendered.getChannelData(0),
            right = rendered.getChannelData(1);
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
              Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767),
              true,
            );
          }
          const sections = [];
          for (let bar = 0; bar < take.beats / 4; bar += 8) {
            const a = Math.round(((bar * 4 * 60) / tempo) * 48000),
              b = Math.min(
                left.length,
                Math.round((((bar + 8) * 4 * 60) / tempo) * 48000),
              );
            let power = 0;
            for (let i = a; i < b; i++) power += left[i] ** 2 + right[i] ** 2;
            sections.push({
              bar: bar + 1,
              rmsDb: 20 * Math.log10(Math.sqrt(power / (2 * (b - a))) * gain),
            });
          }
          let encoded = "";
          for (let i = 0; i < pcm.length; i += 16384)
            encoded += String.fromCharCode(...pcm.subarray(i, i + 16384));
          p.context = live;
          p.dispose();
          return {
            pcm: btoa(encoded),
            peak,
            rmsDb: 20 * Math.log10(Math.sqrt(sum / (2 * left.length)) * gain),
            gain,
            seconds: left.length / 48000,
            sections,
          };
        },
        { moduleUrl, style, quality },
      );
      const pcm = Buffer.from(result.pcm, "base64"),
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
      metadata.push({ name, ...data });
      console.log(JSON.stringify({ name, ...data }));
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
