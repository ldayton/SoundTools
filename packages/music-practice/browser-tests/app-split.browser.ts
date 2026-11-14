import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preview } from "./server";
const engine = process.env.TEST_BROWSER || "chromium";
const home = await mkdtemp(join(tmpdir(), "soundtools-split-"));
const browser = await { chromium, firefox, webkit }[engine]!.launch({
  env: { ...process.env, CFFIXED_USER_HOME: home },
});
const notes = await preview("notewise", 4420);
const songs = await preview("songalong", 4421);
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, server] of [
    ["NoteWise", notes],
    ["SongAlong", songs],
  ] as const) {
    await page.goto(server.base);
    await page
      .getByRole("link", { name: name + " home", exact: true })
      .waitFor();
    if (name === "SongAlong") {
      await page.locator(".hymn-paper svg").first().waitFor();
      assert.equal(await page.locator('nav a[data-mode="staff"]').count(), 0);
      assert.equal(await page.locator('nav a[data-mode="sight"]').count(), 1);
      assert.match(await page.title(), /SongAlong/);
      await page.locator("#hymn-mode").selectOption("playback");
      await page.getByRole("button", { name: "Play", exact: true }).focus();
      await page.keyboard.down("Enter");
      await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
      await page.waitForFunction(() => Number(document.querySelector('[aria-label="Hymn progress"]')?.getAttribute("aria-valuenow")) > 0);
      await page.keyboard.down("Enter");
      assert.ok(
        await page
          .getByRole("button", { name: "Pause", exact: true })
          .isVisible(),
        "held Enter must not toggle playback repeatedly",
      );
      await page.keyboard.up("Enter");
      await page.getByRole("button", { name: "Pause", exact: true }).click();

      await page.goto(server.base + "/theory/scales");
    } else {
      await page.locator('[data-letter="E"]:enabled').waitFor();
      assert.equal(await page.locator('nav a[data-mode="sight"]').count(), 0);
      await page.goto(server.base + "/piano/hymns/amazing-grace");
    }
    await page
      .getByRole("heading", { name: "Page not found", exact: true, level: 1 })
      .waitFor();
    await page.locator(".route-missing a").click();
    assert.match(
      page.url(),
      name === "SongAlong" ? /piano\/hymns/ : /guitar\/staff/,
    );
    await page.goto(server.base + "/settings");
    await page
      .getByLabel("Share diagnostic information", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Share diagnostic information", { exact: true })
        .isChecked(),
      false,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: name + " home", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: independent names, route boundaries, defaults, settings and mobile shells pass`,
  );
} finally {
  await browser.close();
  notes.stop();
  songs.stop();
  await rm(home, { recursive: true, force: true }).catch((e) => {
    if (!["EACCES", "EPERM"].includes(e.code)) throw e;
  });
}
