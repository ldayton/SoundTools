// Opt-in smoke test against a real static deployment, including its service worker.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== "https:")
  throw Error("Pass an HTTPS deployment origin");
(async () => {
  const release = await fetch(new URL("/release.json", origin));
  assert.equal(release.status, 200);
  assert.match(release.headers.get("cache-control"), /no-store/);
  const manifest = await release.json();
  assert.equal(manifest.base, "/");
  const wasm = manifest.files.find((file) => file.url.endsWith(".wasm"));
  assert(wasm, "Deployment must include the real analysis engine");
  const engine = await fetch(new URL(wasm.url, origin));
  assert.equal(engine.status, 200);
  assert.match(engine.headers.get("content-type"), /application\/wasm/);
  assert.match(engine.headers.get("cache-control"), /immutable/);
  await engine.body.cancel();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(
      () => !!navigator.serviceWorker.controller,
      undefined,
      { timeout: 90000 },
    );
    await page
      .getByRole("button", { name: "Play an Example", exact: true })
      .click();
    await page.waitForFunction(
      () => inputMode === "speech" && processingStats.frames > 200,
    );
    await page.locator("#freeze").click();
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Play an Example", exact: true })
      .click();
    await page.waitForFunction(
      () => inputMode === "speech" && processingStats.frames > 200,
    );
    await page.locator("#freeze").click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS:",
      origin,
      "real WASM analysis, recorded speech, pause and offline reload/playback; correct static headers.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
