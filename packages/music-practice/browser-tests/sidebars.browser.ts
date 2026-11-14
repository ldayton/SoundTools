import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preview } from "./server";
const engine = process.env.TEST_BROWSER || "chromium";
const home = await mkdtemp(join(tmpdir(), "practice-sidebars-"));
const browser = await { chromium, firefox, webkit }[engine]!.launch({
  env: { ...process.env, CFFIXED_USER_HOME: home },
});
const note = await preview("notewise", 4430),
  song = await preview("songalong", 4431);
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript({
    content: await readFile(
      new URL("../test-fixtures/midi.js", import.meta.url),
      "utf8",
    ),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(note.base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  const nav = page.locator("#practice-navigation");
  assert.equal(
    await nav.getByRole("slider", { name: "Piano volume" }).count(),
    1,
  );
  assert.equal(await nav.locator(".keyboard-menu").count(), 1);
  assert.equal(await page.locator("header .keyboard-menu").count(), 0);
  await page.locator("#roundLength").selectOption("24");
  await page.locator('nav a[data-mode="piano"]').click();
  assert.equal(await page.locator("#roundLength").inputValue(), "12");
  await page.locator("#roundLength").selectOption("48");
  await page.locator('nav a[data-mode="staff"]').click();
  assert.equal(await page.locator("#roundLength").inputValue(), "24");
  await page.locator('nav a[data-mode="piano"]').click();
  assert.equal(await page.locator("#roundLength").inputValue(), "48");
  await page.goto(song.base);
  await page.locator(".hymn-paper svg").first().waitFor();
  assert.equal(await nav.locator("#hymn-search").count(), 1);
  assert.equal(await page.locator(".practice-options #hymn-search").count(), 0);
  const choose = async (title: string) => {
    const input = page.getByRole("combobox", { name: "Hymn", exact: true });
    await input.click();
    await input.fill(title);
    await page.getByRole("option", { name: title, exact: true }).click();
    await page.locator(".sequence-title").filter({ hasText: title }).waitFor();
  };
  await page.locator("#hymn-key").selectOption("F");
  await page.locator("#hymn-arrangement").selectOption("bass");
  await page.locator("#hymn-mode").selectOption("playback");
  await page.locator("#hymn-tempo").fill("110");
  await page.locator("#hymn-tempo").press("Enter");
  await page.locator("#hymn-size").selectOption("1.2");
  await nav.getByRole("slider", { name: "Piano volume" }).focus();
  await page.keyboard.press("Home");
  await choose("Silent Night");
  assert.equal(await page.locator("#hymn-key").inputValue(), "original");
  assert.equal(await page.locator("#hymn-arrangement").inputValue(), "melody");
  assert.equal(await page.locator("#hymn-mode").inputValue(), "wait");
  assert.equal(await page.locator("#hymn-size").inputValue(), "1");
  await choose("Amazing Grace");
  assert.equal(await page.locator("#hymn-key").inputValue(), "F");
  assert.equal(await page.locator("#hymn-arrangement").inputValue(), "bass");
  assert.equal(await page.locator("#hymn-mode").inputValue(), "playback");
  assert.equal(await page.locator("#hymn-tempo").inputValue(), "110");
  assert.equal(await page.locator("#hymn-size").inputValue(), "1.2");
  assert.equal(
    await nav
      .getByRole("slider", { name: "Piano volume" })
      .getAttribute("aria-valuenow"),
    "0",
  );
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await choose("Silent Night");
  assert.match(page.url(), /piano\/hymns\/silent-night/);
  assert.equal(await page.locator("#hymn-mode").inputValue(), "wait");
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  await page.reload();
  await page.locator(".hymn-paper svg").first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await nav.getByRole("slider", { name: "Piano volume" }).waitFor();
  await choose("Amazing Grace");
  await page.locator(".mantine-Drawer-content").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await nav.locator(".keyboard-menu").click();
  await page
    .getByRole("button", { name: "Connect MIDI keyboard", exact: true })
    .click();
  await page.locator(".mantine-Drawer-content").waitFor({ state: "hidden" });
  assert.ok(await page.locator(".hymn-paper svg").first().isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await choose("Silent Night");
  await page.locator(".mantine-Drawer-content").waitFor({ state: "hidden" });
  assert.match(page.url(), /piano\/hymns\/silent-night/);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: left selection/volume/MIDI, independent right settings, settings navigation, reload and mobile drawers pass`,
  );
} finally {
  await browser.close();
  note.stop();
  song.stop();
  await rm(home, { recursive: true, force: true }).catch((e) => {
    if (!["EACCES", "EPERM"].includes(e.code)) throw e;
  });
}
