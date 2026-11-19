import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import { mkdir } from "node:fs/promises";
import {
  waitForServer,
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
} from "../../../scripts/ci/browser-harness.cjs";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";

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
const base = `http://127.0.0.1:${port}`;
const source =
  "/@fs" +
  new URL("../../../packages/music-practice/src/", import.meta.url).pathname;
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
    (window as any).__mixerAnalysers = [];
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (
        !(this.context instanceof OfflineAudioContext) &&
        args[0] === this.context.destination
      ) {
        const mute = this.context.createGain(),
          analyser = this.context.createAnalyser();
        mute.gain.value = 0;
        connect.call(mute, this.context.destination);
        connect.call(analyser, mute);
        (window as any).__mixerAnalysers.push(analyser);
        return connect.call(this, analyser);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(base + "/guitar/scales?key=C&scale=major");
  await openPracticeOptions(page);
  const panel = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  const mixer = panel.getByRole("button", { name: "Mixer", exact: true });
  const style = panel.getByRole("combobox", {
    name: "Backing style",
    exact: true,
  });
  const reset = panel.getByRole("button", {
    name: "Reset to genre default",
    exact: true,
  });
  const bass = panel.getByRole("slider", { name: "Bass balance", exact: true });
  const guitar = panel.getByRole("slider", {
    name: "Guitar balance",
    exact: true,
  });
  const organ = panel.getByRole("slider", {
    name: "Hammond organ balance",
    exact: true,
  });
  const piano = panel.getByRole("slider", {
    name: "Piano balance",
    exact: true,
  });
  await mixer.click();
  assert.equal(await bass.getAttribute("aria-valuenow"), "100");
  assert.equal(await reset.isDisabled(), true);
  await bass.press("Home");
  await guitar.press("End");
  assert.equal(await bass.getAttribute("aria-valuenow"), "0");
  assert.equal(await guitar.getAttribute("aria-valuenow"), "200");
  await style.selectOption("gospel");
  assert.equal(await reset.isDisabled(), true);
  assert.equal(await guitar.count(), 0);
  await organ.press("Home");
  await piano.press("End");
  await style.selectOption("blues");
  assert.equal(await bass.getAttribute("aria-valuenow"), "0");
  assert.equal(await guitar.getAttribute("aria-valuenow"), "200");
  await reset.click();
  assert.equal(await bass.getAttribute("aria-valuenow"), "100");
  assert.equal(await guitar.getAttribute("aria-valuenow"), "100");
  await style.selectOption("gospel");
  assert.equal(await organ.getAttribute("aria-valuenow"), "0");
  assert.equal(await piano.getAttribute("aria-valuenow"), "200");
  await page.evaluate(async (source) => {
    const { persistence } = await import(
      /* @vite-ignore */ source + "persistence.ts"
    );
    await persistence.store.flush();
  }, source);
  await page.reload();
  await openPracticeOptions(page);
  await mixer.click();
  assert.equal(await style.inputValue(), "gospel");
  assert.equal(await organ.getAttribute("aria-valuenow"), "0");
  assert.equal(await piano.getAttribute("aria-valuenow"), "200");
  assert.equal(await panel.getAttribute("data-status"), "ready");
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
  const before = await page.evaluate(
    async (source) =>
      (
        await import(/* @vite-ignore */ source + "piano-audio.ts")
      ).getPianoVolume(),
    source,
  );
  await bass.press("Home");
  await organ.press("End");
  await reset.click();
  assert.equal(
    await panel.getAttribute("data-status"),
    "playing",
    "mix changes do not restart or pause playback",
  );
  assert.equal(
    await page.evaluate(
      async (source) =>
        (
          await import(/* @vite-ignore */ source + "piano-audio.ts")
        ).getPianoVolume(),
      source,
    ),
    before,
    "master volume is independent",
  );
  for (const slider of await panel.getByRole("slider").all())
    await slider.press("Home");
  await page.waitForFunction(
    () =>
      (window as any).__mixerAnalysers.every((a: AnalyserNode) => {
        const data = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(data);
        return data.every((v) => Math.abs(v) < 0.00001);
      }),
    undefined,
    { timeout: 10000 },
  );
  await reset.click();
  await page.waitForFunction(
    () =>
      (window as any).__mixerAnalysers.some((a: AnalyserNode) => {
        const data = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(data);
        return data.some((v) => Math.abs(v) > 0.0001);
      }),
    undefined,
    { timeout: 10000 },
  );
  await panel
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();

  // Actual Web Audio rendering: unity preserves the genre mix, twice doubles
  // the signal, and muting the Hammond cannot mute the piano sharing its bus.
  const pcm = await page.evaluate(async (source) => {
    const { BackingMixer, backingMixerLevels } = await import(
      /* @vite-ignore */ source + "backing-mixer.ts"
    );
    const renderer = {
      async run(instrument: string, levels: object) {
        const context = new OfflineAudioContext(1, 8000, 8000);
        const bus = context.createGain(),
          master = context.createGain();
        master.gain.value = 0.25;
        bus.connect(master).connect(context.destination);
        const mixer = new BackingMixer(
          context,
          new Map([["keys", bus]]),
          backingMixerLevels({ levels }),
        );
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 200;
        oscillator.connect(mixer.input({ part: "keys", instrument }));
        oscillator.start();
        const audio = await context.startRendering();
        return Math.sqrt(
          audio
            .getChannelData(0)
            .reduce((sum: number, v: number) => sum + v * v, 0) / audio.length,
        );
      },
    };
    return {
      unity: await renderer.run("acoustic-piano", {}),
      double: await renderer.run("acoustic-piano", { keys: 200 }),
      muted: await renderer.run("tonewheel-organ", { organ: 0 }),
      piano: await renderer.run("acoustic-piano", { organ: 0 }),
    };
  }, source);
  assert.ok(Math.abs(pcm.double / pcm.unity - 2) < 0.0001);
  assert.equal(pcm.muted, 0);
  assert.equal(pcm.piano, pcm.unity);
  assert.ok(Math.abs(pcm.unity - 0.25 / Math.SQRT2) < 0.001);

  // Exercise the real pointer path in the iPhone layout as well as keyboard input.
  const phone = await newPage(browser, {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(base + "/guitar/scales?key=C&scale=major");
  await openPracticeOptions(phone);
  const phonePanel = phone.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  await phonePanel.getByRole("button", { name: "Mixer", exact: true }).click();
  const phoneBass = phonePanel.getByRole("slider", {
    name: "Bass balance",
    exact: true,
  });
  const track = phonePanel
    .locator(".mantine-Slider-root")
    .filter({
      has: phone.getByRole("slider", { name: "Bass balance", exact: true }),
    })
    .locator(".mantine-Slider-track");
  await track.scrollIntoViewIfNeeded();
  const bounds = await track.boundingBox();
  assert.ok(bounds);
  await phone.touchscreen.tap(bounds.x + 2, bounds.y + bounds.height / 2);
  await phone.waitForFunction(() => {
    const slider = document.querySelector(
      '[role="slider"][aria-label="Bass balance"]',
    );
    return slider && Number(slider.getAttribute("aria-valuenow")) < 10;
  });
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mkdir(new URL("../work/", import.meta.url), { recursive: true });
  await phonePanel.screenshot({
    path: new URL(
      `../work/backing-mixer-${process.env.TEST_BROWSER || "chromium"}.png`,
      import.meta.url,
    ).pathname,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Backing mixer: per-genre defaults, live balances, independent master, reset, reload, instrument isolation, rendered gains and target layouts passed",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
