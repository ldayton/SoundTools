import { chromium, firefox, webkit, expect } from "@playwright/test";
import { login } from "./account-helpers.mts";
import assert from "node:assert/strict";
import { selectExercise } from "../apps/dorego/tests/ui-helpers";
const browser = await (
  { chromium, firefox, webkit }[process.env.TEST_BROWSER || "chromium"] ||
  chromium
).launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});
await context.addInitScript({ content: "globalThis.__name=(target)=>target;" });
await context.addInitScript(() =>
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  }),
);
const first = await context.newPage(),
  errors: string[] = [];
first.on("pageerror", (e) => errors.push(e.message));
let reads = [0, 0];
try {
  await first.route("**/rest/v1/rpc/account_snapshot_v2", (r) => {
    reads[0]++;
    return r.continue();
  });
  await first.goto("http://127.0.0.1:4391/");
  await login(first);
  await selectExercise(first, "fiveNote");
  await first.locator("#bpm").waitFor();
  await first.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (e) => e.textContent === "AccountSynced",
    ),
  );
  const second = await context.newPage();
  second.on("pageerror", (e) => errors.push(e.message));
  await second.route("**/rest/v1/rpc/account_snapshot_v2", (r) => {
    reads[1]++;
    return r.continue();
  });
  await second.goto("http://127.0.0.1:4391/");
  await second.getByRole("button", { name: "Account", exact: true }).waitFor();
  await expect(second.locator("#bpm")).toHaveValue(/BPM/);
  const propagationStarted = Date.now();
  reads = [0, 0];
  await second.locator("#bpm").fill("132");
  await second.locator("#bpm").press("Tab");
  await expect(first.locator("#bpm")).toHaveValue("132 BPM", {
    timeout: 10000,
  });
  console.log(
    `Follower-to-leader propagation: ${Date.now() - propagationStarted} ms`,
  );
  assert.equal(
    reads[1],
    0,
    "follower must use shared queue/leader instead of polling the server",
  );
  assert.ok(reads[0] > 0);
  await first.close();
  await second.locator("#bpm").fill("134");
  await second.locator("#bpm").press("Tab");
  await expect.poll(() => reads[1]).toBeGreaterThan(0);
  await second.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (e) => e.textContent === "AccountSynced",
    ),
  );
  // A temporary quota failure keeps the newer intent in memory, then retries on its own.
  await second.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as any).quota = true;
    IDBObjectStore.prototype.put = function (...args: any[]) {
      if (
        (window as any).quota &&
        this.transaction.db.name === "soundtools-accounts"
      )
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return put.apply(this, args as any);
    };
  });
  await second.locator("#bpm").fill("136");
  await second.locator("#bpm").press("Tab");
  await expect(
    second.getByRole("button", { name: "Account", exact: true }),
  ).toContainText("Sync needs attention");
  await second.evaluate(() => {
    (window as any).quota = false;
  });
  await second.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (e) => e.textContent === "AccountSynced",
    ),
  );
  await second.reload();
  await expect(second.locator("#bpm")).toHaveValue("136 BPM");
  // Version changes close the connection; recovery restores the live replica
  // even if the browser has removed its backing database.
  await second.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("soundtools-accounts");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
  await second.locator("#bpm").fill("137");
  await second.locator("#bpm").press("Tab");
  await second.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (e) => e.textContent === "AccountSynced",
    ),
  );
  await second.reload();
  await expect(second.locator("#bpm")).toHaveValue("137 BPM");
  // Retry-After is a minimum even if broadcasts/focus request another sync.
  let failedAt = 0,
    retriedAt = 0;
  await second.route("**/rest/v1/rpc/account_snapshot_v2", async (r) => {
    if (!failedAt) {
      failedAt = Date.now();
      await r.fulfill({
        status: 429,
        headers: {
          "retry-after": "2",
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "retry-after",
        },
        body: JSON.stringify({ message: "Injected rate limit", code: "429" }),
      });
    } else {
      retriedAt ||= Date.now();
      await r.continue();
    }
  });
  await second.locator("#bpm").fill("138");
  await second.locator("#bpm").press("Tab");
  await expect.poll(() => retriedAt, { timeout: 15000 }).toBeGreaterThan(0);
  assert.ok(retriedAt - failedAt >= 1900);
  await second.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (e) => e.textContent === "AccountSynced",
    ),
  );
  await second.reload();
  await expect(second.locator("#bpm")).toHaveValue("138 BPM");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic same-origin leader/follower propagation and takeover, quota recovery, persisted intent, Retry-After, reload and zero runtime errors",
  );
} finally {
  await context.close();
  await browser.close();
}
