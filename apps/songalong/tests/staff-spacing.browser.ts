import {practiceHymn,otherPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import { launchBrowser, newPage, createContext, waitForApp, closeBrowser } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openHymnControls } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4572),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const field = page.getByRole("spinbutton", {
    name: "Staff spacing",
    exact: true,
  });
  const open = async () => {
    await waitForApp(page,".hymn-pause");
    await page.locator(".abcjs-lyric").first().waitFor();
    if (!(await field.isVisible())) await openHymnControls(page);
    await expect(field).toBeVisible();
  };
  const change = async (value: number) => {
    await open();
    await field.fill(String(value));
    await field.press("Enter");
    await expect(field).toHaveValue(`${value} %`);
    await expect(
      page.getByText("Saved on this device.", { exact: true }),
    ).toBeVisible();
  };
  const metrics = () =>
    page.evaluate(() => {
      const staff = document.querySelector<SVGGraphicsElement>(".abcjs-staff")!;
      const lyric = document.querySelector<SVGGraphicsElement>(".abcjs-lyric")!;
      return {
        staff: staff.getBoundingClientRect().height,
        text:
          parseFloat(getComputedStyle(lyric).fontSize) *
          lyric.getScreenCTM()!.d,
      };
    });
  await page.goto(server.base + `/piano/hymns/${practiceHymn.slug}`);
  await page.locator(".abcjs-lyric").first().waitFor();
  await open();
  await expect(field).toHaveValue("100 %");
  const original = await metrics();
  await change(110);
  const adjusted = await metrics();
  expect(adjusted.staff / original.staff).toBeCloseTo(1.1, 2);
  expect(adjusted.text).toBeCloseTo(original.text, 2);
  await expect(
    page.getByRole("spinbutton", { name: "Staff size in pixels", exact: true }),
  ).toHaveValue("40 px");
  await page.keyboard.press("Escape");
  await page.goto(server.base + `/piano/hymns/${otherPracticeHymn.slug}`);
  await open();
  await expect(field).toHaveValue("110 %");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(
    page.getByRole("button", { name: "Expand playback options", exact: true }),
  ).toBeVisible();
  await open();
  await expect(field).toHaveValue("100 %");
  await change(95);
  await page.reload();
  await open();
  await expect(field).toHaveValue("95 %");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("spinbutton", { name: "Staff spacing", exact: true }),
  ).toBeVisible();
  await open();
  await expect(field).toHaveValue("110 %");
  expect(errors).toEqual([]);
  console.log(
    "PASS: fine staff spacing changes notation without resizing lyrics; global per-layout settings survive song changes and reload",
  );
} finally {
  await closeBrowser(browser);
  server.stop();
}
