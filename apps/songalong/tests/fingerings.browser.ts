import { chromium, firefox, webkit, expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  practiceOption,
  openPracticeOptions,
  closePracticeOptions,
} from "../../../packages/music-practice/browser-tests/helpers";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4561),
);
const home = await mkdtemp(join(tmpdir(), "song-fingering-"));
const browser = await (
  { chromium, firefox, webkit }[process.env.TEST_BROWSER || "chromium"] ||
  chromium
).launch({ env: { ...process.env, CFFIXED_USER_HOME: home } });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.base + "/piano/hymns/amazing-grace");
  const toggle = page.getByRole("checkbox", {
    name: "Show fingerings",
    exact: true,
  });
  await toggle.waitFor();
  const geometry = () =>
    page.locator(".hymn-paper svg").evaluateAll((es) =>
      es.map((e) => ({
        height: e.getBoundingClientRect().height,
        viewBox: e.getAttribute("viewBox"),
      })),
    );
  const initial = await geometry();
  await expect(page.locator(".hymn-fingering")).toHaveCount(0);
  await toggle.check();
  await expect(page.locator(".hymn-fingering").first()).toBeVisible();
  expect(await geometry()).toEqual(initial);
  expect(await page.locator(".hymn-finger-shift").count()).toBeGreaterThan(0);
  await expect(page.locator(".hymn-finger-shift circle").first()).toBeVisible();
  const firstPitch = await page
    .locator(".hymn-fingering")
    .first()
    .getAttribute("data-midi");
  await practiceOption(page, "#hymn-key", "D");
  expect(
    await page.locator(".hymn-fingering").first().getAttribute("data-midi"),
  ).not.toEqual(firstPitch);
  await practiceOption(page, "#hymn-arrangement", "bass");
  await expect(
    page.locator('.hymn-fingering[data-hand="left"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('.hymn-fingering[data-hand="right"]').first(),
  ).toBeVisible();
  await practiceOption(page, "#hymn-arrangement", "chords");
  await expect(toggle).toBeDisabled();
  await expect(page.locator(".hymn-fingering")).toHaveCount(0);
  await practiceOption(page, "#hymn-arrangement", "melody");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await page.locator(".hymn-fingering").count()).toBe(0);
  await toggle.check();
  await expect(
    page.getByText("Saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".hymn-fingering").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await openPracticeOptions(page);
  await toggle.uncheck();
  await closePracticeOptions(page);
  const mobile = await geometry();
  await openPracticeOptions(page);
  await toggle.check();
  await closePracticeOptions(page);
  expect(await geometry()).toEqual(mobile);
  expect(errors).toEqual([]);
  console.log(
    "PASS: optional persistent fingerings, both hands, circled shifts, unsupported chords, no added score height on desktop or mobile",
  );
} finally {
  await browser.close();
  server.stop();
  await rm(home, { recursive: true, force: true });
}
