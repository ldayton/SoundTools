import assert from "node:assert/strict";
import {
  waitForServer,
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
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
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const engine = process.env.TEST_BROWSER || "chromium";
const fixed = await mkdtemp(join(tmpdir(), "notewise-realism-"));
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
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
  await page.goto(base + "/guitar/scales?key=A&scale=minor");
  const backing = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await backing.waitFor();
  assert.equal(
    await backing
      .locator("[data-backing-quality]")
      .getAttribute("data-backing-quality"),
    "minor",
  );
  await page.getByLabel("Scale type", { exact: true }).selectOption("major");
  assert.equal(
    await backing
      .locator("[data-backing-quality]")
      .getAttribute("data-backing-quality"),
    "major",
  );
  await backing
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("reggae");
  await backing
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
  await page.getByLabel("Scale type", { exact: true }).selectOption("minor");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".backing-track-settings")
        ?.getAttribute("data-status") === "playing",
    undefined,
    { timeout: 60000 },
  );
  await backing
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  await backing
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("funk");
  assert.equal(
    await backing
      .getByRole("combobox", { name: "Backing style", exact: true })
      .inputValue(),
    "funk",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const moduleUrl =
    "/@fs" +
    new URL(
      "../../../packages/music-practice/src/backing-track-audio.ts",
      import.meta.url,
    ).pathname;
  const result = await page.evaluate(async (moduleUrl) => {
    const { BackingTrackPlayer } = await import(/* @vite-ignore */ moduleUrl);
    const { backingPack } = await import(
      /* @vite-ignore */ moduleUrl.replace(
        "backing-track-audio.ts",
        "backing-track-model.ts",
      )
    );
    const p: any = new BackingTrackPlayer();
    p.setMetronomeTempo(114);
    p.setTempo(72);
    p.setStyle("funk");
    p.setMode("active");
    p.setKey(9, "A", "minor");
    await p.play();
    if (p.model.getSnapshot().status !== "playing")
      throw Error(JSON.stringify(p.model.getSnapshot()));
    const c = p.context;
    const bytes = [...new Set(p.buffers.values())].reduce(
      (n: number, b: any) => n + b.length * b.numberOfChannels * 4,
      0,
    );
    const sampleCount = p.buffers.size;
    const at = c.currentTime + 0.2;
    p.sound(
      {
        part: "guitar",
        note: 60,
        string: 3,
        beat: 0,
        duration: 4,
        velocity: 56,
        level: 0.5,
      },
      at,
    );
    p.sound(
      {
        part: "guitar",
        note: 64,
        string: 4,
        beat: 0,
        duration: 4,
        velocity: 56,
        level: 0.5,
      },
      at + 0.01,
    );
    const held = [...p.voices].find(
      (v: any) =>
        v.part === "guitar" &&
        v.note === 60 &&
        v.string === 3 &&
        Math.abs(v.start - at) < 0.00001,
    );
    const other = [...p.voices].find(
      (v: any) =>
        v.part === "guitar" &&
        v.note === 64 &&
        v.string === 4 &&
        Math.abs(v.start - at - 0.01) < 0.00001,
    );
    p.sound(
      {
        part: "guitar",
        note: 64,
        string: 3,
        beat: 0,
        duration: 4,
        velocity: 56,
        level: 0.5,
      },
      at + 0.1,
    );
    const stringChoke = held.end === at + 0.1 && other.end > at + 0.2;
    p.sound(
      {
        part: "drums",
        note: 46,
        beat: 0,
        duration: 4,
        velocity: 56,
        level: 0.5,
      },
      at + 0.2,
    );
    const hat = [...p.voices].find(
      (v: any) =>
        v.part === "drums" &&
        v.note === 46 &&
        Math.abs(v.start - at - 0.2) < 0.00001,
    );
    p.sound(
      {
        part: "drums",
        note: 42,
        beat: 0,
        duration: 4,
        velocity: 56,
        level: 0.5,
      },
      at + 0.3,
    );
    const hatChoke = hat.end === at + 0.3;
    p.reschedule(255.2, c.currentTime + 0.06);
    await new Promise((r) => setTimeout(r, 1000));
    const position = p.currentPosition(),
      take = p.take();
    p.setTempo(120);
    const changedTake = p.take();
    const stable = Math.abs(p.currentPosition() - position) < 0.08;
    const cycles = p.takeCache.size,
      takeNumber = take.cycle;
    // Two overlapping key loads must leave only the last key's samples and harmony.
    p.setMetronomeTempo(114);
    await p.startMetronome();
    const beforeKey = p.currentPosition();
    p.setKey(2, "D", "minor");
    p.setKey(4, "E", "major");
    const loading = p.model.getSnapshot();
    await new Promise((r) => setTimeout(r, 120));
    const clockContinued = p.currentPosition() > beforeKey + 0.05;
    for (let i = 0; i < 600 && p.model.getSnapshot().status === "loading"; i++)
      await new Promise((r) => setTimeout(r, 20));
    const final = p.model.getSnapshot(),
      finalTake = p.take();
    p.dispose();
    return {
      bytes,
      sampleCount,
      total: Object.keys(backingPack.samples).length,
      bassCount: finalTake.events.filter((e: any) => e.part === "bass").length,
      stringChoke,
      hatChoke,
      stable,
      cycles,
      takeNumber,
      final,
      finalQuality: finalTake.quality,
      loading,
      clockContinued,
      phrasing: changedTake.phrasing,
      drumInterpretation: changedTake.drumInterpretation,
      guitarTransitions: changedTake.guitarTransitions,
      sharedPocket: changedTake.sharedPocket,
      changedTempo: changedTake.tempo,
    };
  }, moduleUrl);
  assert.ok(
    result.sampleCount < result.total,
    "only the active key's sample working set is decoded",
  );
  assert.ok(
    result.bytes < 256 * 1024 * 1024,
    `decoded samples bounded: ${result.bytes}`,
  );
  assert.ok(
    result.stringChoke,
    "same guitar string chokes, another string keeps ringing",
  );
  assert.ok(result.hatChoke, "closed hat chokes its open predecessor");
  assert.equal(result.phrasing, "funk-pocket-sixteenths-v2");
  assert.equal(result.changedTempo, 120);
  assert.ok(result.bassCount > 128 && result.bassCount <= 256);
  assert.equal(result.final.style, "funk");
  assert.equal(result.sharedPocket, "drummer-relative-v1");
  assert.equal(result.guitarTransitions, "connected-strings-v1");
  assert.equal(result.drumInterpretation, "recorded-articulations-v1");
  assert.ok(result.stable, "tempo edit retains phase after a long take wraps");
  assert.ok(result.takeNumber >= 1);
  assert.ok(result.cycles <= 2);
  assert.equal(result.loading.syncing, true);
  assert.ok(
    result.clockContinued,
    "metronome clock advances through key reload rather than adopting the independent tempo",
  );
  assert.equal(result.final.status, "playing");
  assert.equal(result.final.tonic, 4);
  assert.equal(result.final.quality, "major");
  assert.equal(result.finalQuality, "major");
  assert.deepEqual(errors, []);
  console.log(
    engine +
      " realistic voices, scale harmony, bounded decoding, cycle variation, phase and key-load cancellation passed",
    JSON.stringify(result),
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch((error) => {
    if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
  });
}
