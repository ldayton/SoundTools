import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", "4384", "--strictPort"],
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const url = "http://127.0.0.1:4384";
const fixed = await mkdtemp(join(tmpdir(), "notewise-backing-"));
const engine = process.env.TEST_BROWSER || "chromium";
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await { chromium, firefox, webkit }[engine as "chromium"].launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (
        !(this.context instanceof OfflineAudioContext) &&
        args[0] === this.context.destination
      ) {
        const silent = this.context.createGain();
        silent.gain.value = 0;
        (connect as Function).call(silent, this.context.destination);
        return (connect as Function).call(this, silent);
      }
      return (connect as Function).apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto(url + "/guitar/scales?key=A&scale=major");
  const backing = page.getByRole("region", {
    name: "Backing track",
    exact: true,
  });
  const metro = page.getByRole("region", { name: "Metronome", exact: true });
  await backing.waitFor();
  await metro.waitFor();
  assert.equal(await backing.locator("input[type=range]").count(), 0);
  const tempo = backing.getByRole("spinbutton");
  const initial = Number(await tempo.inputValue());
  await backing.getByRole("button", { name: "Increase backing tempo" }).click();
  assert.equal(Number(await tempo.inputValue()), initial + 2);
  await backing.getByRole("button", { name: "Decrease backing tempo" }).click();
  assert.equal(Number(await tempo.inputValue()), initial);
  await backing.getByRole("button", { name: "Active", exact: true }).click();
  assert.equal(
    await backing
      .getByRole("button", { name: "Active", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const downbeat = metro.getByRole("checkbox", {
    name: "Downbeat",
    exact: true,
  });
  const numerator = metro.getByRole("spinbutton", {
    name: "Time signature numerator",
  });
  const denominator = metro.getByRole("spinbutton", {
    name: "Time signature denominator",
  });
  assert.equal(await numerator.isDisabled(), true);
  await downbeat.check();
  await numerator.fill("3");
  await denominator.fill("8");
  await downbeat.uncheck();
  assert.equal(await numerator.isDisabled(), true);
  await metro
    .getByRole("spinbutton", { name: "Metronome tempo in beats per minute" })
    .fill("112");
  await metro
    .getByRole("spinbutton", { name: "Metronome tempo in beats per minute" })
    .press("Enter");
  await metro
    .getByRole("button", { name: "Play metronome", exact: true })
    .click();
  await metro
    .getByRole("status")
    .filter({ hasText: "Playing · independent" })
    .waitFor();
  await backing
    .getByRole("button", { name: "Play backing track", exact: true })
    .click();
  await backing
    .getByRole("status")
    .filter({ hasText: "Playing · looping" })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await metro
      .getByRole("spinbutton", { name: "Metronome tempo in beats per minute" })
      .isDisabled(),
    true,
  );
  assert.equal(
    Number(
      await metro
        .getByRole("spinbutton", {
          name: "Metronome tempo in beats per minute",
        })
        .inputValue(),
    ),
    initial,
  );
  await backing.getByRole("button", { name: "Increase backing tempo" }).click();
  assert.equal(
    Number(
      await metro
        .getByRole("spinbutton", {
          name: "Metronome tempo in beats per minute",
        })
        .inputValue(),
    ),
    initial + 2,
  );
  await metro
    .getByRole("button", { name: "Pause metronome", exact: true })
    .click();
  assert.equal(await backing.getAttribute("data-status"), "playing");
  await metro
    .getByRole("button", { name: "Play metronome", exact: true })
    .click();
  await downbeat.check();
  assert.equal(await numerator.inputValue(), "4");
  assert.equal(await denominator.inputValue(), "4");
  assert.equal(await numerator.isDisabled(), true);
  await backing.getByRole("button", { name: "Steady", exact: true }).click();
  await backing
    .getByRole("combobox", { name: "Backing style", exact: true })
    .selectOption("rock");
  await backing
    .getByRole("button", { name: "Pause backing track", exact: true })
    .click();
  assert.equal(
    Number(
      await metro
        .getByRole("spinbutton", {
          name: "Metronome tempo in beats per minute",
        })
        .inputValue(),
    ),
    112,
  );
  assert.equal(
    await metro
      .getByRole("spinbutton", { name: "Metronome tempo in beats per minute" })
      .isDisabled(),
    false,
  );
  assert.equal(
    await metro
      .getByRole("button", { name: "Pause metronome", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await metro
    .getByRole("button", { name: "Pause metronome", exact: true })
    .click();
  assert.equal(await numerator.inputValue(), "3");
  assert.equal(await denominator.inputValue(), "8");
  await downbeat.uncheck();
  await page.reload();
  await backing.waitFor();
  assert.equal(
    await backing
      .getByRole("combobox", { name: "Backing style", exact: true })
      .inputValue(),
    "rock",
  );
  assert.equal(
    await backing
      .getByRole("button", { name: "Steady", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    Number(
      await metro
        .getByRole("spinbutton", {
          name: "Metronome tempo in beats per minute",
        })
        .inputValue(),
    ),
    112,
  );
  assert.equal(await backing.getAttribute("data-status"), "ready");
  assert.equal(
    await metro
      .getByRole("button", { name: "Play metronome", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  // Exercise audio scheduling directly as well as the mounted widgets.
  const audioModule =
    "/@fs" +
    new URL(
      "../../../packages/music-practice/src/backing-track-audio.ts",
      import.meta.url,
    ).pathname;
  const result = await page.evaluate(async (moduleUrl) => {
    const { BackingTrackPlayer } = await import(/* @vite-ignore */ moduleUrl);
    const p: any = new BackingTrackPlayer();
    const c = p.audio();
    const clicks: { when: number; frequency: number }[] = [];
    const oscillator = c.createOscillator.bind(c);
    c.createOscillator = () => {
      const node = oscillator(),
        start = node.start.bind(node);
      node.start = (when: number) => {
        clicks.push({ when, frequency: node.frequency.value });
        start(when);
      };
      return node;
    };
    p.setMetronomeTempo(114);
    p.setMetronomeDownbeat(false);
    await p.startMetronome();
    await new Promise((r) => setTimeout(r, 650));
    const equalClicks = clicks.map((x) => x.frequency);
    p.setMetronomeDownbeat(true);
    p.setMetronomeSignature(3, 8);
    const accentStart = clicks.length;
    await new Promise((r) => setTimeout(r, 1800));
    const accentedClicks = clicks.slice(accentStart).map((x) => x.frequency);
    await p.play();
    await new Promise((r) => setTimeout(r, 800));
    const state = p.model.getSnapshot(),
      anchor = p.anchor;
    const synced = clicks
      .filter((x) => x.when >= anchor - 0.001)
      .map((x) =>
        Math.abs(
          ((x.when - anchor) * state.tempo) / 60 -
            Math.round(((x.when - anchor) * state.tempo) / 60),
        ),
      );
    const sampleTimes: { beat: number; when: number }[] = [];
    const sound = p.sound.bind(p);
    p.sound = (e: any, t: number, release = false, offset = 0) => {
      if (!release) sampleTimes.push({ beat: e.beat, when: t });
      sound(e, t, release, offset);
    };
    p.setStyle("rock");
    p.setMode("active");
    const beats = 256;
    p.reschedule(beats - 0.8, c.currentTime + 0.06);
    await new Promise((r) => setTimeout(r, 900));
    const crossed =
      sampleTimes.some((x) => x.beat > beats - 1) &&
      sampleTimes.some((x) => x.beat < 1);
    const maxGap = sampleTimes
      .slice(1)
      .reduce((n, x, i) => Math.max(n, x.when - sampleTimes[i].when), 0);
    p.pause();
    const retained = p.metronome.getSnapshot();
    p.pauseAll();
    const stopped = p.metronome.getSnapshot();
    await new Promise((r) => setTimeout(r, 100));
    // Render actual sample tails through every boundary, rather than checking
    // event timestamps alone. No count-in, ending or silent gap may recur.
    const { backingPack } = await import(
      /* @vite-ignore */ moduleUrl.replace(
        "backing-track-audio.ts",
        "backing-track-model.ts",
      )
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
    const realBuses = p.buses;
    const seams: number[] = [];
    for (const style of ["blues", "rock"])
      for (const mode of ["steady", "active"]) {
        const pattern = practiceBackingArrangement(
            style,
            mode,
            "major",
            0,
            style === "blues" ? 90 : 104,
          ),
          tempo = pattern.nativeTempo;
        const offline = new OfflineAudioContext(
          2,
          Math.ceil(((16 * 60) / tempo + 4) * 48000),
          48000,
        );
        p.context = offline;
        p.buses = new Map();
        p.model.set({
          ...p.model.getSnapshot(),
          style,
          mode,
          tempo,
          quality: "major",
        });
        p.buses = backingAudioGraph(offline, backingPack.levels).buses;
        const from = pattern.beats - 8;
        for (const event of pattern.events) {
          if (event.beat >= from)
            sound(event, ((event.beat - from) * 60) / tempo);
          else if (
            (event.part === "bass" || event.part === "guitar") &&
            event.beat + event.duration > from
          )
            sound(event, 0, false, from - event.beat);
          if (event.beat < 8) sound(event, ((event.beat + 8) * 60) / tempo);
        }
        const rendered = await offline.startRendering();
        const channel = rendered.getChannelData(0),
          seam = Math.round(((8 * 60) / tempo) * 48000);
        let min = Infinity;
        for (let frame = seam - 1440; frame <= seam + 1440; frame += 480) {
          let sum = 0;
          for (let i = frame; i < frame + 480; i++) sum += channel[i] ** 2;
          min = Math.min(min, Math.sqrt(sum / 480));
        }
        seams.push(min);
      }
    p.context = c;
    p.buses = realBuses;
    p.dispose();
    return {
      synced,
      crossed,
      maxGap,
      retained,
      stopped,
      seams,
      equalClicks,
      accentedClicks,
    };
  }, audioModule);
  assert.ok(
    result.equalClicks.length >= 1 &&
      result.equalClicks.every((f: number) => f === 1000),
  );
  assert.ok(
    result.accentedClicks.includes(1500) &&
      result.accentedClicks.includes(1000),
  );
  assert.ok(result.synced.length >= 1);
  assert.ok(
    result.synced.every((n: number) => n < 0.00001),
    "clicks share backing phase",
  );
  assert.ok(result.crossed, "events scheduled through long loop boundary");
  assert.ok(result.maxGap < 0.6, "no ending/count-in gap");
  assert.ok(
    result.seams.every((rms: number) => rms > 0.00001),
    "all four sample renders carry audio continuously through the seam",
  );
  assert.equal(result.retained.enabled, true);
  assert.equal(result.retained.tempo, 114);
  assert.equal(result.stopped.enabled, false);
  await page.setViewportSize({ width: 1280, height: 900 });
  if (process.env.SCREENSHOT)
    await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no mobile horizontal overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    engine +
      " backing/metronome controls, shared clock, loop seam and independent restoration passed",
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch((error) => {
    // macOS browsers can leave sandbox-owned entries in their temporary home.
    if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
  });
}
