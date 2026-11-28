import {
  captureFailure,
  closeBrowser,
  launchBrowser,
  createContext,
} from "../../../scripts/ci/browser-harness.cjs";
import {
  selectPractice,
  practiceOption,
  openPracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
const fixed = await mkdtemp(join(tmpdir(), "notecards-recovery-"));
const browser = await launchBrowser({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
const origin = process.env.TEST_URL || "http://127.0.0.1:4320";
const context = await createContext(browser);
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => console.error("pageerror", e.message));
try {
  await page.goto(origin);
  await selectPractice(page, "piano");
  await openPracticeOptions(page);
  await page.locator("#staffLayout").selectOption("grand");
  await page.locator("#overlapPractice").selectOption("both");
  const question = () =>
    page
      .locator("#notation")
      .evaluate((e) =>
        [...e.querySelectorAll("path")]
          .map((p) => p.getAttribute("d"))
          .join("|"),
      );
  const before = await question();
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator("#notation svg").waitFor();
  await page.locator('#piano [aria-disabled="false"]').first().waitFor();
  assert.equal(
    await question(),
    before,
    "unanswered exact notation after reload",
  );
  // Inspect the committed checkpoint, not an app implementation hook.
  const stored = () =>
    page.evaluate(
      async () =>
        new Promise<any>((resolve, reject) => {
          const r = indexedDB.open("soundtools-notewise");
          r.onsuccess = () => {
            const db = r.result;
            const q = db.transaction("state").objectStore("state").get("root");
            q.onsuccess = () => {
              resolve(q.result);
              db.close();
            };
            q.onerror = () => reject(q.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const first = await stored();
  assert.ok(first.state.activities.piano.session.current);
  await page.locator('#piano [data-piano="60"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const feedback = await page.locator("#feedback").textContent();
  await page.reload();
  await page.locator("#feedback-next").waitFor();
  assert.equal(await page.locator("#feedback").textContent(), feedback);
  const graded = await stored();
  assert.equal(graded.state.activities.piano.session.answered, 1);
  await page.waitForTimeout(1800);
  assert.equal((await stored()).state.activities.piano.session.answered, 1);
  await page.locator("#feedback-next").click();
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const second = await question();
  await selectPractice(page, "staff");
  await selectPractice(page, "piano");
  assert.equal(await question(), second, "activity switch restores question");
  await selectPractice(page, "patterns");
  await page.locator(".pattern-pause").click();
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const pattern = (await stored()).state.activities.patterns;
  await page.reload();
  await page.locator(".pattern-pause").waitFor();
  assert.equal(await page.locator(".pattern-pause").textContent(), "Resume");
  assert.deepEqual(
    (await stored()).state.activities.patterns,
    pattern,
    "exact pattern and pause",
  );
  console.log("live activity recovery passed");
  // Both windows remain usable and save without an exclusive lifetime lock.
  const other = await context.newPage();
  await other.goto(origin);
  await other.locator("#page-title").waitFor();
  assert.equal(await other.locator("#persistence-notice").isVisible(), false);
  assert.equal(
    await other.locator("main").evaluate((e) => (e as HTMLElement).inert),
    false,
  );
  await selectPractice(other, "piano");
  await other.locator('#piano [data-piano="60"]').click();
  await other.locator("#feedback-next").waitFor();
  await other.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  // The original window can still save a different activity after the new one saves.
  await practiceOption(page, "#pattern-level", "steps");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  const both = await stored();
  assert.equal(both.state.activities.piano.session.answered, 2);
  assert.equal(both.state.activities.patterns.level,"steps");
  await page.close();
  await other.reload();
  await other.locator("#feedback-next").waitFor();
  await other.locator("#feedback-next").click();
  console.log("concurrent windows passed");
  // Restore completion and history through actual reload, using valid state prepared through normal answers.
  await selectPractice(other, "piano");
  for (let i = 0; i < 10; i++) {
    await other.locator('#piano [data-piano="60"]').click();
    await other.locator("#feedback-next").click();
  }
  await other.locator("#summary").waitFor();
  const result = await other.locator("#result").textContent();
  await other.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await other.reload();
  await other.locator("#summary").waitFor();
  assert.equal(await other.locator("#result").textContent(), result);
  await other.locator("#continue").click();
  assert.equal(await other.locator("#counter").textContent(), "1 / 12");
  await other.close();
  console.log("completion passed");
  // A corrupt or future root must never be replaced with defaults.
  const inspect = await context.newPage();
  await inspect.goto(origin);
  await inspect.locator("main:not([inert])").waitFor();
  // Corrupt the fixture only after unloading the writer; pending saves must not repair it.
  await inspect.goto(origin + "/icon.svg");
  await inspect.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("soundtools-notewise");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("state", "readwrite");
          const q = tx.objectStore("state").get("root");
          q.onsuccess = () => {
            const v = q.result;
            v.state.version = 999;
            tx.objectStore("state").put(v, "root");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await inspect.goto(origin);
  await inspect.locator("#persistence-notice").waitFor();
  assert.match(
    await inspect.locator("#persistence-notice").innerText(),
    /version/,
  );
  await inspect.close();
  const failureContext = await createContext(browser);
  await failureContext.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("blocked for recovery test");
      },
    });
  });
  const failure = await failureContext.newPage();
  await failure.goto(origin);
  await failure.locator("#persistence-notice").waitFor();
  assert.match(
    await failure.locator("#persistence-notice").innerText(),
    /unavailable/,
  );
  assert.equal(
    !(await failure.locator("main").evaluate((e) => (e as HTMLElement).inert)),
    false,
  );
  await failureContext.close();
  console.log(
    "recovery browser passed: exact question, feedback once, activity, pause, concurrent windows, reopen",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
