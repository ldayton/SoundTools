import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const port = "4361";
const base = `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const browser = await chromium.launch();
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Math.random = () => 0;
    const state = ((window as any).soundProbe = {
      starts: [] as { duration: number; rate: number }[],
      analysers: [] as AnalyserNode[],
    });
    const compressor = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const node = compressor.call(this);
      const analyser = this.createAnalyser();
      node.connect(analyser);
      const silent = this.createGain();
      silent.gain.value = 0;
      analyser.connect(silent).connect(this.destination);
      const connect = node.connect.bind(node);
      node.connect = ((destination: AudioNode) => {
        (state as any).master = destination;
        return connect(destination);
      }) as typeof node.connect;
      state.analysers.push(analyser);
      return node;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      state.starts.push({
        duration: this.buffer?.duration || 0,
        rate: this.playbackRate.value,
      });
      return start.apply(this, args);
    };
  });
  await page.goto(
    base + "/piano/keys?key=C&low=C4&high=B4&show=staff&clef=treble",
  );
  await page
    .locator('#piano [data-piano="60"][aria-disabled="false"]')
    .waitFor();
  await page.locator('#piano [data-piano="60"]').click();
  await page.waitForFunction(
    () => (window as any).soundProbe.starts.length === 1,
  );
  await page.waitForFunction(() =>
    (window as any).soundProbe.analysers.some((a: AnalyserNode) => {
      const data = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(data);
      return data.some((sample) => Math.abs(sample) > 0.0001);
    }),
  );
  const first = await page.evaluate(() => (window as any).soundProbe.starts[0]);
  assert.ok(
    first.duration > 1.9 && first.duration < 2.1,
    "plays a decoded real recording",
  );
  assert.equal(first.rate, 1, "C4 plays its original sampled pitch");
  await page.locator("#restart-round").click();
  await page.locator('#piano [data-piano="61"][aria-disabled="false"]').click();
  await page.waitForFunction(
    () => (window as any).soundProbe.starts.length === 2,
  );
  assert.ok(
    Math.abs(
      (await page.evaluate(() => (window as any).soundProbe.starts[1].rate)) -
        2 ** (1 / 12),
    ) < 1e-6,
  );
  await page.locator("#restart-round").click();
  await page.locator('#piano [data-piano="60"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => (window as any).soundProbe.starts.length === 3,
  );
  await page.goto(base + "/settings");
  const volume = page.getByRole("slider", { name: "Piano volume" });
  await volume.waitFor();
  assert.equal(await volume.getAttribute("aria-valuenow"), "100");
  await volume.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 35; i++) await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#piano-volume-value").textContent(), "35");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await volume.waitFor();
  assert.equal(
    await volume.getAttribute("aria-valuenow"),
    "35",
    "volume survives reload",
  );
  for (const width of [320, 390, 768, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px Settings does not overflow`,
    );
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Share diagnostic information" })
        .count(),
      1,
    );
    const slider = await volume.boundingBox();
    assert.ok(slider && slider.width > 0, "standard slider remains visible");
  }
  await page.screenshot({
    path: "/tmp/notecards-settings-desktop.png",
    fullPage: true,
  });
  await volume.focus();
  await page.keyboard.press("Home");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.goto(
    base + "/piano/keys?key=C&low=C4&high=B4&show=staff&clef=treble",
  );
  await page.locator("#restart-round").click();
  await page.locator('#piano [data-piano="60"][aria-disabled="false"]').click();
  await page.waitForFunction(
    () => (window as any).soundProbe.starts.length === 1,
  );
  assert.equal(
    await page.evaluate(() => (window as any).soundProbe.master.gain.value),
    0,
    "saved zero volume mutes playback",
  );
  // Whole-hymn practice has three mobile controls; completed practice adds Next hymn.
  await page.goto(
    base + "/piano/hymns/amazing-grace?arrangement=melody&bars=4&section=1",
  );
  await page.locator(".hymn-paper svg").first().waitFor();
  for (const width of [320, 390, 600]) {
    await page.setViewportSize({ width, height: 844 });
    const controls = await page
      .locator("#sight-reading .sequence-transport button:visible")
      .evaluateAll((buttons) =>
        buttons.map((b) => {
          const box = b.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            textFits: b.scrollWidth <= b.clientWidth + 1,
          };
        }),
      );
    assert.equal(controls.length, 3);
    assert.ok(
      controls.every(
        (b) =>
          Math.abs(b.width - controls[0].width) < 1 &&
          b.height >= 44 &&
          b.textFits,
      ),
      `${width}px controls align and fit`,
    );
  }
  const pack = JSON.parse(
    await readFile(
      new URL("../dist/offline-pack.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    pack.files.filter((f: { url: string }) => f.url.endsWith(".flac")).length,
    21,
    "recordings are included offline",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Recorded piano output, pitch transposition, pointer/Enter playback, offline samples and aligned mobile controls passed.",
  );
} finally {
  await browser.close();
  server.kill();
}
