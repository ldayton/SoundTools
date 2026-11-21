import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import {
  launchBrowser,
  closeBrowser,
  newPage,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
const server = await preview("songalong", 4566);
const browser = await launchBrowser({ args: ["--mute-audio"] });
try {
  const page = await newPage(browser, {
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const state = ((window as any).instrumentProbe = { notes: [] as any[] });
    const events = new WeakMap<AudioParam, any[]>();
    for (const name of ["setValueAtTime", "linearRampToValueAtTime"] as const) {
      const original = AudioParam.prototype[name];
      AudioParam.prototype[name] = function (value: number, time: number) {
        const list = events.get(this) || [];
        list.push({ name, value, time });
        events.set(this, list);
        return original.call(this, value, time);
      };
    }
    const connect = AudioNode.prototype.connect;
    const gains = new WeakMap<AudioBufferSourceNode, GainNode>();
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (this instanceof AudioBufferSourceNode && args[0] instanceof GainNode)
        gains.set(this, args[0]);
      return connect.apply(this, args as any);
    } as typeof connect;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      const gain = gains.get(this);
      if (this.context instanceof AudioContext)
        state.notes.push({
          buffer: this.buffer,
          rate: this.playbackRate.value,
          when: args[0] || 0,
          events: gain ? [...(events.get(gain.gain) || [])] : [],
        });
      return start.apply(this, args);
    };
  });
  await mkdir("/tmp/songalong-instrument-audio", { recursive: true });
  const signatures: number[] = [];
  for (const arrangement of ["piano", "guitar-edition"]) {
    const requests: string[] = [];
    const listener = (request: any) => requests.push(request.url());
    page.on("request", listener);
    await page.goto(
      server.base +
        `/piano/hymns/amazing-grace?mode=playback&arrangement=${arrangement}&tempo=100&countIn=0`,
    );
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () => (window as any).instrumentProbe.notes.length >= 4,
      {},
      { timeout: 20000 },
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const audio = await page.evaluate(async () => {
      const notes = (window as any).instrumentProbe.notes;
      const first = Math.min(...notes.map((n: any) => n.when));
      const ctx = new OfflineAudioContext(2, 24000 * 6, 24000);
      for (const note of notes) {
        const source = ctx.createBufferSource();
        source.buffer = note.buffer;
        source.playbackRate.value = note.rate;
        const gain = ctx.createGain();
        for (const e of note.events)
          (gain.gain as any)[e.name](e.value, Math.max(0, e.time - first));
        source.connect(gain).connect(ctx.destination);
        source.start(Math.max(0, note.when - first));
      }
      const rendered = await ctx.startRendering();
      const pcm = rendered.getChannelData(0);
      return {
        samples: Array.from(pcm),
        peak: pcm.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0),
        rate: 24000,
        rms: Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length),
        lengths: notes.map((n: any) => n.buffer.duration),
      };
    });
    assert.ok(audio.samples.every(Number.isFinite));
    assert.ok(audio.peak > 0.001);
    assert.ok(audio.peak < 1, `unclipped ${arrangement}: ${audio.peak}`);
    assert.ok(
      audio.lengths.every((n: number) => n > 2),
      "long natural sample tails",
    );
    assert.ok(
      requests.some((url) =>
        arrangement === "piano"
          ? /\d+-v[4812]+-/.test(url)
          : /acoustic-|folk-steel-/.test(url),
      ),
    );
    if (arrangement === "piano") {
      for (const layer of [4, 8, 12])
        assert.ok(
          requests.some((url) => new RegExp(`-v${layer}-`).test(url)),
          `recorded piano layer ${layer} loaded`,
        );
    }
    signatures.push(audio.rms);
    const pcm = Buffer.alloc(audio.samples.length * 2);
    audio.samples.forEach((x: number, i: number) =>
      pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2),
    );
    const header = Buffer.alloc(44);
    header.write("RIFF");
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(audio.rate, 24);
    header.writeUInt32LE(audio.rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    await writeFile(
      `/tmp/songalong-instrument-audio/${arrangement}.wav`,
      Buffer.concat([header, pcm]),
    );
    const pausedStarts = await page.evaluate(
      () => (window as any).instrumentProbe.notes.length,
    );
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => (window as any).instrumentProbe.notes.length),
      pausedStarts,
      "pause cancels scheduling",
    );
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.waitForFunction(
      (before) => (window as any).instrumentProbe.notes.length > before,
      pausedStarts,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    page.off("request", listener);
    console.log(
      `${arrangement}: real browser samples, envelope render, peak ${audio.peak.toFixed(3)}, RMS ${audio.rms.toFixed(4)}`,
    );
  }
  assert.notEqual(signatures[0], signatures[1]);
  assert.deepEqual(errors, []);
} finally {
  await closeBrowser(browser);
  server.stop();
}
