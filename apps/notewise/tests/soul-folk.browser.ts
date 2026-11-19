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
  for (const label of ["Soul", "Folk"]) {
    await backing
      .getByRole("combobox", { name: "Backing style", exact: true })
      .selectOption(label.toLowerCase());
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
    await backing
      .getByRole("button", { name: "Pause backing track", exact: true })
      .click();
  }
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
    const p: any = new BackingTrackPlayer();
    const rows = [];
    for (const style of ["soul", "folk"]) {
      p.setStyle(style);
      p.setKey(9, "A", "major");
      p.setMode("active");
      await p.play();
      if (p.model.getSnapshot().status !== "playing")
        throw Error(JSON.stringify(p.model.getSnapshot()));
      const take = p.take(),
        bytes = [...new Set(p.buffers.values())].reduce(
          (n: number, b: any) => n + b.length * b.numberOfChannels * 4,
          0,
        );
      rows.push({
        style,
        bytes,
        keys: take.events.filter((e: any) => e.part === "keys").length,
        guitar: take.events.filter((e: any) => e.part === "guitar").length,
        bass: take.events.filter((e: any) => e.part === "bass").length,
      });
      p.pauseAll();
    }
    await p.startMetronome();
    await p.play();
    p.setStyle("soul");
    p.setKey(4, "E", "minor");
    for (let i = 0; i < 1200 && p.model.getSnapshot().status === "loading"; i++)
      await new Promise((r) => setTimeout(r, 50));
    const final = p.model.getSnapshot(),
      clock = p.metronome.getSnapshot().enabled;
    p.dispose();
    return { rows, final, clock };
  }, moduleUrl);
  for (const row of result.rows) {
    assert.ok(row.bytes < 256 * 1024 * 1024);
    assert.ok(row.bass <= (row.style === "soul" ? 192 : 128));
    assert.equal(row.keys > 0, row.style === "soul");
    assert.ok(row.guitar > 0);
  }
  assert.equal(result.final.status, "playing");
  assert.equal(result.final.style, "soul");
  assert.equal(result.final.tonic, 4);
  assert.equal(result.final.quality, "minor");
  assert.ok(result.clock);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Soul/Folk sound palettes, UI, native-key decoding, instrument reload cancellation, metronome and mobile layout",
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
