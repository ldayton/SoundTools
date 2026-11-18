import { account, login, pull, closeModal } from "./account-helpers.mts";
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  midiAction,
  practiceOption,
  openPracticeOptions,
} from "../packages/music-practice/browser-tests/helpers";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { macBookAir13, iphone14Pro } = require("../scripts/test-devices.cjs");
const engine = process.env.TEST_BROWSER || "chromium";
const config = JSON.parse(
  await readFile(
    new URL("../work/account-local.json", import.meta.url),
    "utf8",
  ),
);
assert(config.SUPABASE_URL.startsWith("http://127.0.0.1:"));
for (const table of ["public.account_apps", "private.account_operations"])
  execFileSync(
    "supabase",
    [
      "db",
      "query",
      `delete from ${table} where app in ('dorego','songalong');`,
    ],
    { stdio: "ignore" },
  );
const fixed = await mkdtemp(join(tmpdir(), "soundtools-accounts-"));
const browser = await (
  { chromium, firefox, webkit }[engine] || chromium
).launch({
  args: engine === "chromium" ? ["--mute-audio"] : [],
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
const errors: string[] = [];

try {
  const a = await browser.newContext({
    ...macBookAir13,
    serviceWorkers: "block",
  });
  const b = await browser.newContext({
    ...macBookAir13,
    serviceWorkers: "block",
  });
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
  for (const page of [p, q])
    page.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:4391/");
  await p.locator("#bpm").fill("120");
  await p.locator("#bpm").press("Tab");
  assert.equal(await p.locator("#bpm").inputValue(), "120 BPM");
  await login(p);
  console.log("primary login passed");
  await q.goto("http://127.0.0.1:4391/");
  await login(q, true);
  assert.equal(await q.locator("#bpm").inputValue(), "120 BPM");
  await p.locator("#bpm").fill("130");
  await p.locator("#bpm").press("Tab");
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await pull(q);
  await q.locator("#bpm").filter({ visible: true }).waitFor();
  await q.waitForFunction(
    () => document.querySelector<HTMLInputElement>("#bpm")?.value === "130 BPM",
  );
  await a.setOffline(true);
  await p.locator("#bpm").fill("140");
  await p.locator("#bpm").press("Tab");
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((el) =>
      el.textContent?.includes("Offline—changes pending"),
    ),
  );
  await a.setOffline(false);
  await account(p);
  await p.getByRole("button", { name: "Sync now", exact: true }).click();
  await closeModal(p);
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await p.reload();
  await p.waitForFunction(
    () => document.querySelector<HTMLInputElement>("#bpm")?.value === "140 BPM",
  );
  await p.screenshot({ path: "work/account-dorego-desktop.png" });
  await b.setOffline(true);
  await q.locator("#bpm").fill("150");
  await q.locator("#bpm").press("Tab");
  await q.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((el) =>
      el.textContent?.includes("Offline—changes pending"),
    ),
  );
  await account(q);
  await q.getByRole("button", { name: "Sign out", exact: true }).click();
  await q
    .getByRole("alert")
    .filter({ hasText: "changes waiting to sync" })
    .waitFor();
  await p.locator("#bpm").fill("160");
  await p.locator("#bpm").press("Tab");
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await b.setOffline(false);
  await q.getByRole("button", { name: "Use cloud", exact: true }).waitFor();
  await q.getByRole("button", { name: "Use cloud", exact: true }).click();
  await q
    .getByRole("button", { name: "Use cloud", exact: true })
    .waitFor({ state: "hidden" });
  await closeModal(q);
  assert.equal(await q.locator("#bpm").inputValue(), "160 BPM");
  await q.getByRole("button", { name: "Breath Squares", exact: true }).click();
  await q.locator("#breath-rounds").fill("6");
  await q.locator("#breath-rounds").press("Tab");
  await q.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await pull(p);
  await p.locator("#breath-rounds").waitFor();
  assert.equal(await p.locator("#breath-rounds").inputValue(), "6");
  const tab = await a.newPage();
  await tab.goto("http://127.0.0.1:4391/");
  await tab.locator("#breath-rounds").waitFor();
  assert.equal(await tab.locator("#breath-rounds").inputValue(), "6");
  await account(p);
  await p.getByRole("button", { name: "Sign out", exact: true }).click();
  await p.getByRole("button", { name: "Log in", exact: true }).waitFor();
  assert.equal(
    await p.locator("#bpm").inputValue(),
    "120 BPM",
    "sign out restores guest state, not account settings",
  );
  await tab.getByRole("button", { name: "Log in", exact: true }).waitFor();
  assert.equal(await tab.locator("#bpm").inputValue(), "120 BPM");
  await tab.close();
  console.log(
    engine +
      ": DoReGo code/link login, approval rejection, two devices, offline edits, reload and guest isolation passed",
  );

  await p.goto(
    "http://127.0.0.1:4392/piano/hymns/amazing-grace?arrangement=bass&hands=right&view=both&mode=wait&key=original",
  );
  await p.locator(".hymn-count").filter({ hasText: "1 /" }).waitFor();
  await login(p);
  await account(p);
  await p.screenshot({ path: "work/account-songalong-desktop.png" });
  await closeModal(p);
  assert.equal(
    await p.getByRole("status").filter({ hasText: "Saved on this device." }).count(),
    0,
    "signed-in practice must not claim guest-only storage",
  );
  await q.goto("http://127.0.0.1:4392/");
  await login(q, true);
  const current = await q.locator(".sequence-title").textContent();
  assert(current);

  // Remote settings and MIDI progress must both survive cloud rehydration.
  await practiceOption(p, "#hymn-size", "30");
  await openPracticeOptions(p);
  await p.locator("#hymn-stanzas input[type=checkbox]").nth(1).check();
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await pull(q);
  await q.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>("#hymn-size")?.value === "30 px",
  );
  await midiAction(p, "Connect MIDI keyboard");
  const resume = p.getByRole("button", { name: "Resume", exact: true });
  if (await resume.isVisible()) await resume.click();
  await p.evaluate(() => {
    (window as any).midiTest.send([0x90, 62, 100]);
    (window as any).midiTest.send([0x80, 62, 0]);
  });
  await p.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await p.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
  await pull(q);
  await q.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await q.reload();
  await q.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await openPracticeOptions(q);
  assert.equal(await q.locator("#hymn-hands").inputValue(), "right");
  assert.equal(await q.locator("#hymn-view").inputValue(), "both");
  assert(
    await q.locator("#hymn-stanzas input[type=checkbox]").nth(1).isChecked(),
  );
  await q.route(config.SUPABASE_URL + "/**", (route) => route.abort());
  await q.reload();
  await q.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await q.unroute(config.SUPABASE_URL + "/**");
  console.log(
    engine +
      ": SongAlong settings, hand-scoped MIDI checkpoint, cross-device restore, reload and cached startup passed",
  );

  const mobile = await browser.newContext({
    ...iphone14Pro,
    serviceWorkers: "block",
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto("http://127.0.0.1:4392/");
  await login(phone, true);
  await phone.screenshot({ path: "work/account-songalong-mobile.png" });
  assert(
    await phone
      .getByRole("button", { name: "Account", exact: true })
      .isVisible(),
  );
  await account(phone);
  await phone.getByRole("button", { name: "Sync now", exact: true }).waitFor();
  await closeModal(phone);
  await mobile.close();
  assert.deepEqual(errors, []);
  await a.close();
  await b.close();
} finally {
  await browser.close();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
