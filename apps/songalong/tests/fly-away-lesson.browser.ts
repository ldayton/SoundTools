import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  waitForServer,
} from "../../../scripts/ci/browser-harness.cjs";
const reservation = createServer();
await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((r, j) => reservation.close((e) => (e ? j(e) : r())));
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`;
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser();
  await mkdir(new URL("../../../work/fly-away-chords/", import.meta.url), {
    recursive: true,
  });
  for (const mobile of [false, true]) {
    const page = await newPage(browser, {
      viewport: mobile
        ? { width: 393, height: 852 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const arrangement of ["guitar", "guitar-chords"]) {
      await page.goto(
        `${base}/piano/hymns/ill-fly-away?arrangement=${arrangement}&key=D`,
      );
      await page.locator(".hymn-paper svg").first().waitFor();
      const guide = page.getByRole("figure", {
        name: /Strumming pattern: down on 1/,
      });
      await guide.waitFor();
      assert.deepEqual(
        await guide.locator(".hymn-strum-count").allTextContents(),
        ["1", "&", "2", "&", "3", "&", "4", "&"],
      );
      assert.deepEqual(
        await guide.locator(".hymn-strum-stroke").allTextContents(),
        ["↓", "·", "↓", "↑", "↓", "·", "↓", "·"],
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Show A7 chord diagram", exact: true })
          .count(),
        2,
      );
      const box = await guide.boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width,
      );
      if (arrangement === "guitar")
        await page.screenshot({
          path: new URL(
            `../../../work/fly-away-chords/${mobile ? "phone" : "desktop"}.png`,
            import.meta.url,
          ).pathname,
        });
    }
    await page.goto(base + "/piano/hymns/ill-fly-away?arrangement=melody");
    await page.locator(".hymn-paper svg").first().waitFor();
    assert.equal(await page.locator(".hymn-strum-pattern").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS lesson-aligned chords and strum guide on desktop and phone; melody view unchanged",
  );
} finally {
  await closeBrowser(browser);
  server.kill();
}
