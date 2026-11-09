import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
const fixed=await mkdtemp(join(tmpdir(),"notecards-recovery-"));
const browser = await (
  { chromium, firefox, webkit }[process.env.BROWSER || "chromium"] || chromium
).launch({env:{...process.env,CFFIXED_USER_HOME:fixed}});
const origin = process.env.TEST_URL || "http://127.0.0.1:4320";
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => console.error("pageerror", e.message));
try {
  await page.goto(origin);
  await page.locator("#mode").selectOption("piano");
  await page.locator("summary").filter({ hasText: "Practice options" }).click();
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
          const r = indexedDB.open("soundtools-notecards");
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
  await page.locator('[data-piano="60"]').click();
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
  await page.locator("#mode").selectOption("staff");
  await page.locator("#mode").selectOption("piano");
  assert.equal(await question(), second, "activity switch restores question");
  await page.locator("#mode").selectOption("sight");
  await page.locator(".hymn-pause").click();
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  await page.reload();
  await page.locator(".hymn-pause").waitFor();
  assert.equal(
    await page.locator(".hymn-pause").textContent(),
    "Continue",
    "hymn pause persists",
  );
  console.log("flashcard and hymn reload passed");
  const pausedHymn = await stored();
  const hymnSelected = await page.locator("#hymn-search").inputValue();
  await page.locator("#hymn-search").fill("Doxology");
  await page.locator("#hymn-search").press("Enter");
  assert.equal(await page.locator(".hymn-pause").textContent(), "Pause");
  await page.locator("#hymn-search").fill(hymnSelected);
  await page.locator("#hymn-search").press("Enter");
  assert.equal(
    await page.locator(".hymn-pause").textContent(),
    "Continue",
    "per hymn bookmark",
  );
  await page.locator("#hymn-arrangement").selectOption("original");
  assert.equal(await page.locator(".hymn-pause").textContent(), "Pause");
  await page.locator("#hymn-arrangement").selectOption("melody");
  assert.equal(
    await page.locator(".hymn-pause").textContent(),
    "Continue",
    "per arrangement pause",
  );
  await page.locator("#mode").selectOption("patterns");
  await page.locator(".pattern-pause").click();
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const pattern = (await stored()).state.activities.patterns;
  await page.reload();
  await page.locator(".pattern-pause").waitFor();
  assert.equal(await page.locator(".pattern-pause").textContent(), "Continue");
  assert.deepEqual(
    (await stored()).state.activities.patterns,
    pattern,
    "exact pattern and pause",
  );
  await page.locator("#mode").selectOption("rhythm");
  await page.locator("#rhythm-level").selectOption("eighths");
  await page.waitForFunction(() =>
    document.querySelector("#saved")?.textContent?.includes("Saved"),
  );
  const rhythm = (await stored()).state.activities.rhythm;
  await page.locator(".rhythm-start").click();
  await page.reload();
  await page.locator(".rhythm-start").waitFor();
  assert.match(
    (await page.locator(".rhythm-start").textContent()) || "",
    /Start/,
  );
  assert.deepEqual(
    (await stored()).state.activities.rhythm.bars,
    rhythm.bars,
    "same rhythm, no resumed wall clock",
  );
  console.log("live activity recovery passed");
  // A second window may view the checkpoint but cannot write over the owner.
  const other = await context.newPage();
  await other.goto(origin);
  await other.locator("#persistence-notice").waitFor();
  assert.match(
    await other.locator("#persistence-notice").innerText(),
    /another window/i,
  );
  assert.equal(await other.locator("#mode").isEnabled(), false);
  await page.close();
  await other.reload();
  await other.locator("#mode").waitFor();
  assert.equal(
    await other.locator("#mode").isEnabled(),
    true,
    "lock released on close",
  );
  console.log("ownership passed");
  // Restore completion and history through actual reload, using valid state prepared through normal answers.
  await other.locator("#mode").selectOption("piano");
  for (let i = 0; i < 11; i++) {
    await other.locator('[data-piano="60"]').click();
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
  await inspect.locator("#mode:enabled").waitFor();
  await inspect.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("soundtools-notecards");
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
  await inspect.reload();
  await inspect.locator("#persistence-notice").waitFor();
  assert.match(
    await inspect.locator("#persistence-notice").innerText(),
    /version/,
  );
  await inspect.close();
  const failureContext = await browser.newContext();
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
  assert.equal(await failure.locator("#mode").isEnabled(), false);
  await failureContext.close();
  console.log(
    "recovery browser passed: exact question, feedback once, activity, pause, ownership, reopen",
  );
} finally {
  await browser.close();
  await rm(fixed,{recursive:true,force:true}).catch(()=>{});
}
