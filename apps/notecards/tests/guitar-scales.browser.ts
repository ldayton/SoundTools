import {
  selectPractice,
  practiceOption,
  midiAction,
  setPianoVisible,
  openPracticeOptions,
  closePracticeOptions,
} from "./navigation-helpers";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package\.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", "4352", "--strictPort"],
  { stdio: "ignore" },
);
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch("http://127.0.0.1:4352")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const fixed = await mkdtemp(join(tmpdir(), "notecards-guitar-scales-"));
const browser = await (
  { chromium, firefox, webkit }[process.env.TEST_BROWSER || "chromium"] ||
  chromium
).launch({ env: { ...process.env, CFFIXED_USER_HOME: fixed } });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  await page.addInitScript({
    content: await readFile(
      new URL("./fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4352");
  await page.locator('[data-letter="E"]:enabled').waitFor();
  const saved = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("soundtools-notecards", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return new Promise<any>((resolve, reject) => {
        const r = db
          .transaction("state", "readonly")
          .objectStore("state")
          .get("root");
        r.onsuccess = () => {
          db.close();
          resolve(r.result.state);
        };
        r.onerror = () => reject(r.error);
      });
    });
  await selectPractice(page, "sight");
  await page.locator(".hymn-paper svg").first().waitFor();
  await midiAction(page, "Connect MIDI keyboard");
  await page
    .getByText("GO:KEYS 5 connected. Play at your own pace.", { exact: true })
    .waitFor({ state: "attached" });
  await page.evaluate(() => {
    (window as any).midiTest.send([0x90, 62, 100]);
    (window as any).midiTest.send([0x80, 62, 0]);
  });
  await page.getByText("2 / 35", { exact: true }).waitFor();
  await selectPractice(page, "guitar-scales");
  await page.getByRole("heading", { name: "E major", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await practiceOption(page, "#scale-pattern", "map");
  const before = await saved();
  await practiceOption(page, "#scale-key", "0");
  const locations = async () =>
    page
      .locator(".scale-tone")
      .evaluateAll((nodes) =>
        nodes.map((n) => [
          n.getAttribute("data-string"),
          n.getAttribute("data-fret"),
        ]),
      );
  const originalLocations = await locations();
  const rootPitchClasses = () =>
    page
      .locator(".scale-root")
      .evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute("data-midi")) % 12),
      );
  const saveComplete = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#saved")?.textContent ===
        "Saved on this device.",
    );
  await page
    .getByRole("button", {
      name: "Show A minor starting position",
      exact: true,
    })
    .click();
  assert.equal(await page.locator("#scale-title").textContent(), "C major");
  assert.equal(await page.locator("#scale-pattern").inputValue(), "5");
  assert.ok((await rootPitchClasses()).every((pc) => pc === 0));
  assert.match(page.url(), /key=C&scale=major&pattern=5/);
  await saveComplete();
  await page.reload();
  await page
    .getByRole("button", { name: "Return to previous shape", exact: true })
    .click();
  assert.equal(await page.locator("#scale-pattern").inputValue(), "map");
  assert.deepEqual(await locations(), originalLocations);
  await practiceOption(page, "#scale-key", "6");
  await page
    .getByRole("button", {
      name: "Show D♯ minor starting position",
      exact: true,
    })
    .click();
  assert.equal(await page.locator("#scale-title").textContent(), "F♯ major");
  assert.ok((await rootPitchClasses()).every((pc) => pc === 6));
  assert.match((await page.locator(".scale-notes").textContent()) || "", /E♯/);
  await saveComplete();
  await page.reload();
  await page
    .getByRole("button", { name: "Return to previous shape", exact: true })
    .click();
  await practiceOption(page, "#scale-key", "4");
  assert.equal(await page.locator("#midi-panel").isVisible(), false);
  assert.equal(await page.locator("#flashcards").isVisible(), false);
  assert.equal(await page.locator('.scale-tone[data-fret="0"]').count(), 4);
  await openPracticeOptions(page);
  for (const quality of ["major", "minor"]) {
    await page.getByLabel("Scale type", { exact: true }).selectOption(quality);
    assert.equal(await page.locator("#scale-key option").count(), 12);
    for (let tonic = 0; tonic < 12; tonic++) {
      await page
        .getByLabel("Scale key", { exact: true })
        .selectOption(String(tonic));
      assert.ok((await page.locator(".scale-root").count()) > 0);
      assert.equal(
        await page.locator(".scale-root circle").count(),
        await page.locator(".scale-root").count(),
      );
      assert.equal(
        (await page.locator(".scale-notes").textContent())!.split(" · ").length,
        7,
      );
    }
  }
  await page.getByLabel("Scale key", { exact: true }).selectOption("3");
  await page
    .getByRole("heading", { name: "E♭ natural minor", exact: true })
    .waitFor();
  assert.match(
    (await page
      .locator('.scale-tone[data-string="2"][data-fret="0"]')
      .textContent())!,
    /C♭/,
  );
  await page.keyboard.press("a");
  await page.evaluate(() => {
    (window as any).midiTest.send([0x90, 64, 100]);
    (window as any).midiTest.send([0x80, 64, 0]);
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "E♭ natural minor", exact: true })
    .waitFor();
  const after = await saved();
  for (const [id, checkpoint] of Object.entries(before.activities))
    if (id !== "guitar-scales")
      assert.deepEqual(after.activities[id], checkpoint);
  assert.deepEqual(after.activities["guitar-scales"], {
    version: 1,
    settings: { tonic: 3, quality: "minor", pattern: "map", shift: 0 },
  });
  assert.deepEqual(after.progress.stats, before.progress.stats);
  for (const [mode, profile] of Object.entries(before.progress.profiles))
    if (mode !== "scales")
      assert.deepEqual(after.progress.profiles[mode], profile);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await closePracticeOptions(page);
    assert.equal(
      await page.getByLabel("Scale key", { exact: true }).isVisible(),
      false,
    );
    await openPracticeOptions(page);
    assert.ok(await page.getByLabel("Scale key", { exact: true }).isVisible());
    const select = await page
      .getByLabel("Scale key", { exact: true })
      .boundingBox();
    assert.ok(
      select &&
        select.height > 0 &&
        select.x >= 0 &&
        select.x + select.width <= width,
    );
    await closePracticeOptions(page);
    const bounds = await page.locator(".scale-diagram").boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow",
    );
    assert.ok(
      (await page
        .locator(".scale-note-list button[aria-expanded]")
        .boundingBox())!.y < 844,
      "full neck and legend fit",
    );
  }
  await page.getByText("Details", { exact: true }).click();
  assert.match(
    await page.locator(".scale-note-list table").innerText(),
    /Open: C♭4/,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await selectPractice(page, "sight");
  await page.getByText("2 / 35", { exact: true }).waitFor();
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
  await selectPractice(page, "piano");
  await setPianoVisible(page, true);
  await page.locator("#piano [data-piano]").first().waitFor();
  await selectPractice(page, "guitar-scales");
  await page
    .getByRole("heading", { name: "E♭ natural minor", exact: true })
    .waitFor();
  await selectPractice(page, "scales");
  await page.locator("#scales-practice .abcjs-note").first().waitFor();
  await selectPractice(page, "guitar-scales");
  await page
    .getByRole("heading", { name: "E♭ natural minor", exact: true })
    .waitFor();
  await page.goto("http://127.0.0.1:4352/guitar/scales?key=E&scale=major");
  await page.getByRole("heading", { name: "E major", exact: true }).waitFor();
  const optionalRoot = page.locator(
    '.scale-root.scale-optional[data-string="2"][data-fret="5"]',
  );
  assert.equal(
    await optionalRoot
      .locator("circle")
      .evaluate((e) => getComputedStyle(e).fill),
    "rgb(212, 214, 218)",
  );
  assert.equal(
    await page.locator('.scale-optional[data-string="1"]').count(),
    0,
  );
  await practiceOption(page, "#scale-quality", "major");
  await practiceOption(page, "#scale-key", "7");
  await practiceOption(page, "#scale-pattern", "1");
  const patternSnapshot = () =>
    page.locator(".scale-tone").evaluateAll((nodes) =>
      nodes.map((n) => ({
        string: n.getAttribute("data-string"),
        fret: Number(n.getAttribute("data-fret")),
        finger: n.querySelector("text")?.textContent,
        y: n.querySelector("circle")?.getAttribute("cy"),
      })),
    );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await openPracticeOptions(page);
  const sidebarBounds = (await page
    .locator(".practice-options:visible")
    .boundingBox())!;
  const largeDiagram = (await page
    .locator(".scale-diagram svg")
    .boundingBox())!;
  assert.ok(
    sidebarBounds.x > 1300 && sidebarBounds.x + sidebarBounds.width >= 1640,
    "sidebar docks at the right edge",
  );
  assert.ok(
    largeDiagram.height >= 600,
    "diagram uses the laptop screen height",
  );
  assert.ok(
    (await page.locator(".scale-card").boundingBox())!.y +
      (await page.locator(".scale-card").boundingBox())!.height <=
      1050,
    "diagram and controls fit the laptop screen",
  );
  await closePracticeOptions(page);
  assert.equal(
    await page.locator("#practice-options-reopen").isVisible(),
    true,
  );
  assert.equal(
    await page.locator(".practice-options:visible").count(),
    0,
    "collapsed sidebar reserves no rail",
  );
  await page.waitForFunction(
    () => document.activeElement?.id === "practice-options-reopen",
  );
  assert.equal(
    await page
      .locator(".scale-card")
      .evaluate(
        (e) =>
          getComputedStyle(e.parentElement!).gridTemplateColumns.split(" ")
            .length,
      ),
    1,
    "practice receives the full grid width",
  );
  await openPracticeOptions(page);
  for (const width of [1000, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await closePracticeOptions(page);
    assert.equal(
      await page.locator("#practice-options-reopen").isVisible(),
      false,
    );
    await openPracticeOptions(page);
    assert.ok(await page.locator("#scale-key").isVisible());
  }
  await page.setViewportSize({ width: 1680, height: 1050 });
  await openPracticeOptions(page);
  const gPattern = await patternSnapshot();
  assert.equal(await page.locator(".scale-notes").isVisible(), false);
  assert.equal(await page.locator(".scale-source").isVisible(), false);
  assert.equal(await page.locator(".scale-footnote").isVisible(), false);
  assert.equal(await page.locator(".scale-tuning").count(), 6);
  assert.deepEqual(await page.locator(".scale-fret-number").allTextContents(), [
    "2",
    "3",
    "4",
    "5",
  ]);
  assert.equal(
    (await page.locator(".scale-legend").textContent())!.trim(),
    "Root",
  );

  assert.equal(
    await page
      .locator(".scale-root circle")
      .first()
      .evaluate((e) => getComputedStyle(e).fill),
    "rgb(64, 82, 123)",
  );
  assert.equal(
    await page
      .locator(".scale-tone:not(.scale-root) circle")
      .first()
      .evaluate((e) => getComputedStyle(e).fill),
    "rgb(143, 155, 182)",
  );
  assert.ok(
    Number(gPattern.find((n) => n.string === "6")!.y) >
      Number(gPattern.find((n) => n.string === "1")!.y),
  );
  await page.getByRole("button", { name: "Next key", exact: true }).click();
  await page.getByRole("heading", { name: "A♭ major", exact: true }).waitFor();
  assert.deepEqual(
    (await patternSnapshot()).map((n) => ({ ...n, fret: n.fret - 1 })),
    gPattern,
  );
  await page.getByRole("button", { name: "Previous key", exact: true }).click();
  assert.deepEqual(await patternSnapshot(), gPattern);
  await page
    .getByRole("button", {
      name: "Show E minor starting position",
      exact: true,
    })
    .click();
  assert.equal(await page.locator("#scale-title").textContent(), "G major");
  assert.equal(await page.locator("#scale-pattern").inputValue(), "5");
  assert.ok((await rootPitchClasses()).every((pc) => pc === 7));
  await saveComplete();
  await page.reload();
  await page
    .getByRole("button", { name: "Return to previous shape", exact: true })
    .click();
  assert.deepEqual(
    await patternSnapshot(),
    gPattern,
    "return restores the exact previous fingering and fret position",
  );
  // Other key/shape choices establish a fresh toggle origin.
  await page
    .getByRole("button", {
      name: "Show E minor starting position",
      exact: true,
    })
    .click();
  await practiceOption(page, "#scale-pattern", "3");
  await page
    .getByRole("button", {
      name: "Show E minor starting position",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Return to previous shape", exact: true })
    .click();
  assert.equal(await page.locator("#scale-pattern").inputValue(), "3");
  await practiceOption(page, "#scale-quality", "minor");
  await practiceOption(page, "#scale-key", "9");
  await practiceOption(page, "#scale-pattern", "1");
  await page
    .getByRole("button", {
      name: "Show C major starting position",
      exact: true,
    })
    .click();
  assert.equal(
    await page.locator("#scale-title").textContent(),
    "A natural minor",
  );
  assert.equal(await page.locator("#scale-pattern").inputValue(), "2");
  assert.ok((await rootPitchClasses()).every((pc) => pc === 9));
  await page
    .getByRole("button", { name: "Return to previous shape", exact: true })
    .click();
  assert.equal(await page.locator("#scale-pattern").inputValue(), "1");
  for (const shape of ["1", "2", "3", "4", "5"]) {
    await practiceOption(page, "#scale-pattern", shape);
    assert.ok((await page.locator(".scale-root").count()) >= 2);
    assert.equal(await page.locator('.scale-tone[data-fret="0"]').count(), 0);
  }
  await practiceOption(page, "#scale-dot-labels", "notes");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator(".scale-tone").first().waitFor();
  assert.equal(await page.locator("#scale-dot-labels").inputValue(), "notes");
  assert.match(
    (await page.locator(".scale-tone text").first().textContent())!,
    /[A-G]/,
  );
  await practiceOption(page, "#scale-dot-labels", "fingers");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await closePracticeOptions(page);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.ok(
      (await page
        .getByRole("button", { name: "Next key", exact: true })
        .boundingBox())!.width >= 44,
    );
  }
  for (const buttonName of ["Previous key", "Next key"]) {
    const control = page.getByRole("button", { name: buttonName, exact: true });
    let moves = 0;
    while (await control.isEnabled()) {
      assert.ok(moves++ < 22, "movement stops at the neck boundary");
      await control.click();
    }
    assert.equal(await control.isEnabled(), false);
  }
  await page.screenshot({
    path: "/tmp/guitar-numbered-pattern.png",
    fullPage: true,
  });
  // Exercise the actual IndexedDB upgrade from yesterday's local preview.
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("soundtools-notecards", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      const r = store.get("root");
      r.onsuccess = () => {
        const record = r.result;
        record.state.progress.mode = "scales";
        record.state.progress.profiles.scales = {
          scaleTonic: 5,
          scaleQuality: "major",
        };
        delete record.state.activities["guitar-scales"];
        store.put(record, "root");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("http://127.0.0.1:4352/");
  await page.getByRole("heading", { name: "F major", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/guitar/scales");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  const migrated = await saved();
  assert.deepEqual(migrated.activities["guitar-scales"], {
    version: 1,
    settings: { tonic: 5, quality: "major" },
  });
  assert.equal(migrated.progress.mode, "guitar-scales");
  assert.deepEqual(migrated.activities.sight, before.activities.sight);
  assert.deepEqual(errors, []);
  console.log(
    "Guitar scales: all 24 keys, enharmonics, responsive layouts, MIDI isolation, reload and preserved practice passed",
  );
} finally {
  await browser.close();
  server.kill();
  await rm(fixed, { recursive: true, force: true }).catch(
    (e: NodeJS.ErrnoException) => {
      if (e.code !== "EACCES" && e.code !== "EPERM") throw e;
    },
  );
}
