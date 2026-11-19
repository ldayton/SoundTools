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
  new URL("../../../work/reggae-ab/raw", import.meta.url).pathname,
);
const comparison = process.env.REGGAE_AB === "1";
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser();
  const page = await newPage(browser, {
    viewport: { width: 1680, height: 1050 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
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
    .selectOption("reggae");
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
    "reggae",
  );
  assert.equal(
    await panel.getAttribute("data-status"),
    "ready",
    "reload never autoplays",
  );
  const source = new URL(
    "../../../packages/music-practice/src",
    import.meta.url,
  ).pathname;
  const beforeSource = new URL(
    "../../../work/reggae-ab/before-source/packages/music-practice/src",
    import.meta.url,
  ).pathname;
  await page.exposeFunction("clickReggaeCheckPlay", async () => {
    await page.locator("#reggae-check-play").click();
  });
  const organMetrics = await page.evaluate(async (source) => {
    const { TonewheelOrgan } = await import(
      /* @vite-ignore */ "/@fs" + source + "/backing-organ.ts"
    );
    const c = new OfflineAudioContext(2, 3 * 24000, 24000),
      organ = new TonewheelOrgan(c, c.destination, "reggae");
    organ.setScene({ registration: 0, expression: 0.75, rotary: "slow" }, 0);
    for (const t of [0.25, 0.75, 1.25, 1.75]) organ.play(55, t, 0.1, 1);
    organ.stop(2.1);
    const rendered = await c.startRendering(),
      data = rendered.getChannelData(0);
    let pulse = 0,
      gap = 0;
    for (let i = Math.round(0.28 * 24000); i < Math.round(0.34 * 24000); i++)
      pulse += data[i] ** 2;
    for (let i = Math.round(0.5 * 24000); i < Math.round(0.65 * 24000); i++)
      gap += data[i] ** 2;
    organ.dispose();
    return {
      pulse: Math.sqrt(pulse / (0.06 * 24000)),
      gap: Math.sqrt(gap / (0.15 * 24000)),
    };
  }, source);
  assert.ok(organMetrics.pulse > 0.001, "audible low organ pulse");
  assert.ok(
    organMetrics.gap < 0.000001,
    "organ releases cleanly between pulses",
  );
  console.log("Reggae isolated organ", JSON.stringify(organMetrics));
  const rows = [];
  for (const quality of ["major", "minor"])
    for (const mode of ["steady", "active"]) {
      for (const variant of comparison
        ? ["A-before", "B-after"]
        : ["B-after"]) {
        console.log("Reggae render", quality, mode, variant);
        const result = await page.evaluate(
          async ({ source, quality, mode, variant, comparison }) => {
            const { BackingTrackPlayer } = await import(
              /* @vite-ignore */ "/@fs" + source + "/backing-track-audio.ts"
            );
            const { backingAudioGraph } = await import(
              /* @vite-ignore */ "/@fs" + source + "/backing-performance.ts"
            );
            const p: any = new BackingTrackPlayer();
            let live: AudioContext | undefined;
            try {
              p.setStyle("reggae");
              p.setKey(0, "C", quality);
              p.setMode(mode);
              p.setTempo(78);
              const playing = new Promise<void>((resolve, reject) => {
                const button = document.createElement("button");
                button.id = "reggae-check-play";
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
              await (window as any).clickReggaeCheckPlay();
              await playing;
              if (p.model.getSnapshot().status !== "playing")
                throw Error(JSON.stringify(p.model.getSnapshot()));
              const take = p.take(),
                bytes = [...new Set(p.buffers.values())].reduce(
                  (s: number, b: any) => s + b.length * b.numberOfChannels * 4,
                  0,
                );
              const profile = p.organ?.profile;
              live = p.context;
              p.pauseAll();
              await new Promise((r) => setTimeout(r, 100));
              const stopped = p.organ?.voiceCount ?? 0;
              p.voices.clear();
              p.counter.clear();
              p.lastDrumFile.clear();
              const from = 32,
                to = comparison ? 64 : 48,
                seconds = ((to - from) * 60) / 78 + 0.8;
              const offline = new OfflineAudioContext(
                2,
                Math.ceil(seconds * 48000),
                48000,
              );
              p.context = offline;
              p.buses = backingAudioGraph(
                offline,
                p.pack.levels,
                p.mixProfile,
              ).buses;
              for (const e of take.events) {
                if (e.beat >= from && e.beat < to)
                  p.sound(e, ((e.beat - from) * 60) / 78);
                else if (
                  ["bass", "guitar", "keys"].includes(e.part) &&
                  e.beat < from &&
                  e.beat + e.duration > from
                )
                  p.sound(e, 0, false, from - e.beat);
              }
              const audio = await offline.startRendering();
              const pcm = new Uint8Array(audio.length * 8),
                view = new DataView(pcm.buffer);
              let peak = 0,
                sum = 0,
                difference = 0;
              const l = audio.getChannelData(0),
                r = audio.getChannelData(1);
              for (let ch = 0; ch < 2; ch++)
                for (let i = 0; i < audio.length; i++) {
                  const n = ch ? r[i] : l[i];
                  if (!Number.isFinite(n)) throw Error("Nonfinite PCM");
                  peak = Math.max(peak, Math.abs(n));
                  sum += n * n;
                  view.setFloat32(i * 8 + ch * 4, n, true);
                  if (!ch) difference += (l[i] - r[i]) ** 2;
                }
              let encoded = "";
              if (comparison)
                for (let i = 0; i < pcm.length; i += 16384)
                  encoded += String.fromCharCode(...pcm.subarray(i, i + 16384));
              return {
                pcm: comparison ? btoa(encoded) : undefined,
                peak,
                rms: Math.sqrt(sum / (audio.length * 2)),
                stereo: Math.sqrt(difference / audio.length),
                bytes,
                profile,
                stopped,
                seconds: audio.duration,
                phrasing: take.phrasing,
                quality,
                mode,
                variant,
              };
            } finally {
              if (live) p.context = live;
              p.dispose();
            }
          },
          {
            source: variant === "A-before" ? beforeSource : source,
            quality,
            mode,
            variant,
            comparison,
          },
        );
        const { pcm, ...metrics } = result;
        assert.ok(
          metrics.peak > 0.01 && metrics.peak < 1,
          "finite audible mix with headroom",
        );
        assert.ok(metrics.rms > 0.001 && metrics.stereo > 0.00001);
        assert.ok(
          metrics.bytes < (variant === "A-before" ? 256 : 110) * 1024 * 1024,
          `bounded decoded working set: ${variant} ${metrics.bytes}`,
        );
        assert.equal(metrics.stopped, 0, "pause releases organ oscillators");
        if (variant === "B-after") {
          assert.equal(metrics.profile, "reggae");
          assert.equal(metrics.phrasing, "reggae-roots-bubble-v2");
        }
        if (pcm) {
          await mkdir(output, { recursive: true });
          const bytes = Buffer.from(pcm, "base64"),
            header = Buffer.alloc(44);
          header.write("RIFF");
          header.writeUInt32LE(bytes.length + 36, 4);
          header.write("WAVEfmt ", 8);
          header.writeUInt32LE(16, 16);
          header.writeUInt16LE(3, 20);
          header.writeUInt16LE(2, 22);
          header.writeUInt32LE(48000, 24);
          header.writeUInt32LE(384000, 28);
          header.writeUInt16LE(8, 32);
          header.writeUInt16LE(32, 34);
          header.write("data", 36);
          header.writeUInt32LE(bytes.length, 40);
          await writeFile(
            resolve(output, `reggae-C-${quality}-${mode}-${variant}.wav`),
            Buffer.concat([header, bytes]),
          );
        }
        rows.push(metrics);
        console.log(JSON.stringify(metrics));
      }
    }
  // Real gesture for the lifecycle player, including WebKit's autoplay policy.
  await page.evaluate(async (source) => {
    const { BackingTrackPlayer } = await import(
      /* @vite-ignore */ "/@fs" + source + "/backing-track-audio.ts"
    );
    const p = ((window as any).reggaeCheck = new BackingTrackPlayer());
    p.setStyle("reggae");
    p.setTempo(78);
    const button = document.createElement("button");
    button.id = "reggae-check-play";
    button.textContent = "Play lifecycle check";
    button.style.cssText = "position:fixed;top:0;left:0;z-index:100000";
    button.onclick = () => {
      void p.play();
    };
    document.body.appendChild(button);
  }, source);
  await page.locator("#reggae-check-play").click();
  await page.waitForFunction(
    () => (window as any).reggaeCheck.model.getSnapshot().status === "playing",
  );
  await page.waitForFunction(
    () => (window as any).reggaeCheck.organ?.profile === "reggae",
  );
  await page.evaluate(() => {
    const p = (window as any).reggaeCheck;
    p.setStyle("gospel");
  });
  await page.waitForFunction(
    () => (window as any).reggaeCheck.organ?.profile === "gospel",
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    const p = (window as any).reggaeCheck;
    p.setStyle("funk");
    if (p.organ) throw Error("organ leaked into Funk");
  });
  await page.waitForFunction(
    () => (window as any).reggaeCheck.model.getSnapshot().status === "playing",
  );
  await page.evaluate(() => {
    (window as any).reggaeCheck.setStyle("reggae");
  });
  await page.waitForFunction(
    () => (window as any).reggaeCheck.organ?.profile === "reggae",
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    const p = (window as any).reggaeCheck;
    p.setKey(4, "E", "minor");
    p.setKey(2, "D", "major");
    p.setTempo(96);
    p.setMode("active");
  });
  await page.waitForFunction(
    () => {
      const s = (window as any).reggaeCheck.model.getSnapshot();
      return s.status === "playing" && s.tonic === 2 && s.quality === "major";
    },
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    const p = (window as any).reggaeCheck;
    p.reschedule(p.take().beats * 2 + 12);
    p.pauseAll();
  });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => (window as any).reggaeCheck.organ.voiceCount),
    0,
  );
  await page.locator("#reggae-check-play").click();
  await page.waitForFunction(
    () => (window as any).reggaeCheck.model.getSnapshot().status === "playing",
  );
  await page.evaluate(() => {
    (window as any).reggaeCheck.dispose();
    delete (window as any).reggaeCheck;
    document.querySelector("#reggae-check-play")?.remove();
  });
  const phone = await newPage(browser, {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    hasTouch: true,
    ...(engine === "firefox" ? {} : { isMobile: true }),
  });
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.addInitScript(() => {
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
  await phone.goto(base + "/guitar/scales?key=C&scale=major");
  await openPracticeOptions(phone);
  const mobilePanel = phone.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await mobilePanel
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("reggae");
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
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
  await phone.close();
  assert.deepEqual(errors, []);
  if (comparison)
    await writeFile(
      resolve(output, "render-validation.json"),
      JSON.stringify(rows, null, 2) + "\n",
    );
  console.log(
    engine +
      " Reggae desktop/mobile playback, style/key cancellation, pause/resume, loop seek and real PCM checks passed",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
