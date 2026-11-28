import {practiceHymn, otherPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import { gotoHymn, reloadHymn } from "../../../packages/music-practice/browser-tests/helpers";
import { launchBrowser, newPage, createContext } from "../../../scripts/ci/browser-harness.cjs";
import { openHymnControls } from "../../../packages/music-practice/browser-tests/helpers";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4535),
);
const home = await mkdtemp(join(tmpdir(), "staff-size-"));
const engine = process.env.TEST_BROWSER || "chromium";
const browser = await launchBrowser({ env: { ...process.env, CFFIXED_USER_HOME: home } });
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const size = page.getByRole("spinbutton", {
    name: "Staff size in pixels",
    exact: true,
  });
  async function mobileControls() {
    await openHymnControls(page);
    await expect(size).toBeVisible();
  }
  async function change(value: number) {
    await size.fill(String(value));
    await size.press("Enter");
    await expect(size).toHaveValue(`${value} px`);
    await expect(page.getByText("Saved on this device.", { exact: true })).toBeVisible();
  }
  await gotoHymn(page, server.base + `/piano/hymns/${practiceHymn.slug}`);
  await expect(size).toHaveValue("40 px");
  await change(48);
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileControls();
  await expect(size).toHaveValue("40 px");
  await change(32);
  await reloadHymn(page);
  await mobileControls();
  await expect(size).toHaveValue("32 px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(size).toHaveValue("48 px");
  await reloadHymn(page);
  await expect(size).toHaveValue("48 px");
  await gotoHymn(page, server.base + `/piano/hymns/${otherPracticeHymn.slug}`);
  await expect(size).toHaveValue("48 px");
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileControls();
  await expect(size).toHaveValue("32 px");
  expect(errors).toEqual([]);
  console.log(
    "PASS: independent mobile/desktop staff sizes survive resizing, reloading, and song changes",
  );
} finally {
  await browser.close();
  server.stop();
  await rm(home, { recursive: true, force: true });
}
