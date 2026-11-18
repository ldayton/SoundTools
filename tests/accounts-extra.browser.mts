import { chromium, firefox, webkit, expect, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  account,
  login,
  pull,
  closeModal,
  config,
} from "./account-helpers.mts";
import {
  practiceOption,
  openPracticeOptions,
  selectPractice,
  midiAction,
} from "../packages/music-practice/browser-tests/helpers";
const require = createRequire(import.meta.url),
  { macBookAir13, iphone14Pro } = require("../scripts/test-devices.cjs");
const engine = process.env.TEST_BROWSER || "chromium";
assert(config.SUPABASE_URL.startsWith("http://127.0.0.1:"));
for (const table of ["public.account_apps", "private.account_operations"])
  execFileSync(
    "supabase",
    [
      "db",
      "query",
      `delete from ${table} where app in ('notewise','soundglow');`,
    ],
    { stdio: "ignore" },
  );
const fixed = await mkdtemp(join(tmpdir(), "soundtools-extra-"));
const browser = await (
  { chromium, firefox, webkit }[engine] || chromium
).launch({
  args: engine === "chromium" ? ["--mute-audio"] : [],
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
const errors: string[] = [];
const protocolErrors: string[] = [];
async function observe(page: Page) {
  await page.exposeFunction("__accountReportError", (message: string) =>
    errors.push(message),
  );
  await page.addInitScript(() => {
    window.addEventListener("error", (e) => {
      if (e.message)
        void (window as any).__accountReportError(e.message).catch(() => {});
    });
    window.addEventListener(
      "unhandledrejection",
      (e) =>
        void (window as any)
          .__accountReportError(String(e.reason?.message || e.reason))
          .catch(() => {}),
    );
  });
  page.on("pageerror", (e) => protocolErrors.push(e.message));
  page.on("crash", () => errors.push("Browser page crashed"));
}
async function replica(page: Page, app: string) {
  return page.evaluate(
    (app) =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("soundtools-accounts");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("replicas"),
            q = tx.objectStore("replicas").getAll();
          q.onsuccess = () => {
            const names = tx.objectStore("replicas").getAllKeys();
            names.onsuccess = () => {
              resolve(
                q.result[
                  names.result.findIndex((k) => String(k).endsWith(":" + app))
                ],
              );
              db.close();
            };
          };
          q.onerror = () => reject(q.error);
        };
      }),
    app,
  );
}
async function stored(page: Page, app: string) {
  return page.evaluate(
    (app) =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("soundtools-" + app);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("state").objectStore("state").get("root");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
    app,
  );
}
async function signedOut(page: Page) {
  await account(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog", { name: /^(Account|Log in)$/ })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
}
async function pending(page: Page, app: string) {
  await expect
    .poll(
      async () => Object.keys((await replica(page, app))?.pending || {}).length,
    )
    .toBeGreaterThan(0);
}
async function answerE(page: Page, count: number) {
  await page.locator('[data-letter="E"]:enabled').click();
  await expect(page.locator("#counter")).toHaveAttribute(
    "data-answered",
    String(count),
  );
  await expect(page.locator("#feedback")).toHaveText("Name this note.");
}
async function total(page: Page) {
  const r = await replica(page, "notewise");
  return Object.entries(r.remote)
    .filter(([k]) => k.startsWith("stat:staff:E3:0:"))
    .reduce((n, [, v]: any) => n + (v.value?.attempts || 0), 0);
}
try {
  const a = await browser.newContext({
      ...macBookAir13,
      serviceWorkers: "block",
    }),
    b = await browser.newContext({ ...macBookAir13, serviceWorkers: "block" });
  for (const context of [a, b])
    await context.addInitScript({
      content: await readFile(
        new URL(
          "../packages/music-practice/test-fixtures/midi.js",
          import.meta.url,
        ),
        "utf8",
      ),
    });
  const p = await a.newPage(),
    q = await b.newPage();
  for (const page of [p, q]) await observe(page);
  await p.goto("http://127.0.0.1:4393/guitar/staff");
  await openPracticeOptions(p);
  await practiceOption(p, "#low", "E3");
  await practiceOption(p, "#high", "E3");
  const guest = await stored(p, "notewise");
  await login(p);
  await answerE(p, 1);
  await pull(p);
  await q.goto("http://127.0.0.1:4393/");
  await login(q, true);
  await expect(q.locator("#counter")).toHaveAttribute("data-answered", "1");
  await openPracticeOptions(q);
  assert.equal(await q.locator("#staff-high-spin").inputValue(), "E3");
  await p.route(config.SUPABASE_URL + "/**", (r) => r.abort());
  await q.route(config.SUPABASE_URL + "/**", (r) => r.abort());
  await answerE(p, 2);
  await answerE(q, 2);
  await pending(p, "notewise");
  await pending(q, "notewise");
  await q.reload();
  await expect(q.locator("#counter")).toHaveAttribute("data-answered", "2");
  await p.unroute(config.SUPABASE_URL + "/**");
  await pull(p);
  await q.unroute(config.SUPABASE_URL + "/**");
  await account(q);
  await q.getByRole("button", { name: "Sync now", exact: true }).click();
  const choose = q.getByRole("button", {
    name: "Use this device",
    exact: true,
  });
  // Equal checkpoints merge automatically; any genuinely different checkpoint is
  // retained for explicit choice. Per-replica practice totals never conflict.
  await expect(
    q.getByRole("button", { name: "Sync now", exact: true }),
  ).not.toHaveAttribute("data-loading", "true");
  if (await choose.first().isVisible()) {
    while (await choose.count()) await choose.first().click();
  }
  await closeModal(q);
  await pull(q);
  await pull(p);
  await expect.poll(() => total(p)).toBe(3);
  await p.reload();
  await expect(p.locator('[data-letter="E"]:enabled')).toBeVisible();
  assert.equal(
    (await stored(p, "notewise")).state.progress.profiles.staff.high,
    guest.state.progress.profiles.staff.high,
  );
  await signedOut(p);
  assert.deepEqual((await stored(p, "notewise")).state, guest.state);
  await p.screenshot({ path: "work/account-notewise-desktop.png" });
  await selectPractice(q, "piano");
  await openPracticeOptions(q);
  for (const bound of ["low", "high"]) {
    await q.locator("#" + bound + "-spin").click();
    await q
      .locator("#" + bound + "-spin-picker")
      .getByRole("button", { name: "C4", exact: true })
      .click();
  }
  await midiAction(q, "Connect MIDI keyboard");
  await q
    .getByText("GO:KEYS 5 connected. Play one note at a time.", { exact: true })
    .waitFor({ state: "attached" });
  if (
    (await q.locator(".keyboard-menu").getAttribute("aria-expanded")) === "true"
  )
    await q.locator(".keyboard-menu").click();
  await q.bringToFront();
  await account(q);
  await q.evaluate(() => {
    (window as any).midiTest.send([0x90, 60, 100], "roland", performance.now());
    (window as any).midiTest.send([0x80, 60, 0], "roland", performance.now());
  });
  await expect(q.locator("#counter")).toHaveAttribute("data-answered", "0");
  await closeModal(q);
  await q.evaluate(() => {
    (window as any).midiTest.send([0x90, 60, 100], "roland", performance.now());
    (window as any).midiTest.send([0x80, 60, 0], "roland", performance.now());
  });
  await expect(q.locator("#counter")).toHaveAttribute("data-answered", "1");
  await pull(q);
  console.log(
    engine +
      ": NoteWise emailed login, cross-device checkpoint, same-card offline totals, cached reload and guest isolation passed",
  );
  await a.close();
  await b.close();
  const c = await browser.newContext({
      ...macBookAir13,
      serviceWorkers: "block",
    }),
    d = await browser.newContext({ ...macBookAir13, serviceWorkers: "block" });
  const g = await c.newPage(),
    h = await d.newPage();
  for (const page of [g, h]) await observe(page);
  await g.goto("http://127.0.0.1:4394/dist/index.html#settings");
  await g.getByRole("tab", { name: "Pitch", exact: true }).click();
  const minimum = g.getByLabel("Visible minimum (Hz)", { exact: true });
  await minimum.fill("75");
  await minimum.press("Enter");
  const guestWorkspace = await g.evaluate(() =>
    localStorage.getItem("soundglow-workspace-v1"),
  );
  await login(g);
  await minimum.fill("80");
  await minimum.press("Enter");
  await pull(g);
  const audio = await readFile(
    new URL("../apps/soundglow/dist/audio/alice-waters.m4a", import.meta.url),
  );
  await g.locator("#audioFileInput").setInputFiles({
    name: "Practice.m4a",
    mimeType: "audio/mp4",
    buffer: audio,
  });
  await g.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.importing && !l.loading;
  });
  await g.evaluate(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    l.loop = { start: 1, end: 2 };
    l.setView(0, 5);
    l.draw();
  });
  await g.locator("#bookmarkSelection").click();
  await g.locator("#bookmarkName").fill("Verse one");
  await g.locator("#saveBookmark").click();
  await expect(g.locator("[data-bookmark]")).toHaveCount(1);
  await pull(g);
  const r = await replica(g, "soundglow");
  const encoded = JSON.stringify(
    Object.fromEntries(
      Object.entries(r.remote).map(([k, v]: any) => [k, v.value]),
    ),
  );
  assert(encoded.includes("sha256-tree-v1:"));
  assert(!encoded.includes("fileId"));
  assert(!encoded.includes("peaks"));
  assert(!encoded.includes("blob:"));
  assert(!encoded.includes("data:audio"));
  await h.goto("http://127.0.0.1:4394/dist/index.html#settings");
  await login(h, true);
  await expect(
    h.getByLabel("Visible minimum (Hz)", { exact: true }),
  ).toHaveValue("80");
  await expect(h.locator("[data-file]")).toHaveCount(0);
  await expect(h.locator("[data-bookmark]")).toContainText(
    "Import audio to open",
  );
  await h.locator("[data-bookmark]").click();
  await expect(
    h.getByRole("status").filter({ hasText: "Import “Practice.m4a”" }),
  ).toContainText("Import “Practice.m4a”");
  await h.locator("#audioFileInput").setInputFiles({
    name: "Different filename.m4a",
    mimeType: "audio/mp4",
    buffer: audio,
  });
  await h.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.importing && !l.loading;
  });
  await h.locator("[data-bookmark]").click();
  await h.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return (
      !l.loading && l.loop?.start === 1 && l.loopEnabled && l.viewSpan === 5
    );
  });
  await h.route(config.SUPABASE_URL + "/**", (r) => r.abort());
  const maximum = h.getByLabel("Visible maximum (Hz)", { exact: true });
  await maximum.fill("600");
  await maximum.press("Enter");
  await pending(h, "soundglow");
  // Simulate a file imported before content fingerprints were introduced.
  await h.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    const file = l.current;
    delete file.fingerprint;
    await l.store.transaction(["files"], (tx: IDBTransaction) =>
      tx.objectStore("files").put(file),
    );
  });
  await h.reload();
  await expect(
    h.getByLabel("Visible maximum (Hz)", { exact: true }),
  ).toHaveValue("600");
  await h.locator("[data-bookmark]").click();
  await h.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return !l.loading && l.loop?.start === 1 && l.loopEnabled;
  });
  await h.unroute(config.SUPABASE_URL + "/**");
  await pull(h);
  await pull(g);
  await expect(
    g.getByLabel("Visible maximum (Hz)", { exact: true }),
  ).toHaveValue("600");
  await h.screenshot({ path: "work/account-soundglow-desktop.png" });
  // Removing a device-local file leaves its shared bookmark available elsewhere.
  await h.evaluate(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.remove(l.current.id);
  });
  await expect(h.locator("[data-bookmark]")).toContainText(
    "Import audio to open",
  );
  await expect(g.locator("[data-file]")).toHaveCount(1);
  await signedOut(g);
  await expect(minimum).toHaveValue("75");
  assert.equal(
    await g.evaluate(() => localStorage.getItem("soundglow-workspace-v1")),
    guestWorkspace,
  );
  await expect(g.locator("[data-file]")).toHaveCount(1);
  await expect(g.locator("[data-bookmark]")).toHaveCount(0);
  console.log(
    engine +
      ": Soundglow settings, offline reload, local-only files, content-matched bookmark restore and guest isolation passed",
  );
  await c.close();
  await d.close();
  const phone = await browser.newContext({
    ...iphone14Pro,
    serviceWorkers: "block",
  });
  const m = await phone.newPage();
  await observe(m);
  await m.goto("http://127.0.0.1:4393/");
  await login(m);
  await m.screenshot({ path: "work/account-notewise-mobile.png" });
  await m.goto("http://127.0.0.1:4394/dist/index.html#settings");
  await login(m);
  await m.screenshot({ path: "work/account-soundglow-mobile.png" });
  assert(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await phone.close();
  assert.deepEqual(errors, []);
  // WebKit reports cancelled blob fetches as protocol pageerrors even when
  // caught. Real window errors/rejections above must remain empty, and all
  // other protocol errors still fail the test.
  const blobAbort =
    /^h?ttp:\/\/127\.0\.0\.1:4394\/[a-f0-9-]{36} due to access control checks\.$/;
  const cancelledBlob =
    engine === "webkit" &&
    protocolErrors.some((message) => blobAbort.test(message));
  assert.deepEqual(
    protocolErrors.filter(
      (message) =>
        !(
          cancelledBlob &&
          (blobAbort.test(message) ||
            message === "NotReadableError: The I/O read operation failed.")
        ),
    ),
    [],
  );
} finally {
  await browser.close();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
