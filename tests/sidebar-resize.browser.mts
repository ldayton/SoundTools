import { chromium, webkit, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { preview } from "../packages/music-practice/browser-tests/server";
import { waitForServer } from "../scripts/ci/browser-harness.cjs";
const browser = await (
  process.env.TEST_BROWSER === "webkit" ? webkit : chromium
).launch();
const servers: Awaited<ReturnType<typeof preview>>[] = [];
const glow = spawn(
  process.execPath,
  [
    "-e",
    "require('./scripts/dev-server.cjs').createDevServer().listen(4583,'127.0.0.1')",
  ],
  { cwd: new URL("../apps/soundglow/", import.meta.url), stdio: "ignore" },
);
async function check(
  page: Page,
  label: string,
  panelSelector: string,
  direction: number,
) {
  const grip = page.getByRole("separator", { name: label, exact: true });
  await expect(grip).toBeVisible();
  const panel = page.locator(panelSelector),
    min = Number(await grip.getAttribute("aria-valuemin"));
  const width = async () => Math.round((await panel.boundingBox())!.width);
  expect(await width()).toBe(min);
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + direction * 96,
    box.y + box.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect.poll(width).toBe(min + 96);
  await grip.focus();
  await page.keyboard.press(direction === 1 ? "ArrowLeft" : "ArrowRight");
  await expect.poll(width).toBe(min + 80);
  await page.keyboard.press("Home");
  await expect.poll(width).toBe(min);
  await page.keyboard.press(direction === 1 ? "ArrowLeft" : "ArrowRight");
  await expect.poll(width).toBe(min);
  await page.keyboard.press("End");
  expect(await width()).toBeGreaterThan(min);
  await grip.dblclick();
  await expect.poll(width).toBe(min);
}
try {
  for (const [i, app] of ["notewise", "songalong", "dorego"].entries()) {
    const server = await preview(app, 4580 + i);
    servers.push(server);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      server.base + (app === "songalong" ? "/piano/hymns/ill-fly-away" : ""),
    );
    await check(page, "Resize navigation", "#practice-navigation", 1);
    await check(page, "Resize options", ".practice-options", -1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 393, height: 852 });
    await expect(
      page.getByRole("separator", { name: "Resize navigation", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole("separator", { name: "Resize options", exact: true }),
    ).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(
      page.getByRole("separator", { name: "Resize options", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      "PASS",
      app,
      "both panel grips, drag, minimum, keyboard, reset and mobile",
    );
    await page.close();
  }
  await waitForServer("http://127.0.0.1:4583/dist/index.html", {
    server: glow,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4583/dist/index.html");
  await page.locator("#openSettings").click();
  await check(page, "Resize files and settings", "#panel", 1);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(
    page.getByRole("separator", {
      name: "Resize files and settings",
      exact: true,
    }),
  ).toBeHidden();
  expect(errors).toEqual([]);
  console.log(
    "PASS soundglow panel grip, drag, minimum, keyboard, reset and mobile",
  );
} finally {
  await browser.close();
  servers.forEach((s) => s.stop());
  glow.kill();
}
