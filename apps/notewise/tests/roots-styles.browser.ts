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
const engine = process.env.TEST_BROWSER || "chromium",
  base = `http://127.0.0.1:${port}`,
  comparison = process.env.ROOTS_AB === "1";
const output = resolve(
  new URL("../../../work/roots-blues-ab/raw", import.meta.url).pathname,
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
  for (const style of ["rock", "blues"]) {
    const selector = panel.getByRole("combobox", {
      name: "Backing style",
      exact: true,
    });
    await selector.selectOption(style);
    assert.equal(
      await selector.locator("option:checked").textContent(),
      style === "rock" ? "Roots Rock" : "Shuffle Blues",
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
    assert.equal(await selector.inputValue(), style);
    assert.equal(await panel.getAttribute("data-status"), "ready");
  }
  const source = new URL(
    "../../../packages/music-practice/src",
    import.meta.url,
  ).pathname;
  const baseline = new URL(
    "../../../work/roots-blues-ab/before-source/packages/music-practice/src",
    import.meta.url,
  ).pathname;
  await page.exposeFunction("clickRootsCheckPlay", async () => {
    await page.locator("#roots-check-play").click();
  });
  const rows = [];
  for (const style of ["rock", "blues"])
    for (const quality of ["major", "minor"])
      for (const mode of ["steady", "active"])
        for (const variant of comparison
          ? ["A-before", "B-after"]
          : ["B-after"]) {
          console.log("Roots render", style, quality, mode, variant);
          const result = await page.evaluate(
            async ({ source, style, quality, mode, variant, comparison }) => {
              const { BackingTrackPlayer } = await import(
                /* @vite-ignore */ "/@fs" + source + "/backing-track-audio.ts"
              );
              const { backingAudioGraph } = await import(
                /* @vite-ignore */ "/@fs" + source + "/backing-performance.ts"
              );
              const tempo = style === "rock" ? 100 : 90,
                p: any = new BackingTrackPlayer();
              let live: AudioContext | undefined;
              try {
                p.setStyle(style);
                p.setKey(0, "C", quality);
                p.setMode(mode);
                p.setTempo(tempo);
                const playing = new Promise<void>((resolve, reject) => {
                  const button = document.createElement("button");
                  button.id = "roots-check-play";
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
                await (window as any).clickRootsCheckPlay();
                await playing;
                if (p.model.getSnapshot().status !== "playing")
                  throw Error(JSON.stringify(p.model.getSnapshot()));
                const take = p.take(),
                  bytes = [...new Set(p.buffers.values())].reduce(
                    (s: number, b: any) =>
                      s + b.length * b.numberOfChannels * 4,
                    0,
                  );
                live = p.context;
                p.pauseAll();
                await new Promise((r) => setTimeout(r, 100));
                p.voices.clear();
                p.counter.clear();
                p.lastDrumFile.clear();
                const from = style === "rock" ? (comparison ? 32 : 64) : 48,
                  to = comparison ? 96 : from + 16,
                  seconds = ((to - from) * 60) / tempo + 0.8;
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
                    p.sound(e, ((e.beat - from) * 60) / tempo);
                  else if (
                    ["bass", "guitar", "keys"].includes(e.part) &&
                    e.beat < from &&
                    e.beat + e.duration > from
                  )
                    p.sound(e, 0, false, from - e.beat);
                }
                const audio = await offline.startRendering(),
                  pcm = new Uint8Array(audio.length * 8),
                  view = new DataView(pcm.buffer);
                let peak = 0,
                  sum = 0,
                  stereo = 0,
                  mono = 0;
                const l = audio.getChannelData(0),
                  r = audio.getChannelData(1);
                for (let ch = 0; ch < 2; ch++)
                  for (let i = 0; i < audio.length; i++) {
                    const n = ch ? r[i] : l[i];
                    if (!Number.isFinite(n)) throw Error("Nonfinite PCM");
                    peak = Math.max(peak, Math.abs(n));
                    sum += n * n;
                    view.setFloat32(i * 8 + ch * 4, n, true);
                    if (!ch) {
                      stereo += (l[i] - r[i]) ** 2;
                      mono += ((l[i] + r[i]) / 2) ** 2;
                    }
                  }
                let encoded = "";
                if (comparison)
                  for (let i = 0; i < pcm.length; i += 16384)
                    encoded += String.fromCharCode(
                      ...pcm.subarray(i, i + 16384),
                    );
                const stems: Record<string, { rms: number; peak: number }> = {};
                if (
                  variant === "B-after" &&
                  quality === "major" &&
                  mode === "active"
                )
                  for (const instrument of style === "rock"
                    ? ["rock-guitar", "rock-muted", "rock-bass"]
                    : ["blues-rhythm", "blues-lead", "blues-bass"]) {
                    const stemFrom =
                      instrument === "rock-guitar"
                        ? 64
                        : style === "blues"
                          ? 48
                          : 32;
                    const stemBeats = style === "blues" ? 16 : 8;
                    const c = new OfflineAudioContext(
                      2,
                      Math.ceil(((stemBeats * 60) / tempo + 0.8) * 24000),
                      24000,
                    );
                    p.context = c;
                    p.buses = backingAudioGraph(
                      c,
                      p.pack.levels,
                      p.mixProfile,
                    ).buses;
                    p.voices.clear();
                    p.counter.clear();
                    p.lastDrumFile.clear();
                    for (const e of take.events)
                      if (
                        e.instrument === instrument &&
                        e.beat >= stemFrom &&
                        e.beat < stemFrom + stemBeats
                      )
                        p.sound(e, ((e.beat - stemFrom) * 60) / tempo);
                    const a = await c.startRendering();
                    let s = 0,
                      k = 0;
                    for (let ch = 0; ch < 2; ch++)
                      for (const n of a.getChannelData(ch)) {
                        if (!Number.isFinite(n)) throw Error("Nonfinite stem");
                        s += n * n;
                        k = Math.max(k, Math.abs(n));
                      }
                    stems[instrument] = {
                      rms: Math.sqrt(s / (a.length * 2)),
                      peak: k,
                    };
                  }
                return {
                  pcm: comparison ? btoa(encoded) : undefined,
                  style,
                  quality,
                  mode,
                  variant,
                  tempo,
                  seconds: audio.duration,
                  bytes,
                  peak,
                  rms: Math.sqrt(sum / (audio.length * 2)),
                  stereo: Math.sqrt(stereo / audio.length),
                  mono: Math.sqrt(mono / audio.length),
                  phrasing: take.phrasing,
                  stems,
                };
              } finally {
                if (live) p.context = live;
                p.dispose();
              }
            },
            {
              source: variant === "A-before" ? baseline : source,
              style,
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
          assert.ok(metrics.mono > metrics.rms * 0.6, "mono remains strong");
          assert.ok(
            metrics.bytes < (variant === "A-before" ? 300 : 256) * 1024 * 1024,
            `bounded working set ${style}/${metrics.bytes}`,
          );
          if (variant === "B-after")
            assert.equal(
              metrics.phrasing,
              style === "rock"
                ? "roots-rock-dynamics-v3"
                : "blues-shuffle-answers-v3",
            );
          for (const [instrument, stem] of Object.entries(metrics.stems)) {
            assert.ok(
              stem.peak > 0.0001 && stem.peak < 1,
              instrument + " audible finite stem",
            );
            assert.ok(
              stem.rms > metrics.rms * 0.005,
              instrument + " contributes to mix",
            );
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
              resolve(output, `${style}-C-${quality}-${mode}-${variant}.wav`),
              Buffer.concat([header, bytes]),
            );
          }
          rows.push(metrics);
          console.log(JSON.stringify(metrics));
        }
  await page.evaluate(async (source) => {
    const { BackingTrackPlayer } = await import(
      /* @vite-ignore */ "/@fs" + source + "/backing-track-audio.ts"
    );
    const p = ((window as any).rootsCheck = new BackingTrackPlayer());
    p.setStyle("rock");
    p.setKey(0, "C", "major");
    p.setTempo(104);
    const button = document.createElement("button");
    button.id = "roots-check-play";
    button.textContent = "Play lifecycle check";
    button.style.cssText = "position:fixed;top:0;left:0;z-index:100000";
    button.onclick = () => {
      void p.play();
    };
    document.body.appendChild(button);
  }, source);
  await page.locator("#roots-check-play").click();
  await page.waitForFunction(
    () => (window as any).rootsCheck.model.getSnapshot().status === "playing",
  );
  await page.waitForFunction(
    () => (window as any).rootsCheck.instruments?.entries.size > 0,
  );
  await page.evaluate(() => {
    const p = (window as any).rootsCheck;
    (window as any).oldRootsRack = p.instruments;
    p.setStyle("blues");
    if (!(window as any).oldRootsRack.entries.size)
      throw Error("Effects cut before voice release");
  });
  await page.waitForFunction(
    () => (window as any).oldRootsRack.entries.size === 0,
  );
  await page.waitForFunction(
    () => (window as any).rootsCheck.model.getSnapshot().status === "playing",
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    const p = (window as any).rootsCheck;
    p.setMode("active");
    p.setKey(4, "E", "minor");
    p.setKey(2, "D", "major");
    p.setTempo(90);
  });
  await page.waitForFunction(
    () => {
      const s = (window as any).rootsCheck.model.getSnapshot();
      return s.status === "playing" && s.tonic === 2 && s.quality === "major";
    },
    undefined,
    { timeout: 60000 },
  );
  const lifecycle = await page.evaluate(async (source) => {
    const p = (window as any).rootsCheck,
      { setPianoVolume, getPianoVolume } = await import(
        /* @vite-ignore */ "/@fs" + source + "/piano-audio.ts"
      );
    const original = getPianoVolume();
    try {
      if ([...p.buffers.keys()].some((id: any) => !id.startsWith("blues-")))
        throw Error("palette buffers leaked across genres");
      setPianoVolume(25);
      for (
        let i = 0;
        i < 60 && Math.abs(p.output.gain.value - 0.75) > 0.01;
        i++
      )
        await new Promise((r) => setTimeout(r, 30));
      const quarter = p.output.gain.value;
      p.reschedule(p.take().beats * 2 + 32);
      const before = p.currentPosition();
      p.setTempo(96);
      const after = p.currentPosition();
      p.pauseAll();
      await new Promise((r) => setTimeout(r, 150));
      return {
        quarter,
        phase: Math.abs(after - before),
        voices: p.voices.size,
      };
    } finally {
      setPianoVolume(original);
    }
  }, source);
  assert.ok(Math.abs(lifecycle.quarter - 0.75) < 0.01);
  assert.ok(lifecycle.phase < 0.1);
  assert.equal(lifecycle.voices, 0);
  await page.locator("#roots-check-play").click();
  await page.waitForFunction(
    () => (window as any).rootsCheck.model.getSnapshot().status === "playing",
  );
  await page.evaluate(() => {
    const p = (window as any).rootsCheck,
      rack = p.instruments;
    p.dispose();
    if (rack.entries.size) throw Error("effects leaked after disposal");
    delete (window as any).rootsCheck;
    delete (window as any).oldRootsRack;
    document.querySelector("#roots-check-play")?.remove();
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
  const mobile = phone.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  for (const style of ["rock", "blues"]) {
    await mobile
      .getByRole("combobox", { name: "Backing style", exact: true })
      .selectOption(style);
    assert.ok(
      await phone.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile
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
    await mobile
      .getByRole("button", { name: "Pause backing track", exact: true })
      .click();
  }
  await phone.close();
  assert.deepEqual(errors, []);
  if (comparison)
    await writeFile(
      resolve(output, "render-validation.json"),
      JSON.stringify(rows, null, 2) + "\n",
    );
  console.log(
    engine +
      " Roots Rock/Shuffle Blues real PCM, stems, mono, volume, transport, cancellation, effect cleanup and device UI checks passed",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
