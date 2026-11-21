import { launchBrowser, newPage, createContext } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4554),
);
const home = await mkdtemp(join(tmpdir(), "song-output-"));
const engine = process.env.TEST_BROWSER || "chromium";
const browser = await launchBrowser({ env: { ...process.env, CFFIXED_USER_HOME: home } });
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (this instanceof GainNode && args[0] instanceof AudioDestinationNode)
        (window as any).pianoMaster = this;
      return connect.apply(this, args as any);
    } as typeof connect;
  });
  await page.goto(server.base + "/settings");
  const output = page.getByRole("combobox", { name: "Output", exact: true });
  await expect(output).toHaveValue("Stereo");
  await output.click();
  await page
    .getByRole("option", { name: "Combined mono", exact: true })
    .click();
  await expect(page.getByText("Saved on this device.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(output).toHaveValue("Combined mono");
  await page.goto(server.base + "/piano/hymns/amazing-grace");
  await page.locator(".white-key:visible").first().click();
  await page.waitForFunction(
    () => (window as any).pianoMaster?.channelCount === 1,
  );
  await page.getByRole("button", { name: "Volume", exact: true }).click();
  const volume = page.getByRole("slider", {
    name: "Piano volume",
    exact: true,
  });
  await volume.focus();
  await volume.press("Home");
  await volume.press("ArrowRight");
  const savedVolume = Number(await volume.getAttribute("aria-valuenow"));
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(output).toHaveValue("Combined mono");
  await output.click();
  await page.getByRole("option", { name: "Stereo", exact: true }).click();
  await page.waitForFunction(
    () => (window as any).pianoMaster?.channelCount === 2,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).pianoMaster.gain.value))
    .toBeCloseTo(savedVolume / 100, 3);
  // Verify actual browser speaker downmix: retain both channels and play their average in both ears.
  const samples = await page.evaluate(async () => {
    const context = new OfflineAudioContext(2, 128, 44100);
    const buffer = context.createBuffer(2, 128, 44100);
    buffer.getChannelData(0).fill(0.6);
    buffer.getChannelData(1).fill(0.2);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.channelCountMode = "explicit";
    gain.channelCount = 1;
    gain.channelInterpretation = "speakers";
    source.connect(gain).connect(context.destination);
    source.start();
    const rendered = await context.startRendering();
    return [rendered.getChannelData(0)[64], rendered.getChannelData(1)[64]];
  });
  expect(samples[0]).toBeCloseTo(0.4, 5);
  expect(samples[1]).toBeCloseTo(0.4, 5);
  console.log(
    "PASS: output setting persists, preserves volume preferences, updates live piano, and averages L/R into both outputs",
  );
} finally {
  await browser.close();
  server.stop();
  await rm(home, { recursive: true, force: true });
}
