import { selectPractice, practiceOption } from "./navigation-helpers";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
const fixed = await mkdtemp(join(tmpdir(), "notecards-recovery-"));
const browser = await (
  { chromium, firefox, webkit }[process.env.BROWSER || "chromium"] || chromium
).launch({ env: { ...process.env, CFFIXED_USER_HOME: fixed } });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4320");
  await page.locator("main:not([inert])").waitFor();
  const adapterResult = await page.evaluate(async () => {
    const path = "/src/durable-state.ts";
    const { IndexedDBAdapter, DurableStore, migrateLegacy } = await import(
      path
    );
    const adapter = await IndexedDBAdapter.open();
    const initial = migrateLegacy({});
    const a = await DurableStore.open(adapter, initial, "adapter-test-a");
    a.state.activities.test = { version: 1, value: 1 };
    const first = a.save();
    a.state.activities.test.value = 2;
    const second = a.save();
    await Promise.all([first, second]);
    const committed = await adapter.read();
    const b = await DurableStore.open(adapter, initial, "adapter-test-b");
    let stale = false;
    try {
      await a.save();
    } catch {
      stale = true;
    }
    const after = await adapter.read();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota test", "QuotaExceededError");
    };
    b.state.activities.test.value = 999;
    let failed = false;
    try {
      await b.save();
    } catch {
      failed = true;
    }
    IDBObjectStore.prototype.put = put;
    return {
      stale,
      failed,
      value: after.state.activities.test.value,
      revision: committed.revision,
      afterRevision: after.revision,
      failedValue: (await adapter.read()).state.activities.test.value,
    };
  });
  assert.equal(adapterResult.stale, true);
  assert.equal(adapterResult.failed, true);
  assert.equal(adapterResult.value, 2);
  assert.equal(adapterResult.failedValue, 2);
  assert.equal(adapterResult.revision, adapterResult.afterRevision);
  await context.close();
  const migration = await browser.newContext();
  await migration.addInitScript(() => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem(
      "soundtools:notecards:v1",
      JSON.stringify({
        version: 5,
        mode: "sight",
        roundLength: 24,
        profiles: { piano: { low: "C2", high: "B6", staffLayout: "bass" } },
        stats: {
          "staff:C4:0": {
            attempts: 8,
            correct: 6,
            streak: 2,
            lastSeen: 1234,
            due: 9999,
          },
        },
      }),
    );
    localStorage.setItem(
      "soundtools:notecards:sight-reading:v1",
      JSON.stringify({ hymn: "amazing-grace", chords: false, position: 3 }),
    );
  });
  const legacy = await migration.newPage();
  await legacy.goto("http://127.0.0.1:4320");
  await legacy.locator(".hymn-pause").waitFor();
  assert.match(
    await legacy.locator("#persistence-notice").innerText(),
    /older unversioned bookmark/,
  );
  const migrated = await legacy.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("soundtools-notecards");
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction("state").objectStore("state").get("root");
          q.onsuccess = () => {
            resolve(q.result.state);
            db.close();
          };
        };
      }),
  );
  assert.equal(migrated.progress.stats["staff:C4:0"].attempts, 8);
  assert.equal(migrated.progress.roundLength, 24);
  assert.equal(migrated.progress.profiles.piano.low, "C2");
  assert.equal(migrated.legacy.sight.position, 3);
  await legacy
    .getByRole("button", {
      name: "Restore older bookmark (4 / 35)",
      exact: true,
    })
    .click();
  assert.equal(await legacy.locator(".hymn-count").textContent(), "4 / 35");
  await legacy.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await legacy.reload();
  await legacy.locator(".hymn-pause").waitFor();
  assert.equal(await legacy.locator(".hymn-count").textContent(), "4 / 35");
  // An older build cannot overwrite the new root, and its writes visibly stop this writer.
  const old = await migration.newPage();
  await old.goto("http://127.0.0.1:4320");
  await old.evaluate(() =>
    localStorage.setItem(
      "soundtools:notecards:v1",
      JSON.stringify({ version: 5, mode: "staff" }),
    ),
  );
  await legacy.waitForFunction(() =>
    document
      .querySelector("#persistence-notice")
      ?.textContent?.includes("older app window"),
  );
  assert.equal(
    !(await legacy.locator("main").evaluate((e) => (e as HTMLElement).inert)),
    false,
  );
  await migration.close();
  // Exercise the actual UI failure path after initialization, not just adapter rejection.
  const failure = await browser.newContext();
  const f = await failure.newPage();
  await f.goto("http://127.0.0.1:4320");
  await f.locator("main:not([inert])").waitFor();
  await f.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await f.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota test", "QuotaExceededError");
    };
  });
  await f.locator('[data-letter="C"]').click();
  await f.locator("#persistence-notice").waitFor();
  assert.match(
    await f.locator("#persistence-notice").innerText(),
    /Could not save/,
  );
  assert.equal(
    !(await f.locator("main").evaluate((e) => (e as HTMLElement).inert)),
    false,
  );
  await failure.close();
  console.log(
    "storage passed: real IDB atomicity, stale fencing, queued snapshots, quota failure UI, migration, old-tab writes",
  );
} finally {
  await browser.close();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
