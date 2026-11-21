import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { macBookAir13, iphone14Pro } from "../../../scripts/test-devices.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { hymnLibrary } from "../../../packages/music-practice/src/hymn-library";

const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4565),
);
const browser = await launchBrowser();
try {
  for (const [name, device] of [
    ["macbook-air", macBookAir13],
    ["iphone-14-pro", iphone14Pro],
  ] as const) {
    const page = await newPage(browser, { ...device, reducedMotion: "reduce" });
    // Library geometry checks require an available MIDI interface on every
    // engine; native Web MIDI support is tested separately by the MIDI suites.
    await page.addInitScript({
      content: await readFile(
        new URL(
          "../../../packages/music-practice/test-fixtures/midi.js",
          import.meta.url,
        ),
        "utf8",
      ),
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const mobile = !!device.isMobile;
    const library = page.locator(".hymn-library-list");
    const tools = page.locator(".songalong-navigation-tools");
    async function openLibrary() {
      if (mobile && !(await page.getByPlaceholder("Search songs").isVisible()))
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      await expect(page.getByPlaceholder("Search songs")).toBeVisible();
      if (mobile)
        await expect
          .poll(() =>
            page
              .locator("#navigation-drawer .mantine-Drawer-content")
              .evaluate((el) => {
                const box = el.getBoundingClientRect();
                return box.x >= -1 && box.right <= innerWidth + 1;
              }),
          )
          .toBe(true);
    }
    async function choose(title: string) {
      await openLibrary();
      await page.getByPlaceholder("Search songs").fill(title);
      await page.getByRole("option", { name: title, exact: true }).click();
      await expect(page.locator(".sequence-title")).toHaveText(title);
      if (mobile)
        await expect(
          page.getByRole("button", { name: "Close navigation", exact: true }),
        ).toBeHidden();
    }
    async function assertPinned() {
      const geometry = await page
        .locator("#practice-navigation")
        .evaluate((nav) => {
          const library = nav.querySelector(".hymn-library-list")!,
            tools = nav.querySelector(".songalong-navigation-tools")!;
          const list = library.getBoundingClientRect(),
            footer = tools.getBoundingClientRect(),
            box = nav.getBoundingClientRect();
          return {
            listBottom: list.bottom,
            footerTop: footer.top,
            footerBottom: footer.bottom,
            navBottom: box.bottom,
            height: innerHeight,
            scroll: nav.scrollHeight,
            client: nav.clientHeight,
            scrollLeft: nav.scrollLeft,
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
          };
        });
      assert.ok(
        geometry.listBottom <= geometry.footerTop,
        JSON.stringify(geometry),
      );
      assert.ok(
        geometry.footerBottom <= geometry.height &&
          geometry.height - geometry.footerBottom <= 20,
        JSON.stringify(geometry),
      );
      assert.ok(
        geometry.scroll <= geometry.client + 1,
        "Navigation itself must not scroll",
      );
      assert.equal(geometry.scrollLeft, 0, JSON.stringify(geometry));
      await expect(
        tools.getByRole("link", { name: "Settings", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        tools.getByRole("button", { name: "Log in", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
    await page.goto(server.base + "/piano/hymns/amazing-grace");
    await expect(
      page.getByRole("button", { name: "Add to favorites", exact: true }),
    ).toBeVisible();
    await openLibrary();
    assert.deepEqual(
      await library.getByRole("option").allTextContents(),
      hymnLibrary(hymns, "", {}).map((h) => h.title),
    );
    await assertPinned();
    assert.ok(
      await library.evaluate((el) => el.scrollHeight > el.clientHeight),
      "Remaining songs must be reachable by scrolling the list",
    );
    const footerBefore = await tools.boundingBox();
    await page.getByPlaceholder("Search songs").fill("zzzz-no-such-song");
    await expect(
      page.getByText("No hymns found. Try another title."),
    ).toBeVisible();
    await assertPinned();
    assert.ok(
      Math.abs((await tools.boundingBox())!.y - footerBefore!.y) < 1,
      "Filtering must not move footer controls",
    );
    await page.getByPlaceholder("Search songs").fill("");
    if (mobile)
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
    const star = page.locator(".hymn-favorite");
    await expect(star.locator("svg")).toHaveAttribute("fill", "none");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(star.locator("svg")).toHaveAttribute("fill", "currentColor");
    await choose("Jesus Loves Me");
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await openLibrary();
    const favorites = { "amazing-grace": true, "jesus-loves-me": true };
    assert.deepEqual(
      await library.getByRole("option").allTextContents(),
      hymnLibrary(hymns, "", favorites).map((h) => h.title),
    );
    await library.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(library.getByRole("option").last()).toBeInViewport();
    await assertPinned();
    await page.getByPlaceholder("Search songs").fill("Silent Night");
    await page.getByPlaceholder("Search songs").press("Enter");
    await expect(page.locator(".sequence-title")).toHaveText("Silent Night");
    if (mobile)
      await expect(
        page.getByRole("button", { name: "Close navigation", exact: true }),
      ).toBeHidden();
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    // Await the completed guest save before reloading.
    await expect
      .poll(() => page.locator("#practice-content").textContent())
      .toContain("Saved on this device.");
    await page.reload();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await openLibrary();
    await expect
      .poll(() => library.getByRole("option").allTextContents())
      .toEqual(hymnLibrary(hymns, "", favorites).map((h) => h.title));
    await assertPinned();
    if (!mobile) {
      await tools
        .getByRole("button", { name: "Keyboard connection", exact: true })
        .click();
      await expect(
        tools.getByRole("button", {
          name: "Connect MIDI keyboard",
          exact: true,
        }),
      ).toBeVisible();
      await assertPinned();
      await tools
        .getByRole("button", { name: "Keyboard connection", exact: true })
        .click();
      await expect(
        tools.getByRole("button", {
          name: "Connect MIDI keyboard",
          exact: true,
        }),
      ).toBeHidden();
      await assertPinned();
    }
    await mkdir("work/songalong-library", { recursive: true });
    await page.screenshot({
      path: `work/songalong-library/${name}-${process.env.TEST_BROWSER || "chromium"}.png`,
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS: alphabetical favorites, star toggling/reload, keyboard selection and anchored sidebar controls on MacBook Air and iPhone 14 Pro",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
