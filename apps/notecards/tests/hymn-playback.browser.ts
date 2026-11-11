import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { midiAction } from "./navigation-helpers";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4374";
const base = `http://127.0.0.1:${port}`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const fixed = await mkdtemp(join(tmpdir(), "hymn-playback-"));
const browser = await { chromium, firefox, webkit }[engine]!.launch({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    const probe = ((window as any).playbackProbe = {
      starts: [] as number[],
      stops: 0,
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.starts.push(args[0] || 0);
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (
      ...args: Parameters<typeof stop>
    ) {
      probe.stops++;
      return stop.apply(this, args);
    };
  });
  await page.goto(base + "/piano/hymns?bars=2&mode=playback&tempo=200");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => (window as any).playbackProbe.starts.length),
    0,
    "never autoplays",
  );
  await midiAction(page, "Connect MIDI keyboard");
  const originalCount = await page.locator(".hymn-count").textContent();
  await page.evaluate(() => {
    for (let n = 36; n < 96; n++) {
      (window as any).midiTest.send([0x90, n, 100]);
      (window as any).midiTest.send([0x80, n, 0]);
    }
  });
  assert.equal(
    await page.locator(".hymn-count").textContent(),
    originalCount,
    "MIDI cannot advance or restart playback",
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => (window as any).playbackProbe.starts.length >= 2,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.locator(".hymn-count").textContent();
  const starts = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => (window as any).playbackProbe.starts.length),
    starts,
    "pause cancels scheduler",
  );
  assert.equal(await page.locator(".hymn-count").textContent(), paused);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForFunction(
    (n) => (window as any).playbackProbe.starts.length > n,
    starts,
  );
  await page
    .getByRole("combobox", { name: "Tempo", exact: true })
    .selectOption("100");
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.match(page.url(), /tempo=100/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile has no overflow",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page
    .getByRole("combobox", { name: "Tempo", exact: true })
    .selectOption("200");
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector("#hymn-section") as HTMLSelectElement)?.value ===
      "1",
    {},
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.match(
    page.url(),
    /section=2/,
    "playback automatically follows the next section",
  );
  // Jump to the last section and verify the hymn ends without opening another hymn.
  const lastSection = await page
    .locator("#hymn-section option")
    .last()
    .getAttribute("value");
  await page
    .getByRole("combobox", { name: "Section", exact: true })
    .selectOption(lastSection!);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".hymn-count")?.textContent === "Complete",
    {},
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".hymn-count").textContent(), "Complete");
  await page
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption("wait");
  assert.match(
    (await page.locator(".sequence-feedback").textContent()) || "",
    /highlighted/,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "Tempo", exact: true })
      .isVisible(),
    false,
  );
  // Playback never overwrites the independent wait-for-me bookmark.
  assert.match(
    (await page.locator(".hymn-count").textContent()) || "",
    /^1 \//,
  );
  await page
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption("playback");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Section", exact: true })
    .selectOption("1");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  const stopped = await page.evaluate(
    () => (window as any).playbackProbe.starts.length,
  );
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => (window as any).playbackProbe.starts.length),
    stopped,
    "changing sections stops audio",
  );
  // A hidden page pauses; returning never autoplays.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.evaluate(
    "Object.defineProperty(document, 'hidden', {configurable:true,get:function(){return true;}}); document.dispatchEvent(new Event('visibilitychange'));",
  );
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.evaluate(
    "Object.defineProperty(document, 'hidden', {configurable:true,get:function(){return false;}}); document.dispatchEvent(new Event('visibilitychange'));",
  );
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  // The learner can work on either hand independently, then combine them.
  await page.goto(
    base +
      "/piano/hymns/amazing-grace?arrangement=bass&hands=left&mode=wait&bars=2&section=1",
  );
  await page.locator(".hymn-paper .abcjs-note").first().waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  const send = async (note: number) => {
    await page.evaluate((note) => {
      (window as any).midiTest.send([0x90, note, 100]);
      (window as any).midiTest.send([0x80, note, 0]);
    }, note);
  };
  const number = async () =>
    (await page.locator(".hymn-count").textContent())!.split(" / ")[0];
  assert.equal(await page.locator("#hymn-hands").inputValue(), "left");
  assert.equal(await number(), "1");
  assert.equal(await page.locator("#hymn-view").inputValue(), "both");
  assert.ok(await page.locator(".hymn-paper .abcjs-clef").count() >= 2, "both staves remain visible during left-hand practice");
  await send(62);
  assert.equal(
    await number(),
    "1",
    "right-hand melody cannot answer left-hand practice",
  );
  await send(43);
  assert.equal(await number(), "2");
  await page
    .getByRole("combobox", { name: "Practise hands", exact: true })
    .selectOption("both");
  assert.equal(await number(), "1");
  await page.evaluate(() => (window as any).midiTest.send([0x90, 43, 100]));
  assert.equal(await number(), "1", "both hands wait for the complete onset");
  await send(62);
  await page.evaluate(() => (window as any).midiTest.send([0x80, 43, 0]));
  assert.equal(await number(), "2");
  await page
    .getByRole("combobox", { name: "Practise hands", exact: true })
    .selectOption("right");
  assert.equal(await number(), "1");
  await send(62);
  assert.equal(await number(), "2");
  await page
    .getByRole("combobox", { name: "Practise hands", exact: true })
    .selectOption("left");
  assert.equal(
    await number(),
    "2",
    "each hand selection restores its own position",
  );
  await page.reload();
  await page.locator(".hymn-paper .abcjs-note").first().waitFor();
  assert.equal(await page.locator("#hymn-hands").inputValue(), "left");
  assert.equal(await number(), "2", "left-hand bookmark survives reload");
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("right");
  assert.equal(await page.locator("#hymn-hands").inputValue(), "right");
  assert.equal(await page.locator('#hymn-hands option[value="left"]').evaluate(e => (e as HTMLOptionElement).disabled), true);
  assert.equal(await page.locator('#hymn-hands option[value="both"]').evaluate(e => (e as HTMLOptionElement).disabled), true);
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("left");
  assert.equal(await page.locator("#hymn-hands").inputValue(), "left");
  assert.equal(await page.locator('#hymn-hands option[value="right"]').evaluate(e => (e as HTMLOptionElement).disabled), true);
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("both");
  assert.equal(await page.locator('#hymn-hands option[value="both"]').evaluate(e => (e as HTMLOptionElement).disabled), false);
  await page
    .getByRole("combobox", { name: "Mode", exact: true })
    .selectOption("playback");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("both");
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Expand practice options", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("left");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: `/tmp/hymn-playback-${engine}.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: hymn playback, audio, pause/resume, live tempo, completion, mode isolation, section cancellation and mobile layout passed`,
  );
} finally {
  await browser.close();
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
