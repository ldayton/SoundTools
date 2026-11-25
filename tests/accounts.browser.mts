import {expect} from "@playwright/test";
import { otherPracticeHymn, playbackHymn, playbackMelody, selectCapoPracticeHymn } from "../packages/music-practice/test-fixtures/hymns";
import {
  waitForAccountIdle,
  captureFailure,
  closeBrowser,
  launchBrowser,
  createOfflineContext as createContext,
} from "../scripts/ci/browser-harness.cjs";
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
  selectHymnInstrument,
  closeNavigation,
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
const browser = await launchBrowser({
  args: engine === "chromium" ? ["--mute-audio"] : [],
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
const errors: string[] = [];

try {
  const a = await createContext(browser, {
    ...macBookAir13,
    serviceWorkers: "block",
  });
  const b = await createContext(browser, {
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
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
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
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="offline"]:not([data-account-pending="0"])',
      ),
  );
  await a.setOffline(false);
  await account(p);
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
      ),
  );
  await closeModal(p);
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
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
  await q.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="offline"]:not([data-account-pending="0"])',
      ),
  );
  await account(q);
  await q.getByRole("button", { name: "Sign out", exact: true }).click();
  await q
    .getByRole("alert")
    .filter({ hasText: "Changes are still saving" })
    .waitFor();
  await p.locator("#bpm").fill("160");
  await p.locator("#bpm").press("Tab");
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
      ),
  );
  await b.setOffline(false);
  await q.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
      ),
  );
  assert.equal(
    await q.getByRole("button", { name: "Use cloud", exact: true }).count(),
    0,
  );
  await closeModal(q);
  assert.equal(await q.locator("#bpm").inputValue(), "160 BPM");
  await q.getByRole("button", { name: "Breath Squares", exact: true }).click();
  await q.locator("#breath-rounds").fill("6");
  await q.locator("#breath-rounds").press("Tab");
  await q.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
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
    `http://127.0.0.1:4392/piano/hymns/${playbackHymn.slug}?arrangement=piano&hands=right&view=both&mode=wait&key=original`,
  );
  await p.locator(".hymn-count").filter({ hasText: "1 /" }).waitFor();
  await login(p);
  await account(p);
  await p.screenshot({ path: "work/account-songalong-desktop.png" });
  await closeModal(p);
  assert.equal(
    await p
      .getByRole("status")
      .filter({ hasText: "Saved on this device." })
      .count(),
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
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
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
  await p.evaluate((pitch) => {
    (window as any).midiTest.send([0x90, pitch, 100]);
    (window as any).midiTest.send([0x80, pitch, 0]);
  }, playbackMelody);
  await p.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await p.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-account-status="synced"][data-account-pending="0"]',
      ),
  );
  await pull(q);
  await q.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await q.reload();
  await q.locator(".hymn-count").filter({ hasText: "2 /" }).waitFor();
  await openPracticeOptions(q);
  assert.equal(await q.locator("#hymn-hands").inputValue(), "right");
  assert.equal(await q.locator("#hymn-view").count(),0);
  assert.equal(await q.getByRole("radio",{name:"Piano",exact:true}).getAttribute("aria-checked"),"true");
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

  // Capo is part of the atomic key/octave pitch preference, including a reset.
  const capoFixture=await selectCapoPracticeHymn();
  // Active practice deliberately defers cloud changes; release that guard first.
  await q.getByRole("button",{name:"Pause",exact:true}).click();
  await q.getByRole("button",{name:"Resume",exact:true}).waitFor();
  await q.waitForFunction(()=>!!document.querySelector('[data-account-status="synced"][data-account-pending="0"]'));
  await p.getByRole("option",{name:capoFixture.hymn.title,exact:true}).click();
  await selectHymnInstrument(p,"guitar");
  await openPracticeOptions(p);
  await practiceOption(p,"#hymn-capo",String(capoFixture.alternate.fret));
  await p.waitForFunction(()=>!!document.querySelector('[data-account-status="synced"][data-account-pending="0"]'));
  await pull(q);await openPracticeOptions(q);
  await q.locator(`#hymn-capo option:checked[value="${capoFixture.alternate.fret}"]`).waitFor({state:"attached"});
  await q.reload();await openPracticeOptions(q);
  assert.equal(await q.locator("#hymn-capo").inputValue(),String(capoFixture.alternate.fret));
  await practiceOption(p,"#hymn-capo",String(capoFixture.recommended.fret));
  await p.waitForFunction(()=>!!document.querySelector('[data-account-status="synced"][data-account-pending="0"]'));
  await pull(q);await openPracticeOptions(q);
  await q.locator(`#hymn-capo option:checked[value="${capoFixture.recommended.fret}"]`).waitFor({state:"attached"});
  console.log(engine+": SongAlong capo selection and recommended selection survive account sync and reload");
  await p.getByRole("button",{name:"Voice",exact:true}).click();
  await p.waitForFunction(()=>!!document.querySelector('[data-account-status="synced"][data-account-pending="0"]'));
  await pull(q);
  await q.waitForFunction(()=>document.querySelector('[data-instrument="guitar"]')?.getAttribute("data-arrangement")==="guitar-vocal");
  await q.reload();await openPracticeOptions(q);
  assert.equal(await q.getByRole("button",{name:"Voice",exact:true}).getAttribute("aria-pressed"),"true");
  assert.equal(await q.getByRole("radio",{name:"Guitar",exact:true}).getAttribute("aria-checked"),"true");
  console.log(engine+": Guitar + Voice survives account sync and reload as one atomic score preference");


  const mobile = await createContext(browser, {
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
  await phone.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  assert.equal(
    await phone.getByRole("button", { name: "Sync now", exact: true }).count(),
    0,
  );
  await closeModal(phone);
  // Real backend witness: stars and removals cross independent desktop/phone
  // storage, survive reload, and queue correctly while the phone is offline.
  await closeNavigation(phone);
  const desktopStar=p.locator(".hymn-favorite"),phoneStar=phone.locator(".hymn-favorite");
  await expect(desktopStar).toHaveAttribute("aria-pressed","false");
  await desktopStar.click();await waitForAccountIdle(p);
  await expect(phoneStar).toHaveAttribute("aria-pressed","true");
  await phone.reload();await pull(phone);await closeNavigation(phone);
  await expect(phoneStar).toHaveAttribute("aria-pressed","true");
  await mobile.setOffline(true);
  await phoneStar.click();
  await expect(phoneStar).toHaveAttribute("aria-pressed","false");
  await account(phone);
  await phone.locator('[data-account-status="offline"]:not([data-account-pending="0"])').waitFor();
  await closeModal(phone);
  await mobile.setOffline(false);await waitForAccountIdle(phone);await closeNavigation(phone);
  await pull(p);
  await expect(desktopStar).toHaveAttribute("aria-pressed","false");
  await p.reload();await waitForAccountIdle(p);
  await expect(desktopStar).toHaveAttribute("aria-pressed","false");
  console.log(engine+": SongAlong favorites and offline removals replicate between desktop and phone and survive reloads");
  await mobile.close();
  assert.deepEqual(errors, []);
  // An explicit song link and its options outrank the last-opened cloud song,
  // and that retained selection must itself be saved and replicated.
  const prior=new URL(q.url()).pathname.split("/").at(-1);
  const linked=[playbackHymn,otherPracticeHymn].find(h=>h.slug!==prior)!;
  await q.goto(`http://127.0.0.1:4392/piano/hymns/${linked.slug}?arrangement=piano&mode=playback&tempo=117&octave=-1`);
  await waitForAccountIdle(q);await openPracticeOptions(q);
  assert.equal(new URL(q.url()).pathname,`/piano/hymns/${linked.slug}`);
  assert.equal(new URL(q.url()).searchParams.get("octave"),"-1");
  assert.equal(await q.locator("#hymn-tempo").inputValue(),"117 BPM");
  assert.equal(await q.getByRole("button",{name:"Voice",exact:true}).getAttribute("aria-pressed"),"false");
  await pull(p);await openPracticeOptions(p);
  await p.waitForURL(url=>url.pathname===`/piano/hymns/${linked.slug}`);
  assert.equal(await p.locator("#hymn-tempo").inputValue(),"117 BPM");
  await q.reload();await waitForAccountIdle(q);await openPracticeOptions(q);
  assert.equal(new URL(q.url()).pathname,`/piano/hymns/${linked.slug}`);
  assert.equal(new URL(q.url()).searchParams.get("octave"),"-1");
  await a.close();
  await b.close();
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
