import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4334";
const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}/`;
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = process.env.TEST_BASE_URL
  ? undefined
  : spawn(
      process.execPath,
      [vite, "preview", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { stdio: "ignore" },
    );
const fixed = await mkdtemp(join(tmpdir(), "notecards-midi-"));
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server && server.exitCode !== null) throw Error("Preview exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await type.launch({
    env: { ...process.env, CFFIXED_USER_HOME: fixed },
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  await context.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  assert.ok(await page.locator("#midi-panel").isHidden());
  await page.locator("#mode").selectOption("piano");
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => (window as any).midiTest.calls()), 0);
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => (window as any).midiTest.options),
    [{ sysex: false, software: false }],
  );
  const send = (data: number[], id = "roland", stale = false) =>
    page.evaluate(
      ({ data, id, stale }) =>
        (window as any).midiTest.send(data, id, stale ? 0 : performance.now()),
      { data, id, stale },
    );
  const on = (note: number, id = "roland") => send([0x90, note, 100], id);
  const off = (note: number, id = "roland") => send([0x90, note, 0], id);
  const ready = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector("[data-piano]")
          ?.getAttribute("aria-disabled") === "false",
    );
  await on(72); // C5 does not satisfy C4.
  assert.match(
    (await page.locator("#feedback").textContent())!,
    /That’s C4. You chose C5/,
  );
  await on(72);
  await on(76);
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  await ready();
  await on(72);
  await on(79); // held chord never answers another card
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  for (const n of [72, 76, 79]) await off(n);
  await on(62);
  assert.equal(await page.locator("#feedback").textContent(), "Yes — D4");
  await off(62);
  await ready();
  // Focus loss ignores playing, and held notes stay ignored on return.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await on(60);
  assert.equal(await page.locator("#progress").getAttribute("value"), "2");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await on(60);
  assert.equal(await page.locator("#progress").getAttribute("value"), "2");
  await off(60);
  await send([0x90, 61, 90], "roland", true);
  await off(61);
  assert.equal(await page.locator("#progress").getAttribute("value"), "2");
  await on(60);
  assert.equal(await page.locator("#feedback").textContent(), "Yes — C4");
  await off(60);
  await ready();
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#pianoPrompt").selectOption("name");
  await on(48); // C in any octave answers a letter prompt.
  assert.equal(await page.locator("#feedback").textContent(), "Yes — C");
  assert.ok(
    await page
      .locator('[data-piano="60"]')
      .evaluate((e) => e.classList.contains("is-right")),
  );
  await off(48);
  await ready();
  await page.evaluate(() => (window as any).midiTest.remove("roland"));
  assert.match(
    (await page.locator(".midi-status").textContent())!,
    /Connect your keyboard by USB/,
  );
  await page.evaluate(() =>
    (window as any).midiTest.add("GO:KEYS 5", "replugged"),
  );
  await page
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor();
  await page.evaluate(() =>
    (window as any).midiTest.add("Second keyboard", "second"),
  );
  await page.getByLabel("MIDI input", { exact: true }).selectOption("second");
  await page
    .getByText("Second keyboard connected. Play one note at a time.", {
      exact: true,
    })
    .waitFor();
  await on(62, "replugged");
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  await on(62, "second");
  assert.equal(await page.locator("#feedback").textContent(), "Yes — D");
  await off(62, "second");
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Practice options", { exact: true }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mkdir("../../work", { recursive: true });
  await page.screenshot({
    path: `../../work/midi-mobile-${engine}.png`,
    fullPage: true,
  });
  await page.locator("#mode").selectOption("signature");
  await on(60, "second");
  await off(60, "second");
  assert.equal(await page.locator("#progress").getAttribute("value"), "0");
  assert.ok(await page.locator("#midi-panel").isHidden());
  await page.locator("#mode").selectOption("piano");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await on(60, "second");
  assert.equal(await page.locator("#progress").getAttribute("value"), "0");
  await page.evaluate(() => (window as any).midiTest.deny(true));
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page.getByText(/MIDI access wasn’t allowed/).waitFor();
  await page.evaluate(() => (window as any).midiTest.deny(false));
  await page.getByRole("button", { name: "Retry MIDI", exact: true }).click();
  await page
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor();
  await page.evaluate(() => (window as any).midiTest.revoke());
  await page.getByText(/MIDI access wasn’t allowed/).waitFor();
  await on(60, "replugged");
  assert.equal(await page.locator("#progress").getAttribute("value"), "0");
  await page.evaluate(() => (window as any).midiTest.deny(false));
  await page.getByRole("button", { name: "Retry MIDI", exact: true }).click();
  await page
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor();
  // Complete a whole round using only physical-note messages.
  for (let i = 0; i < 12; i++) {
    await ready();
    const letter = (await page.locator("#target-name").textContent())!;
    const note = (
      { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 } as Record<
        string,
        number
      >
    )[letter];
    await on(note, "replugged");
    await off(note, "replugged");
  }
  await page.locator("#continue").waitFor();
  assert.equal(await page.locator("#result").textContent(), "12 of 12 correct");
  await on(60, "replugged");
  await off(60, "replugged");
  assert.equal(await page.locator("#result").textContent(), "12 of 12 correct");
  await page.getByRole("button", { name: "Keep going" }).click();
  // Device names/IDs are not persisted in preferences or diagnostics.
  assert.ok(
    !(await page.evaluate(
      () =>
        JSON.stringify(localStorage).includes("GO:KEYS") ||
        JSON.stringify(localStorage).includes("replugged"),
    )),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  await context.setOffline(true);
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => (window as any).midiTest.calls()), 0);
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor();
  await on(60);
  assert.equal(await page.locator("#feedback").textContent(), "Yes — C");
  await context.setOffline(false);
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() =>
    Object.defineProperty(navigator, "requestMIDIAccess", { value: undefined }),
  );
  const fallback = await unsupported.newPage();
  await fallback.goto(base);
  await fallback.locator('[data-letter="E"]:enabled').waitFor();
  await fallback.locator("#mode").selectOption("piano");
  await fallback
    .getByText(
      "To use a MIDI keyboard, open this app in Chrome on a computer.",
      { exact: true },
    )
    .waitFor();
  assert.ok(
    await fallback
      .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
      .isHidden(),
  );
  assert.ok(await fallback.locator('[data-piano="60"]').isVisible());
  await unsupported.close();
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: simulated MIDI grading, held/chord guards, focus, hotplug, input switching, denied/retry, offline and unsupported fallback passed`,
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (error: NodeJS.ErrnoException) => {
      // macOS may protect the browser-created Downloads directory.
      if (error.code !== "EACCES" && error.code !== "EPERM") throw error;
    },
  );
}
