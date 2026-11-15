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
    console.log(
      `PASS shared UI/${engine}: drafts, Escape, Enter once, blur, bounds, decimals, rejection, reset, external changes, step controls and isolated playback subscriptions`,
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
