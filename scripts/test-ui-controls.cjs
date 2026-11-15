const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const engines = require("playwright");
(async () => {
  const { createServer } = await import("vite"),
    { default: react } = await import("@vitejs/plugin-react");
  const server = await createServer({
    configFile: false,
    root: path.resolve(__dirname, "../packages/ui/tests"),
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 4970,
      strictPort: true,
      hmr: false,
      fs: { allow: [path.resolve(__dirname, "..")] },
    },
  });
  const home = await mkdtemp(path.join(tmpdir(), "soundtools-ui-"));
  let browser;
  try {
    await server.listen();
    const engine = process.env.TEST_BROWSER || "chromium";
    browser = await engines[engine].launch({
      env: { ...process.env, CFFIXED_USER_HOME: home },
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4970");
    const integer = page.locator("#integer"),
      decimal = page.locator("#decimal"),
      canonical = page.locator("#canonical");
    await integer.fill("137");
    assert.equal(await canonical.textContent(), "120:1.5:0");
    await integer.press("Escape");
    await integer.blur();
    assert.equal(await integer.inputValue(), "120");
    assert.equal(await canonical.textContent(), "120:1.5:0");
    await integer.fill("138");
    await integer.press("Enter");
    assert.equal(await canonical.textContent(), "138:1.5:1");
    await integer.fill("");
    await integer.blur();
    assert.equal(await integer.inputValue(), "138");
    await integer.fill("999");
    await integer.blur();
    assert.equal(await integer.inputValue(), "240");
    await decimal.fill("2.7");
    await decimal.blur();
    assert.equal(await decimal.inputValue(), "2.7");
    await decimal.fill("7");
    await decimal.blur();
    assert.equal(await decimal.inputValue(), "2.7");
    await decimal.fill("3.4");
    await page.locator("#reset").click();
    assert.equal(await decimal.inputValue(), "2.7");
    await integer.fill("150");
    await page.locator("#external").click();
    assert.equal(await integer.inputValue(), "140");
    await integer.press("ArrowUp");
    assert.equal(await integer.inputValue(), "141");
    const reads = await page.evaluate(() => window.clockTest.reads());
    for (let tick = 1; tick <= 10; tick++) {
      await page.evaluate(() => window.clockTest.advance());
      await page.waitForFunction(
        (tick) =>
          document.getElementById("elapsed").textContent ===
          `0:${String(tick).padStart(2, "0")}`,
        tick,
      );
    }
    assert.equal(
      await page.evaluate(() => window.clockTest.reads()),
      reads,
      "Clock updates must not invalidate practice, title or volume subscriptions",
    );
    assert.deepEqual(errors, []);
    // Delay the focus trap's activation until after arrow navigation. Its
    // deferred focus must follow the roving cell, not the originally selected one.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(0);
    await page.locator("#test-pitch").press("Enter");
    await page.getByRole("button", { name: "C3", exact: true }).waitFor();
    await page.keyboard.press("ArrowDown");
    await page.clock.runFor(25);
    assert.equal(
      await page
        .getByRole("button", { name: "C4", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#test-pitch").inputValue(), "C4");
    await page.clock.resume();
    for (const options of ["", "&dark&stopFails&reportFails"]) {
      await page.goto("http://127.0.0.1:4970/?recovery" + options);
      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.setItem("saved-preference", "preserved");
      });
      await page
        .getByRole("button", { name: "Trigger render failure" })
        .click();
      const recovery = page.getByRole("main", { name: "Test app recovery" });
      await recovery.waitFor();
      await page.waitForFunction(
        () => sessionStorage.getItem("shutdowns") === "1",
      );
      assert.equal(
        await recovery
          .getByRole("heading")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        (await recovery.textContent()).includes("private technical detail"),
        false,
      );
      assert.equal(
        await page.locator("html").getAttribute("data-mantine-color-scheme"),
        options ? "dark" : "light",
      );
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem("reports")),
        options ? "2" : "1",
      );
      await page
        .getByRole("button", { name: "Reload app", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Trigger render failure" })
        .waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem("saved-preference")),
        "preserved",
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS shared UI/${engine}: drafts, Escape, Enter once, blur, bounds, decimals, rejection, reset, external changes, step controls isolated playback subscriptions, and render recovery (shutdown, reporting failures, focus, dark theme and reload)`,
    );
  } finally {
    await browser?.close();
    await server.close();
    await rm(home, { recursive: true, force: true }).catch((error) => {
      if (process.platform !== "darwin" || error.code !== "EACCES") throw error;
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
