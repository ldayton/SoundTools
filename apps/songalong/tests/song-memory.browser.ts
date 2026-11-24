import {practiceHymn,otherPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import { launchBrowser, newPage, createContext, waitForApp } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { practiceOption,openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4550),
);
const home = await mkdtemp(join(tmpdir(), "staff-size-"));
const engine = process.env.TEST_BROWSER || "chromium";
const browser = await launchBrowser({ env: { ...process.env, CFFIXED_USER_HOME: home } });
try {
  const context = await createContext(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tempo = page.locator("#hymn-tempo");
  const low = page.locator("#hymn-low"),
    high = page.locator("#hymn-high");
  async function choose(name: string) {
    await page.getByPlaceholder("Search songs").fill(name);
    await page.getByRole("option", { name, exact: true }).click();
  }
  await page.goto(server.base + `/piano/hymns/${practiceHymn.slug}`);
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-tempo", "96");
  await practiceOption(page, "#hymn-low", "48");
  await practiceOption(page, "#hymn-high", "79");
  await choose(otherPracticeHymn.title);
  await expect(low).toHaveValue("C3");
  await expect(high).toHaveValue("G5");
  await expect(
    page.getByRole("button", { name: "Playback mode", exact: true }),
  ).toHaveText("Playback");
  await practiceOption(page, "#hymn-tempo", "112");
  await practiceOption(page, "#hymn-mode", "wait");
  await practiceOption(page, "#hymn-low", "50");
  await choose(practiceHymn.title);
  await expect(
    page.getByRole("button", { name: "Playback mode", exact: true }),
  ).toHaveText("Wait for me");
  await practiceOption(page, "#hymn-mode", "playback");
  await expect(tempo).toHaveValue("96 BPM");
  await expect(low).toHaveValue("D3");
  await expect(high).toHaveValue("G5");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Playback mode", exact: true }),
  ).toHaveText("Playback");
  await expect(tempo).toHaveValue("96 BPM");
  await expect(low).toHaveValue("D3");
  await choose(otherPracticeHymn.title);
  await expect(tempo).toHaveValue("112 BPM");
  await expect(low).toHaveValue("D3");
  await expect(high).toHaveValue("G5");
  await expect(
    page.getByRole("button", { name: "Playback mode", exact: true }),
  ).toHaveText("Playback");
  // A second song window shares durable storage without locking out either UI.
  const other = await page.context().newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(server.base + `/piano/hymns/${practiceHymn.slug}`);
  await expect(other.locator("#hymn-tempo")).toHaveValue("96 BPM");
  await Promise.all([
    practiceOption(page, "#hymn-tempo", "118"),
    practiceOption(other, "#hymn-tempo", "90"),
  ]);
  await expect(page.locator("main")).not.toHaveAttribute("inert");
  await expect(other.locator("main")).not.toHaveAttribute("inert");
  // Saved status is the durable transaction completion signal.
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await expect(other.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await expect(tempo).toHaveValue("118 BPM");
  await choose(practiceHymn.title);
  await expect(tempo).toHaveValue("90 BPM");
  await other.screenshot({
    path: "/tmp/songalong-multiple-windows.png",
    fullPage: true,
  });
  await other.close();
  // Browsers without Web Locks still coordinate through IndexedDB transactions.
  await page
    .context()
    .addInitScript(() =>
      Object.defineProperty(navigator, "locks", {
        value: undefined,
        configurable: true,
      }),
    );
  await page.reload();
  await expect(tempo).toHaveValue("90 BPM");
  await practiceOption(page, "#hymn-tempo", "92");
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await page.reload();
  await expect(tempo).toHaveValue("92 BPM");
  expect(errors).toEqual([]);
  // A saved octave survives bare links and cross-song navigation.
  await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}?arrangement=piano&mode=playback&low=none&high=none`);
  await waitForApp(page);await openPracticeOptions(page);
  await page.locator("#hymn-octave-down").click();
  await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("-1");
  const range=await page.locator("#hymn-key").inputValue();
  await choose(otherPracticeHymn.title);await choose(practiceHymn.title);
  await expect(page.locator("#hymn-key")).toHaveValue(range);
  await page.goto(`${server.base}/piano/hymns/${otherPracticeHymn.slug}`);await waitForApp(page);await openPracticeOptions(page);
  await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}`);await waitForApp(page);await openPracticeOptions(page);
  await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("-1");
  await expect(page.locator("#hymn-key")).toHaveValue(range);
  const second=await context.newPage();await second.goto(`${server.base}/piano/hymns/${practiceHymn.slug}`);await waitForApp(second);await openPracticeOptions(second);
  await practiceOption(page,"#hymn-count-in","1");
  await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await practiceOption(second,"#hymn-tempo","111");
  await expect(second.locator("#saved")).toHaveText("Saved on this device.");
  await second.locator(".hymn-paper").click({position:{x:10,y:10}});
  await expect(second.locator("#hymn-count-in")).toHaveValue("1");
  await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}`);await waitForApp(page);await openPracticeOptions(page);
  await expect(tempo).toHaveValue("111 BPM");await expect(page.locator("#hymn-count-in")).toHaveValue("1");
  await second.getByPlaceholder("Search songs").fill(otherPracticeHymn.title);await second.getByRole("option",{name:otherPracticeHymn.title,exact:true}).click();
  await practiceOption(page,"#hymn-tempo","123");await expect(page.locator("#saved")).toHaveText("Saved on this device.");
  await second.getByPlaceholder("Search songs").fill(practiceHymn.title);await second.getByRole("option",{name:practiceHymn.title,exact:true}).click();
  await openPracticeOptions(second);await expect(second.locator("#hymn-tempo")).toHaveValue("123 BPM");
  await second.close();
  console.log(
    "PASS: global playback mode and note limits, plus per-song tempos, survive song changes and reload",
  );
} finally {
  await browser.close();
  server.stop();
  await rm(home, { recursive: true, force: true });
}
