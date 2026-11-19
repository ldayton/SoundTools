import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  waitForServer,
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";

const reservation = createServer();
await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((r, j) => reservation.close((e) => (e ? j(e) : r())));
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`,
  engine = process.env.TEST_BROWSER || "chromium";
const output = resolve(
  process.env.GOSPEL_PREVIEWS ||
    new URL("../../../work/gospel-previews", import.meta.url).pathname,
);
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser();
  const page = await newPage(browser, {
    viewport: { width: 1680, height: 1050 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.text().startsWith("GOSPEL_CHECK")) console.log(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
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
  await page.goto(base + "/guitar/scales?key=C&scale=major");
  const panel = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await panel
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("gospel");
  assert.equal(
    await panel
      .getByRole("combobox", { name: "Backing pattern", exact: true })
      .count(),
    0,
  );
  await panel
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".backing-track-settings")
        ?.getAttribute("data-status") === "playing",
    undefined,
    { timeout: 60000 },
  );
  await panel
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  await page.reload();
  assert.equal(
    await panel
      .getByRole("combobox", { name: "Backing style", exact: true })
      .inputValue(),
    "gospel",
  );
  assert.equal(
    await panel.getAttribute("data-status"),
    "ready",
    "reload never autoplays",
  );
  const moduleUrl =
    "/@fs" +
    new URL(
      "../../../packages/music-practice/src/backing-track-audio.ts",
      import.meta.url,
    ).pathname;
  await page.exposeFunction("clickGospelRenderPlay", async () => {
    await page.locator("#gospel-render-play").click();
  });
  const result = await Promise.race([
    page.evaluate(
      async ({ moduleUrl, fullPreviews }) => {
        const { BackingTrackPlayer } = await import(
          /* @vite-ignore */ moduleUrl
        );
        const { backingAudioGraph } = await import(
          /* @vite-ignore */ moduleUrl.replace(
            "backing-track-audio.ts",
            "backing-performance.ts",
          )
        );
        const { TonewheelOrgan } = await import(
          /* @vite-ignore */ moduleUrl.replace(
            "backing-track-audio.ts",
            "backing-organ.ts",
          )
        );
        const { setPianoVolume, getPianoVolume } = await import(
          /* @vite-ignore */ moduleUrl.replace(
            "backing-track-audio.ts",
            "piano-audio.ts",
          )
        );
        const rows = [];
        const analysis = {
          rms(data: Float32Array, from: number, to: number, rate: number) {
            const a = data.subarray(
              Math.round(from * rate),
              Math.round(to * rate),
            );
            return Math.sqrt(a.reduce((sum, n) => sum + n * n, 0) / a.length);
          },
        };
        // Sustained notes must retain body and respond to drawbar/Leslie changes.
        const solo = new OfflineAudioContext(2, 8 * 24000, 24000),
          organ = new TonewheelOrgan(solo, solo.destination);
        organ.setScene(
          { registration: 0.15, expression: 0.6, rotary: "slow" },
          0,
        );
        for (const note of [60, 64, 67, 69]) organ.play(note, 0, 7.5, 1);
        organ.setScene(
          { registration: 0.8, expression: 0.9, rotary: "fast" },
          2.5,
        );
        organ.stop(6);
        console.log("GOSPEL_CHECK solo render");
        const organAudio = await solo.startRendering();
        console.log("GOSPEL_CHECK solo complete");
        const left = organAudio.getChannelData(0),
          right = organAudio.getChannelData(1);
        const organMetrics = {
          initial: analysis.rms(left, 0.8, 1.8, 24000),
          sustained: analysis.rms(left, 4, 5, 24000),
          stopped: analysis.rms(left, 6.3, 7.3, 24000),
          stereo: Math.sqrt(
            left.reduce((s, n, i) => s + (n - right[i]) ** 2, 0) / left.length,
          ),
        };
        organ.dispose();
        for (const quality of ["major", "minor"])
          for (const mode of ["steady", "active"]) {
            const p: any = new BackingTrackPlayer();
            let live: AudioContext | undefined;
            try {
              p.setStyle("gospel");
              p.setKey(0, "C", quality);
              p.setMode(mode);
              p.setTempo(76);
              console.log("GOSPEL_CHECK loading", quality, mode);
              const playing = new Promise<void>((resolve, reject) => {
                const button = document.createElement("button");
                button.id = "gospel-render-play";
                button.textContent = "Play audio check";
                button.style.cssText =
                  "position:fixed;top:0;left:0;z-index:100000";
                button.addEventListener(
                  "click",
                  () => {
                    void p.play().then(() => {
                      button.remove();
                      resolve();
                    }, reject);
                  },
                  { once: true },
                );
                document.body.appendChild(button);
              });
              await (window as any).clickGospelRenderPlay();
              await playing;
              console.log("GOSPEL_CHECK loaded", quality, mode);
              if (p.model.getSnapshot().status !== "playing")
                throw Error(JSON.stringify(p.model.getSnapshot()));
              const take = p.take(),
                bytes = [...new Set(p.buffers.values())].reduce(
                  (n: number, b: any) => n + b.length * b.numberOfChannels * 4,
                  0,
                );
              const chord = take.events.find(
                (e: any) =>
                  e.instrument === "tonewheel-organ" && e.duration > 7,
              );
              if (!chord) throw Error("No held common tone");
              live = p.context;
              p.pauseAll();
              await new Promise((r) => setTimeout(r, 100));
              p.voices.clear();
              p.counter.clear();
              p.lastDrumFile.clear();
              const from = 64,
                to = fullPreviews ? 128 : 80,
                rate = 48000;
              const seconds = ((to - from) * 60) / 76 + 0.8;
              const offline = new OfflineAudioContext(
                2,
                Math.ceil(seconds * rate),
                rate,
              );
              p.context = offline;
              p.buses = backingAudioGraph(
                offline,
                p.pack.levels,
                p.mixProfile,
                p.model.getSnapshot().mode,
              ).buses;
              for (const e of take.events) {
                if (e.beat >= from && e.beat < to)
                  p.sound(e, ((e.beat - from) * 60) / 76);
                else if (
                  ["bass", "keys"].includes(e.part) &&
                  e.beat < from &&
                  e.beat + e.duration > from
                )
                  p.sound(e, 0, false, from - e.beat);
              }
              console.log("GOSPEL_CHECK rendering", quality, mode);
              const rendered = await offline.startRendering();
              console.log("GOSPEL_CHECK rendered", quality, mode);
              const pcm = new Uint8Array(rendered.length * 8),
                view = new DataView(pcm.buffer);
              let peak = 0,
                sum = 0,
                maxStep = 0;
              for (let channel = 0; channel < 2; channel++) {
                const data = rendered.getChannelData(channel);
                for (let i = 0; i < data.length; i++) {
                  const n = data[i];
                  if (!Number.isFinite(n)) throw Error("Nonfinite PCM");
                  peak = Math.max(peak, Math.abs(n));
                  sum += n * n;
                  if (i) maxStep = Math.max(maxStep, Math.abs(n - data[i - 1]));
                  view.setFloat32(i * 8 + channel * 4, n, true);
                }
              }
              let encoded = "";
              for (let i = 0; i < pcm.length; i += 16384)
                encoded += String.fromCharCode(...pcm.subarray(i, i + 16384));
              rows.push({
                quality,
                mode,
                bytes,
                peak,
                maxStep,
                rmsDb: 20 * Math.log10(Math.sqrt(sum / (rendered.length * 2))),
                seconds: rendered.duration,
                pcm: btoa(encoded),
              });
            } finally {
              if (live) p.context = live;
              p.dispose();
            }
          }
        return { rows, organMetrics };
      },
      { moduleUrl, fullPreviews: process.env.GOSPEL_FULL_PREVIEWS === "1" },
    ),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(Error("Gospel audio check exceeded 120 seconds")),
        120000,
      ).unref();
    }),
  ]);
  // Unlock this fresh live context with an actual user gesture. Safari does
  // not promise that a gesture remains valid across offline render awaits.
  await page.evaluate(async (moduleUrl) => {
    const { BackingTrackPlayer } = await import(/* @vite-ignore */ moduleUrl);
    const p: any = ((window as any).__gospelTest = new BackingTrackPlayer());
    p.setStyle("gospel");
    p.setKey(0, "C", "major");
    const button = document.createElement("button");
    button.id = "gospel-lifecycle-start";
    button.textContent = "Start audio check";
    button.style.cssText = "position:fixed;top:0;left:0;z-index:100000";
    button.addEventListener("click", async () => {
      try {
        await p.startMetronome();
        await p.play();
      } catch (error) {
        (window as any).__gospelTestError = String(error);
      }
    });
    document.body.appendChild(button);
  }, moduleUrl);
  await page.locator("#gospel-lifecycle-start").click();
  await page.waitForFunction(
    () =>
      (window as any).__gospelTestError ||
      (window as any).__gospelTest?.model.getSnapshot().status === "playing",
    undefined,
    { timeout: 30000 },
  );
  await page.evaluate(async (moduleUrl) => {
    const { setPianoVolume, getPianoVolume } = await import(
      /* @vite-ignore */ moduleUrl.replace(
        "backing-track-audio.ts",
        "piano-audio.ts",
      )
    );
    const p: any = (window as any).__gospelTest;
    try {
      if ((window as any).__gospelTestError)
        throw Error((window as any).__gospelTestError);
      setPianoVolume(0);
      for (
        let i = 0;
        i < 80 &&
        (p.output.gain.value > 0.01 || p.clickOutput.gain.value > 0.01);
        i++
      )
        await new Promise((r) => setTimeout(r, 25));
      if (p.output.gain.value > 0.01 || p.clickOutput.gain.value > 0.01)
        throw Error(
          "App volume did not mute the backing mix: " +
            JSON.stringify({
              saved: getPianoVolume(),
              mix: p.output.gain.value,
              click: p.clickOutput.gain.value,
              context: p.context.state,
              status: p.model.getSnapshot().status,
              notice: document.querySelector("#persistence-notice")
                ?.textContent,
            }),
        );
      setPianoVolume(100);
      await new Promise((r) => setTimeout(r, 120));
      if (p.output.gain.value < 0.99)
        throw Error("App volume did not restore the backing mix");
      p.reschedule(7, p.context.currentTime + 0.02);
      if (!p.organ || !p.organ.voiceCount)
        throw Error("Held organ not restored on seek");
      p.setTempo(112);
      p.reschedule(255.5, p.context.currentTime + 0.02);
      await new Promise((r) => setTimeout(r, 800));
      if (p.take().cycle < 1 || p.takeCache.size > 2)
        throw Error("Gospel loop failed");
      const old = p.organ;
      p.setStyle("country");
      p.setStyle("gospel");
      p.setKey(2, "D", "minor");
      for (
        let i = 0;
        i < 1200 && p.model.getSnapshot().status === "loading";
        i++
      )
        await new Promise((r) => setTimeout(r, 25));
      if (
        p.model.getSnapshot().status !== "playing" ||
        p.model.getSnapshot().tonic !== 2 ||
        p.organ === old ||
        !old.disposed ||
        !p.metronome.getSnapshot().enabled
      )
        throw Error("Stale organ after palette/key reload");
      p.pauseAll();
      await new Promise((r) => setTimeout(r, 150));
      if (p.organ.voiceCount > 0) throw Error("Organ voices survived pause");
    } finally {
      p.dispose();
      document.querySelector("#gospel-lifecycle-start")?.remove();
      delete (window as any).__gospelTest;
      delete (window as any).__gospelTestError;
    }
  }, moduleUrl);
  assert.ok(result.organMetrics.sustained > result.organMetrics.initial * 1.15);
  assert.ok(result.organMetrics.stopped < 1e-6);
  assert.ok(result.organMetrics.stereo > 0.005);
  await mkdir(output, { recursive: true });
  for (const row of result.rows) {
    assert.ok(row.bytes < 200 * 1024 * 1024);
    assert.ok(row.peak > 0.05 && row.peak < 0.99);
    assert.ok(row.rmsDb > -42 && row.rmsDb < -9);
    const pcm = Buffer.from(row.pcm, "base64"),
      h = Buffer.alloc(44);
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
    h.write("data", 36);
    h.writeUInt32LE(pcm.length, 40);
    await writeFile(
      resolve(
        output,
        `Traditional-Gospel-C-${row.quality}-${row.mode}-${engine}.wav`,
      ),
      Buffer.concat([h, pcm]),
    );
  }
  await page.screenshot({ path: resolve(output, `desktop-${engine}.png`) });
  const phone = await newPage(browser, {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: engine !== "firefox",
    hasTouch: true,
  });
  await phone.goto(base + "/guitar/scales?key=C&scale=major");
  await openPracticeOptions(phone);
  const mobilePanel = phone.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await mobilePanel
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("gospel");
  await mobilePanel
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await phone.waitForFunction(
    () =>
      document
        .querySelector(".backing-track-settings")
        ?.getAttribute("data-status") === "playing",
    undefined,
    { timeout: 60000 },
  );
  await mobilePanel
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobilePanel.scrollIntoViewIfNeeded();
  await phone.screenshot({
    path: resolve(output, `iphone-14-pro-${engine}.png`),
  });
  assert.deepEqual(errors, []);
  const metrics = {
    organ: result.organMetrics,
    rows: result.rows.map(({ pcm, ...r }) => r),
  };
  await writeFile(
    resolve(output, `metrics-${engine}.json`),
    JSON.stringify(metrics, null, 2),
  );
  console.log(
    "PASS Traditional Gospel: sustained Hammond model, rotary/expression, actual PCM, piano/bass/drums, lifecycle, device layouts",
    JSON.stringify(metrics),
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
