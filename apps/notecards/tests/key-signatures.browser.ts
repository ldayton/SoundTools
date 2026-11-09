import { signatureDeck, signatureAnswer } from "../src/key-signatures";
import { KEYS } from "../src/model";
import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const engine = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[engine]!;
const port = process.env.TEST_PORT || "4331";
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
const fixed = await mkdtemp(join(tmpdir(), "notecards-signatures-"));
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
  await context.addInitScript(() => {
    const index = Number(localStorage.getItem("test:signature-index") || 0);
    Math.random = () => (index + 0.1) / 30;
    localStorage.setItem(
      "soundtools:notecards:v1",
      JSON.stringify({
        version: 4,
        mode: "signature",
        profiles: { signature: { signaturePractice: "both" } },
      }),
    );
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const cards = signatureDeck("both");
  for (const [index, card] of cards.entries()) {
    await page.evaluate(
      (i) => localStorage.setItem("test:signature-index", String(i)),
      index,
    );
    // Each notation fixture starts with no review weighting; recovery has its own suite.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const r = indexedDB.open("soundtools-notecards");
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction("state", "readwrite");
            tx.objectStore("state").delete("root");
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    if (await page.locator("#feedback-next").isVisible())
      await page.locator("#feedback-next").click();
    await page.locator("#restart-round").click();
    await page.locator('[data-letter="C"]:enabled').waitFor();
    assert.equal(await page.locator("#mode").inputValue(), "signature");
    assert.equal(
      await page.locator("#context").textContent(),
      "Key signatures",
    );
    assert.equal(
      await page.locator("#signature-prompt").textContent(),
      card.tonality === "major" ? "Major key" : "Minor key",
    );
    assert.equal(await page.locator(".vf-stavenote").count(), 0);
    assert.equal(await page.locator(".vf-keysignature").count(), 1);
    assert.ok(await page.locator("#piano").isHidden());
    assert.ok(await page.locator("#fretboard").isHidden());
    await page.getByText("Practice options", { exact: true }).click();
    for (const id of ["#key-setting", "#guitar-options", "#pitch-range"])
      assert.ok(await page.locator(id).isHidden());
    await page.getByText("Practice options", { exact: true }).click();
    // Each new card contains exactly the same correctly positioned signature as our established renderer.
    const paths = await page.locator(".vf-keysignature text").count();
    const accidentalCount = Math.abs(
      KEYS.find((k) => k.id === card.signature)!.count,
    );
    assert.equal(paths, accidentalCount, `Card ${index}: ${card.id}`);
    const glyphs = await page
      .locator(".vf-keysignature text")
      .allTextContents();
    assert.ok(
      glyphs.every(
        (g) =>
          g ===
          (KEYS.find((k) => k.id === card.signature)!.count < 0
            ? "\uE260"
            : "\uE262"),
      ),
    );

    if (index === 19) {
      await page.setViewportSize({ width: 390, height: 844 });
      await mkdir("../../work", { recursive: true });
      await page.screenshot({
        path: `../../work/key-signatures-mobile-${engine}.png`,
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page
      .getByRole("button", {
        name:
          card.modifier === -1
            ? "Flat"
            : card.modifier === 1
              ? "Sharp"
              : "Natural",
        exact: true,
      })
      .click();
    await page.locator(`[data-letter="${card.letter}"]`).click();
    assert.equal(
      await page.locator("#feedback").textContent(),
      `Yes — ${signatureAnswer(card)}`,
    );
    assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  }
  // Incorrect and repeated inputs count only once, then the accidental resets.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("soundtools-notecards");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("state", "readwrite");
          tx.objectStore("state").delete("root");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await page.locator('[data-letter="C"]:enabled').waitFor();
  await page.keyboard.press("+");
  await page.keyboard.press("C");
  assert.match(
    (await page.locator("#feedback").textContent())!,
    /That’s A♭ minor/,
  );
  await page.keyboard.press("C");
  assert.equal(await page.locator("#progress").getAttribute("value"), "1");
  await page.waitForFunction(() =>
    document.querySelector("#feedback")?.textContent?.startsWith("Name the "),
  );
  assert.equal(
    await page.locator('[data-mod="0"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.getByText("Practice options", { exact: true }).click();
  await page.locator("#signaturePractice").selectOption("major");
  assert.equal(
    await page.locator("#signature-prompt").textContent(),
    "Major key",
  );
  await page.locator("#signaturePractice").selectOption("minor");
  assert.equal(
    await page.locator("#signature-prompt").textContent(),
    "Minor key",
  );
  await page.locator("#mode").selectOption("piano");
  assert.ok(await page.locator("#signature-prompt").isHidden());
  assert.ok(await page.locator("#piano").isVisible());
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: all 30 major/minor signatures, engraved accidentals, answer spelling, keyboard/touch, mobile and mode switching passed`,
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
