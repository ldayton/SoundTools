import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { iphone14Pro, macBookAir13 } from "../../../scripts/test-devices.cjs";
import abcjs from "abcjs";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  openPracticeOptions,
  closePracticeOptions,
  practiceOption,
  midiAction,
  closeNavigation,
} from "../../../packages/music-practice/browser-tests/helpers";

const engine = process.env.TEST_BROWSER || "chromium";
const port = process.env.TEST_PORT || "4390";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`;
const home = await mkdtemp(join(tmpdir(), "songalong-stanzas-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await { chromium, firefox, webkit }[engine]!.launch({
    args: engine === "chromium" ? ["--mute-audio"] : [],
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  const page = await browser.newPage({
    ...macBookAir13,
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  const audioFailures: string[] = [];
  // WebKit's protocol reports caught outgoing-document fetch cancellations as
  // pageerror (microsoft/playwright#44015). Observe real uncaught JS errors and
  // failed HTTP responses instead; the audio probes below still require actual
  // scheduled playback, so failed sound loading cannot silently pass.
  await page.exposeFunction("recordStanzaError", (message: string) =>
    errors.push(message),
  );
  await page.addInitScript(() => {
    window.addEventListener("error", (event) =>
      (window as any).recordStanzaError(event.message),
    );
    window.addEventListener("unhandledrejection", (event) =>
      (window as any).recordStanzaError(String(event.reason)),
    );
  });
  page.on("response", (response) => {
    if (response.url().endsWith(".flac") && response.status() >= 400)
      audioFailures.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript({
    content: await readFile(
      new URL(
        "../../../packages/music-practice/test-fixtures/midi.js",
        import.meta.url,
      ),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    const probe = ((window as any).stanzaPlayback = {
      starts: [] as number[],
      clicks: [] as number[],
    });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      probe.starts.push(args[0] || 0);
      return start.apply(this, args);
    };
    const click = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<typeof click>
    ) {
      probe.clicks.push(args[0] || 0);
      return click.apply(this, args);
    };
    const connect: Function = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
      if (args[0] === this.context.destination) {
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(mute, this.context.destination);
        return connect.call(this, mute);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
  const visit = async (id: string, query = "") => {
    await page.goto(`${base}/piano/hymns/${id}${query}`);
    await page.locator(".hymn-paper svg").first().waitFor();
    await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  };
  const lyricWords = () =>
    page.locator(".hymn-paper .abcjs-lyric").allTextContents();
  await visit("jesus-loves-me");
  const checks = page.locator("#hymn-stanzas input[type=checkbox]");
  assert.equal(await checks.count(), 3);
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [true, false, false],
  );
  const firstHeight = await page
    .locator(".hymn-paper svg")
    .first()
    .evaluate((e) => e.getBoundingClientRect().height);
  await checks.nth(1).check();
  await checks.nth(2).check();
  assert.equal(
    (await lyricWords()).filter((w) => w.trim().startsWith("Yes")).length,
    3,
    "Shared chorus appears once",
  );
  assert(
    (await page
      .locator(".hymn-paper svg")
      .first()
      .evaluate((e) => e.getBoundingClientRect().height)) > firstHeight,
    "Extra stanzas create extra lyric lines",
  );
  await checks.nth(0).uncheck();
  assert.equal(
    (await lyricWords()).filter((w) => w.trim().startsWith("Yes")).length,
    3,
    "Chorus remains when stanza one is hidden",
  );
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await checks.nth(2).waitFor();
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [false, true, true],
  );
  const score = page.locator(".sequence-score");
  await score.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const position = await page.locator(".hymn-count").textContent();
  await checks.nth(0).check();
  await expect(page.locator(".hymn-count")).toHaveText(
    new RegExp(position!.split(" · ").at(-1)!.replace(/ /g, "\\s*")),
  );
  await score.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await checks.nth(0).uncheck();
  await expect(
    page.getByRole("slider", { name: "Selection end", exact: true }),
  ).toHaveAttribute("aria-valuenow", "2");
  await page.locator(".hymn-clear-passage").click();
  await practiceOption(page, "#hymn-mode", "playback");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await checks.nth(0).check();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await checks.nth(0).uncheck();
  await checks.nth(1).uncheck();
  await checks.nth(2).uncheck();
  assert.equal(await page.locator(".abcjs-lyric").count(), 0);
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await checks.nth(2).waitFor();
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [false, false, false],
  );
  await visit("amazing-grace");
  assert.deepEqual(
    await checks.evaluateAll((es) =>
      es.map((e) => (e as HTMLInputElement).checked),
    ),
    [true, false, false],
    "Another hymn starts with only its first stanza",
  );
  await visit("in-christ-alone", "?stanzas=3");
  await expect
    .poll(async () => (await lyricWords()).filter((w) => w.trim()).at(-1) || "")
    .toMatch(/stand/);
  const lastStanzaNotes = await page.locator(".hymn-paper .abcjs-note").count();
  await checks.nth(0).check();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  assert(
    (await page.locator(".hymn-paper .abcjs-note").count()) > lastStanzaNotes,
    "The Oh ending returns when an earlier stanza is shown",
  );
  await checks.nth(0).uncheck();
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await expect
    .poll(async () => (await lyricWords()).filter((w) => w.trim()).at(-1) || "")
    .toMatch(/stand/);
  const references: Record<string, string> = {
    "in-christ-alone": "3ch6eXkQWU8",
    "jesus-loves-me": "-jABcYKhDrI",
    "amazing-grace": "9ZXxIyjTY1s",
    "ill-fly-away": "192W0bhJNEg",
    "o-come-all-ye-faithful": "AuwoGmsUWhU",
  };
  for (const [id, video] of Object.entries(references)) {
    await visit(id);
    await page
      .getByRole("button", { name: "About this hymn", exact: true })
      .click();
    const reference = page.getByRole("link", { name: /^Reference recording/ });
    await expect(reference).toHaveAttribute(
      "href",
      `https://www.youtube.com/watch?v=${video}`,
    );
    const details: Record<string, string> = {
      "amazing-grace": "B major, 72 BPM",
      "in-christ-alone": "D major, 67 BPM",
      "jesus-loves-me": "G major, 125 BPM",
      "ill-fly-away": "B major, 102 BPM",
      "o-come-all-ye-faithful": "E major, 91 BPM",
    };
    await expect(reference).toHaveText(`Reference recording (${details[id]})`);
  }
  for (const viewport of [macBookAir13.viewport, iphone14Pro.viewport]) {
    await page.setViewportSize(viewport);
    for (const hymn of hymns) {
      await visit(
        hymn.id,
        "?stanzas=" + hymn.stanzas.map((s) => s.number).join(","),
      );
      assert.equal(
        (await page.locator(".hymn-paper .abcjs-lyric").count()) > 0,
        true,
        hymn.id,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        hymn.id + " no page overflow",
      );
      assert.equal(
        await page.locator(".sequence-feedback.error").count(),
        0,
        hymn.id,
      );
      const collisions = await page
        .locator(".abcjs-lyric")
        .evaluateAll((es) => {
          const words = es
            .filter((e) => e.textContent?.trim())
            .map((e) => ({
              text: e.textContent!,
              box: e.getBoundingClientRect(),
            }));
          return words
            .filter(
              (w, i) =>
                i > 0 &&
                Math.abs(w.box.y - words[i - 1].box.y) < 2 &&
                w.box.x < words[i - 1].box.right - 1,
            )
            .map((w) => w.text);
        });
      assert.deepEqual(collisions, [], hymn.id + " lyric overlap");
    }
  }
  await visit("amazing-grace", "?stanzas=1,2,3");
  await openPracticeOptions(page);
  const bounds = await page.locator(".hymn-stanza-checkbox").evaluateAll((es) =>
    es.map((e) => ({
      left: e.getBoundingClientRect().left,
      right: e.getBoundingClientRect().right,
    })),
  );
  assert(
    bounds.every((b) => b.left >= 0 && b.right <= iphone14Pro.viewport.width),
    "Labels never widen the options sheet",
  );
  await mkdir("work", { recursive: true });
  await page.screenshot({
    path: `work/hymn-stanzas-${engine}-mobile-options.png`,
  });
  await closePracticeOptions(page);
  await page.screenshot({ path: `work/hymn-stanzas-${engine}-mobile.png` });
  await page.setViewportSize(macBookAir13.viewport);
  await openPracticeOptions(page);
  await page.screenshot({ path: `work/hymn-stanzas-${engine}-desktop.png` });
  // Wait for me advances only after the final answer, skips unchecked stanzas,
  // and restores the active stanza as well as its note after reload.
  const attacks = (id: string) => {
    const hymn = hymns.find((h) => h.id === id)!;
    const audio = abcjs
      .parseOnly(arrangeHymn(hymn, "melody", 0).abc)[0]
      .setUpAudio({ qpm: 60, chordsOff: true });
    return {
      pitches: audio.tracks[0].flatMap((n) =>
        n.cmd === "note" ? [n.pitch] : [],
      ),
      duration: audio.totalDuration * 4,
    };
  };
  const send = async (notes: number[]) =>
    page.evaluate((notes) => {
      for (const pitch of notes) {
        (window as any).midiTest.send([0x90, pitch, 100]);
        (window as any).midiTest.send([0x80, pitch, 0]);
      }
    }, notes);
  const connectMidi = async () => {
    if (
      (await page.locator(".keyboard-menu").getAttribute("data-state")) !==
      "connected"
    )
      await midiAction(page, "Connect MIDI keyboard");
    await closeNavigation(page);
  };
  const counter = page.locator(".hymn-count");
  await visit("amazing-grace", "?stanzas=1,3&mode=wait&octave=0");
  await connectMidi();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  const grace = attacks("amazing-grace");
  await send(grace.pitches);
  await expect(counter).toHaveText(/Stanza 2\/2 · 1 \/ 35/);
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await expect(counter).toHaveText(/Stanza 2\/2 · 1 \/ 35/);
  await connectMidi();
  await send(grace.pitches);
  await expect(counter).toHaveText(/Stanza 2\/2 · Complete/);
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(counter).toHaveText(/Stanza 1\/2 · 1 \/ 35/);

  await visit("in-christ-alone", "?stanzas=2,3&mode=wait&octave=0");
  await connectMidi();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  const christ = attacks("in-christ-alone");
  await send(christ.pitches);
  await expect(counter).toHaveText(/Stanza 2\/2 · 1 \/ 64/);
  await send(christ.pitches.slice(0, 64));
  await expect(counter).toHaveText(/Complete/);

  // Real (muted) audio scheduling: the next pickup is scheduled on the same
  // clock, with no inserted silence or second automatic count-in.
  await visit(
    "amazing-grace",
    "?stanzas=1,3&mode=playback&tempo=200&countIn=1&octave=0",
  );
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () => (window as any).stanzaPlayback.starts.length > 0,
  );
  const clickCount = await page.evaluate(
    () => (window as any).stanzaPlayback.clicks.length,
  );
  await expect(counter).toHaveText(/Stanza 2\/2 ·/, {
    timeout: ((grace.duration * 60) / 200) * 1000 + 15000,
  });
  await expect(page.locator(".hymn-stanza-indicator")).toHaveText("Stanza 2/2");
  await page.screenshot({ path: `work/hymn-stanza-transition-${engine}.png` });
  const probe = await page.evaluate(
    () =>
      (window as any).stanzaPlayback as { starts: number[]; clicks: number[] },
  );
  assert.equal(
    probe.clicks.length,
    clickCount,
    "Only one count-in for the complete song",
  );
  const boundary = probe.starts[0] + (grace.duration * 60) / 200;
  assert(
    probe.starts.some((time) => Math.abs(time - boundary) < 0.02),
    "No added delay between stanzas",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedVerse = await counter.textContent();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(counter).toHaveText(/Stanza 2\/2 ·/);
  await expect(counter).toHaveText(/Stanza 2\/2 · Complete/, {
    timeout: ((grace.duration * 60) / 200) * 1000 + 15000,
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(counter).toHaveText(/Stanza 1\/2 ·/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert(pausedVerse?.startsWith("Stanza 2/2"));
  assert.deepEqual(audioFailures, []);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: stanza defaults, shared choruses, persistence, playback continuity, all hymn layouts, compact labels, reference links, gapless stanza playback, practice advancement and verse reload passed`,
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
