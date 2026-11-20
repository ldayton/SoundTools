import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../scripts/ci/browser-harness.cjs";
import { macBookAir13, iphone14Pro } from "../scripts/test-devices.cjs";
import { preview } from "../packages/music-practice/browser-tests/server";

const browser = await launchBrowser();
const servers: Awaited<ReturnType<typeof preview>>[] = [];
const engine = process.env.TEST_BROWSER || "chromium";
try {
  await mkdir("work/sidebar-tools", { recursive: true });
  for (const [index, app] of ["dorego", "notewise", "songalong"].entries()) {
    const server = await preview(
      app,
      Number(process.env.TEST_PORT || 4670) + index,
    );
    servers.push(server);
    for (const [name, device] of [
      ["macbook-air", macBookAir13],
      ["iphone-14-pro", iphone14Pro],
    ] as const) {
      const page = await newPage(browser, {
        ...device,
        reducedMotion: "reduce",
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript({
        content: await readFile(
          new URL(
            "../packages/music-practice/test-fixtures/midi.js",
            import.meta.url,
          ),
          "utf8",
        ),
      });
      await page.goto(server.base);
      await expect(page.locator(".mantine-AppShell-header")).toBeVisible();
      if (device.isMobile) {
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
        await expect
          .poll(() =>
            page
              .locator("#navigation-drawer .mantine-Drawer-content")
              .evaluate((el) => {
                const r = el.getBoundingClientRect();
                return r.x >= -1 && r.right <= innerWidth + 1;
              }),
          )
          .toBe(true);
      }
      const nav = page.locator("#practice-navigation");
      const tools = nav.locator(".sidebar-tools");
      const settings = tools.getByRole("link", {
        name: "Settings",
        exact: true,
      });
      const account = tools.getByRole("button", {
        name: "Log in",
        exact: true,
      });
      await account.scrollIntoViewIfNeeded();
      await expect(settings).toBeInViewport({ ratio: 1 });
      await expect(account).toBeInViewport({ ratio: 1 });
      const a = (await settings.boundingBox())!,
        b = (await account.boundingBox())!;
      assert.equal(a.height, 44, `${app} Settings has a compact touch target`);
      assert.equal(b.height, a.height, `${app} uses the same row height`);
      const sx = (await settings
        .locator(".mantine-NavLink-label")
        .boundingBox())!.x;
      const ax = (await account
        .locator(".mantine-NavLink-label")
        .boundingBox())!.x;
      assert.ok(Math.abs(sx - ax) < 1, `${app} utility labels align`);
      assert.ok(
        Math.abs(b.y - a.y - a.height) < 1,
        `${app} has no spacer between utility rows`,
      );
      assert.equal(
        await nav.getByText("SOUNDTOOLS", { exact: true }).count(),
        0,
      );
      if (app !== "dorego" && !(app === "songalong" && device.isMobile)) {
        const keyboard = tools.locator(".keyboard-menu");
        await keyboard.scrollIntoViewIfNeeded();
        const k = (await keyboard.boundingBox())!,
          s = (await settings.boundingBox())!;
        assert.equal(
          k.height,
          a.height,
          `${app} Keyboard matches the other tools`,
        );
        assert.ok(
          Math.abs(s.y - k.y - k.height) < 1,
          `${app} has no extra Keyboard divider/gap`,
        );
        await keyboard.click();
        await expect(keyboard).toHaveAttribute("aria-expanded", "true");
        const connect = tools.getByRole("button", {
          name: "Connect MIDI keyboard",
          exact: true,
        });
        await expect(connect).toBeVisible();
        await connect.click();
        if (device.isMobile) {
          await expect(
            page.getByRole("button", { name: "Close navigation", exact: true }),
          ).toBeHidden();
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        }
        await expect(keyboard).toHaveAttribute("data-state", "connected");
        await expect(keyboard).toHaveAttribute("aria-expanded", "false");
        // Collapsing the disclosure must retain the active connection and contents.
        for (let retry = 0; retry < 2; retry++) {
          await keyboard.click();
          await expect(keyboard).toHaveAttribute("aria-expanded", "true");
          await expect(tools.getByText(/GO:KEYS 5 connected/)).toBeVisible();
          await keyboard.click();
          await expect(keyboard).toHaveAttribute("aria-expanded", "false");
          await expect(tools.locator("#midi-panel")).toBeHidden();
        }
      } else {
        assert.equal(await tools.locator(".keyboard-menu").count(), 0);
      }
      if (!device.isMobile) {
        const grip = page.getByRole("separator", {
          name: "Resize navigation",
          exact: true,
        });
        const initial = (await nav.boundingBox())!.width;
        const g = (await grip.boundingBox())!;
        await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
        await page.mouse.down();
        await page.mouse.move(g.x + g.width / 2 + 80, g.y + g.height / 2, {
          steps: 8,
        });
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await nav.boundingBox())!.width))
          .toBe(Math.round(initial + 80));
        await grip.dblclick();
        await expect
          .poll(async () => Math.round((await nav.boundingBox())!.width))
          .toBe(Math.round(initial));
      }
      await account.scrollIntoViewIfNeeded();
      const left = await nav.evaluate((el) => el.scrollLeft);
      assert.equal(
        left,
        0,
        `${app} expanding Keyboard must not pan the sidebar`,
      );
      await page.screenshot({
        path: `work/sidebar-tools/${app}-${name}-${engine}.png`,
      });
      await tools.screenshot({
        path: `work/sidebar-tools/${app}-${name}-tools-${engine}.png`,
      });
      await nav.screenshot({
        path: `work/sidebar-tools/${app}-${name}-sidebar-${engine}.png`,
      });
      await account.click();
      await expect(
        page.getByRole("dialog", { name: "Log in", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close account", exact: true })
        .click();
      await expect(account).toBeFocused();
      await settings.click();
      await expect(page.locator("#page-title")).toHaveText("Settings");
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${app} ${name}: compact adjacent rows, MIDI disclosure/connection, account dialog/focus, Settings and no horizontal pan`,
      );
      await page.close();
    }
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  for (const server of servers) server.stop();
}
