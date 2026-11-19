import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import {
  waitForServer,
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";

const reservation = createServer();
await new Promise<void>((resolve) =>
  reservation.listen(0, "127.0.0.1", resolve),
);
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((resolve, reject) =>
  reservation.close((e) => (e ? reject(e) : resolve())),
);
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
const output = new URL("../../../work/folk-country-previews/", import.meta.url);
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
        const silent = this.context.createGain();
        silent.gain.value = 0;
        connect.call(silent, this.context.destination);
        return connect.call(this, silent);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(base + "/guitar/scales?key=C&scale=major");
  const panel = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  const style = panel.getByRole("combobox", {
    name: "Backing style",
    exact: true,
  });
  const pattern = panel.getByRole("combobox", {
    name: "Backing pattern",
    exact: true,
  });
  const playing = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector(".backing-track-settings")
          ?.getAttribute("data-status") === "playing",
      undefined,
      { timeout: 60000 },
    );
  await style.selectOption("folk");
  assert.equal(await pattern.inputValue(), "fingerpicked");
  await pattern.selectOption("strummed");
  await page.reload();
  assert.equal(
    await pattern.inputValue(),
    "strummed",
    "pattern survives durable storage reload",
  );
  await panel
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await playing();
  await style.selectOption("country");
  await playing();
  assert.equal(
    await pattern.count(),
    0,
    "Country has one pattern and needs no selector",
  );
  await panel
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  await page.reload();
  assert.equal(await style.inputValue(), "country");
  assert.equal(await pattern.count(), 0);
  await style.selectOption("soul");
  assert.equal(
    await pattern.count(),
    0,
    "other genres gain no irrelevant control",
  );
  await style.selectOption("folk");

  const moduleUrl =
    "/@fs" +
    new URL(
      "../../../packages/music-practice/src/backing-track-audio.ts",
      import.meta.url,
    ).pathname;
  const results = await page.evaluate(async (moduleUrl) => {
    const { BackingTrackPlayer } = await import(/* @vite-ignore */ moduleUrl);
    const { backingAudioGraph } = await import(
      /* @vite-ignore */ moduleUrl.replace(
        "backing-track-audio.ts",
        "backing-performance.ts",
      )
    );
    const rows = [];
    for (const [style, pattern, tempo] of [
      ["folk", "fingerpicked", 88],
      ["folk", "strummed", 88],
      ["country", "two-step", 104],
    ] as const) {
      const p: any = new BackingTrackPlayer();
      try {
        p.setStyle(style);
        p.setPattern(pattern);
        p.setMode("active");
        p.setKey(0, "C", "major");
        p.setTempo(tempo);
        await p.play();
        if (p.model.getSnapshot().status !== "playing")
          throw Error(JSON.stringify(p.model.getSnapshot()));
        const take = p.take();
        for (const event of take.events) {
          const choice = p.choose(event);
          if (
            !choice ||
            choice[1].instrument !== event.instrument ||
            choice[1].note !== event.note
          )
            throw Error(
              `Wrong/missing instrument ${event.instrument}/${event.note}`,
            );
        }
        const bytes = [...new Set(p.buffers.values())].reduce(
          (n: number, b: any) => n + b.length * b.numberOfChannels * 4,
          0,
        );
        const live = p.context;
        p.pauseAll();
        p.voices.clear();
        p.counter.clear();
        p.lastDrumFile.clear();
        // Let the real transport's deferred suspension finish before substituting
        // an OfflineAudioContext (Firefox's offline context has no suspend()).
        await new Promise((resolve) => setTimeout(resolve, 100));
        const seconds = (16 * 60) / tempo + 1;
        const offline = new OfflineAudioContext(
          2,
          Math.ceil(seconds * 24000),
          24000,
        );
        p.context = offline;
        p.buses = backingAudioGraph(
          offline,
          p.pack.levels,
          p.mixProfile,
          p.model.getSnapshot().mode,
        ).buses;
        for (const e of take.events.filter(
          (e: any) => e.beat >= 32 && e.beat < 48,
        ))
          p.sound(e, ((e.beat - 32) * 60) / tempo);
        const buffer = await offline.startRendering();
        let peak = 0,
          sum = 0,
          maxStep = 0,
          clipped = 0;
        const pcm = new Uint8Array(buffer.length * 4),
          view = new DataView(pcm.buffer);
        for (let channel = 0; channel < 2; channel++) {
          const data = buffer.getChannelData(channel);
          for (let i = 0; i < data.length; i++) {
            const value = data[i];
            if (!Number.isFinite(value))
              throw Error("Nonfinite rendered audio");
            peak = Math.max(peak, Math.abs(value));
            sum += value * value;
            if (i) maxStep = Math.max(maxStep, Math.abs(value - data[i - 1]));
            if (Math.abs(value) >= 1) clipped++;
            view.setInt16(
              i * 4 + channel * 2,
              Math.round(Math.max(-1, Math.min(1, value)) * 32767),
              true,
            );
          }
        }
        let encoded = "";
        for (let i = 0; i < pcm.length; i += 16384)
          encoded += String.fromCharCode(...pcm.subarray(i, i + 16384));
        p.context = live;
        rows.push({
          style,
          pattern,
          bytes,
          peak,
          maxStep,
          clipped,
          rmsDb: 20 * Math.log10(Math.sqrt(sum / (buffer.length * 2))),
          pcm: btoa(encoded),
        });
      } finally {
        p.dispose();
      }
    }
    // Exercise the asynchronous reload path, with an independently running click.
    const p: any = new BackingTrackPlayer();
    try {
      p.setStyle("folk");
      await p.startMetronome();
      await p.play();
      p.setStyle("country");
      p.setPattern("two-step");
      p.setKey(4, "E", "minor");
      p.setStyle("folk");
      p.setPattern("strummed");
      p.setKey(2, "D", "major");
      for (
        let i = 0;
        i < 1200 && p.model.getSnapshot().status === "loading";
        i++
      )
        await new Promise((r) => setTimeout(r, 25));
      const state = p.model.getSnapshot();
      if (
        state.status !== "playing" ||
        state.style !== "folk" ||
        state.pattern !== "strummed" ||
        state.tonic !== 2 ||
        !p.metronome.getSnapshot().enabled
      )
        throw Error(
          "Stale pattern/key/palette reload: " + JSON.stringify(state),
        );
      p.reschedule(255.5, p.context.currentTime + 0.02);
      await new Promise((r) => setTimeout(r, 800));
      if (p.take().cycle < 1 || p.takeCache.size > 2)
        throw Error("Loop wrap failed");
    } finally {
      p.dispose();
    }
    return rows;
  }, moduleUrl);
  await mkdir(output, { recursive: true });
  for (const row of results) {
    assert.ok(
      row.bytes < 160 * 1024 * 1024,
      "new palettes have bounded decoded memory",
    );
    assert.equal(row.clipped, 0);
    assert.ok(row.peak > 0.02 && row.peak < 1);
    assert.ok(
      row.rmsDb > -45 && row.rmsDb < -9,
      "audible, with practice headroom",
    );
    const pcm = Buffer.from(row.pcm, "base64"),
      header = Buffer.alloc(44);
    header.write("RIFF");
    header.writeUInt32LE(pcm.length + 36, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(2, 22);
    header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(96000, 28);
    header.writeUInt16LE(4, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    await writeFile(
      new URL(`${row.style}-${row.pattern}-${engine}.wav`, output),
      Buffer.concat([header, pcm]),
    );
  }
  await style.selectOption("folk");
  await page.screenshot({
    path: new URL(`desktop-${engine}.png`, output).pathname,
  });
  const phone = await newPage(browser, {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: engine !== "firefox",
    hasTouch: true,
  });
  await phone.goto(base + "/guitar/scales?key=C&scale=major");
  await openPracticeOptions(phone);
  await phone
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("country");
  assert.equal(
    await phone
      .getByRole("combobox", { name: "Backing pattern", exact: true })
      .count(),
    0,
  );
  const phonePanel = phone.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await phonePanel
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
  await phonePanel
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phonePanel.scrollIntoViewIfNeeded();
  await phone.screenshot({
    path: new URL(`iphone-14-pro-${engine}.png`, output).pathname,
  });
  assert.deepEqual(errors, []);
  const metrics = results.map(({ pcm, ...row }) => row);
  await writeFile(
    new URL(`metrics-${engine}.json`, output),
    JSON.stringify(metrics, null, 2),
  );
  console.log(
    "PASS Folk/Country patterns, native recordings, actual PCM, reload/races, loops, metronome, MacBook and iPhone layouts",
    JSON.stringify(metrics),
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
