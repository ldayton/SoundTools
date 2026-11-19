import { chromium, firefox, webkit, expect } from "@playwright/test";
import { practiceOption } from "../../../packages/music-practice/browser-tests/helpers";
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
const browser = await (
  { chromium, firefox, webkit }[engine] || chromium
).launch({ env: { ...process.env, CFFIXED_USER_HOME: home } });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const tempo = page.locator("#hymn-tempo");
  const low = page.locator("#hymn-low"),
    high = page.locator("#hymn-high");
  async function choose(name: string) {
    await page.getByPlaceholder("Search songs").fill(name);
    await page.getByRole("option", { name, exact: true }).click();
  }
  await page.goto(server.base + "/piano/hymns/amazing-grace");
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-tempo", "96");
  await practiceOption(page, "#hymn-low", "48");
  await practiceOption(page, "#hymn-high", "79");
  await choose("Silent Night");
  await expect(low).toHaveValue("C3");
  await expect(high).toHaveValue("G5");
  await practiceOption(page, "#hymn-mode", "playback");
  await practiceOption(page, "#hymn-tempo", "112");
  await practiceOption(page, "#hymn-low", "50");
  await choose("Amazing Grace");
  await expect(tempo).toHaveValue("96 BPM");
  await expect(low).toHaveValue("D3");
  await expect(high).toHaveValue("G5");
  await page.reload();
  await expect(tempo).toHaveValue("96 BPM");
  await expect(low).toHaveValue("D3");
  await choose("Silent Night");
  await expect(tempo).toHaveValue("112 BPM");
  await expect(low).toHaveValue("D3");
  await expect(high).toHaveValue("G5");
  expect(errors).toEqual([]);
  console.log(
    "PASS: global note limits and per-song tempos survive song changes and reload",
  );
} finally {
  await browser.close();
  server.stop();
  await rm(home, { recursive: true, force: true });
}
