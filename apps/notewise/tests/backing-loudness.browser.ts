import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import {
  waitForServer,
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
} from "../../../scripts/ci/browser-harness.cjs";

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
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const source =
  "/@fs" +
  new URL("../../../packages/music-practice/src/", import.meta.url).pathname;
let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}`, { server });
  browser = await launchBrowser();
  const page = await newPage(browser);
  await page.goto(`http://127.0.0.1:${port}/guitar/scales`);
  const rows = await page.evaluate(async (source) => {
    const { backingAudioGraph } = await import(
      /* @vite-ignore */ source + "backing-performance.ts"
    );
    const { BACKING_GENRES } = await import(
      /* @vite-ignore */ source + "backing-genres.ts"
    );
    const renderer = {
      async run(
        profile: string,
        mode: string,
        volume: number,
        hot: boolean,
        sampleRate: number,
      ) {
        const c = new OfflineAudioContext(2, sampleRate, sampleRate);
        const graph = backingAudioGraph(
          c,
          { drums: 1, percussion: 1, bass: 1, guitar: 1, keys: 1 },
          profile,
          mode,
        );
        graph.output.gain.value = volume;
        // Continuous + transient content probes the entire shared processing chain.
        const buffer = c.createBuffer(2, sampleRate, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < data.length; i++)
            data[i] =
              (hot ? 20 : 0.02) *
              (Math.sin(i * (ch ? 0.171 : 0.233)) +
                (i % 4000 < 80 ? Math.sin(i * 2.7) : 0));
        }
        const voice = c.createBufferSource();
        voice.buffer = buffer;
        voice.connect(graph.buses.get("guitar"));
        voice.start();
        const audio = await c.startRendering();
        let energy = 0,
          max = 0;
        for (let ch = 0; ch < 2; ch++)
          for (const n of audio.getChannelData(ch)) {
            if (!Number.isFinite(n)) throw Error("Nonfinite output");
            energy += n * n;
            max = Math.max(max, Math.abs(n));
          }
        // Reconstruct at four times the device rate as an independent intersample
        // peak check, rather than assuming a compressor threshold is a ceiling.
        const high = new OfflineAudioContext(
            2,
            Math.ceil(audio.duration * 192000),
            192000,
          ),
          replay = high.createBufferSource();
        replay.buffer = audio;
        replay.connect(high.destination);
        replay.start();
        const upsampled = await high.startRendering();
        let truePeak = 0;
        for (let ch = 0; ch < 2; ch++)
          for (const n of upsampled.getChannelData(ch))
            truePeak = Math.max(truePeak, Math.abs(n));
        return { energy, max, truePeak };
      },
    };
    const rows = [];
    for (const profile of [
      ...new Set([
        ...(Object.values(BACKING_GENRES) as any[]).map(
          (g) => g.instrumentation.mix,
        ),
        "strummed-acoustic",
      ]),
    ]) {
      for (const mode of ["steady", "active"])
        for (const sampleRate of [44100, 48000]) {
          const full = await renderer.run(profile, mode, 1, false, sampleRate),
            half = await renderer.run(profile, mode, 0.5, false, sampleRate);
          const muted = await renderer.run(profile, mode, 0, true, sampleRate),
            overload = await renderer.run(profile, mode, 1, true, sampleRate);
          rows.push({ profile, mode, sampleRate, full, half, muted, overload });
        }
    }
    return rows;
  }, source);
  for (const row of rows) {
    assert.ok(
      Math.abs(row.half.energy / row.full.energy - 0.25) < 0.00001,
      `${row.profile}: master attenuation is linear after all dynamics`,
    );
    assert.equal(row.muted.max, 0);
    assert.ok(
      20 * Math.log10(row.overload.truePeak) <= -1.5,
      `${row.profile}: overload safety true peak ${20 * Math.log10(row.overload.truePeak)}`,
    );
  }
  console.log(
    "PASS backing master linearity, mute and reconstructed true-peak headroom across all genres",
    JSON.stringify(
      rows.map((r) => ({
        profile: r.profile,
        mode: r.mode,
        sampleRate: r.sampleRate,
        truePeakDb: 20 * Math.log10(r.overload.truePeak),
      })),
    ),
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
