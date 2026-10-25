const assert = require("node:assert/strict");
const { chromium } = require("playwright");
async function testStartupRecovery(url, app) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.clock.install();
    const missing =
      app === "dorego" ? "**/assets/main-*.js" : "**/releases/*/app.js";
    await page.route(missing, (route) => route.abort("failed"));
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.clock.fastForward(12001);
    await page
      .getByText("Still loading. Check your connection or try again.", {
        exact: false,
      })
      .waitFor();
    await page.unroute(missing);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(() => window.__soundtoolsStartup?.ready);
    assert.equal(await page.locator("#startup-recovery").count(), 0);
    await context.close();
    console.log(
      "PASS: " + app + " missing startup script offers retry and recovers",
    );
  } finally {
    await browser.close();
  }
}
module.exports = { testStartupRecovery };
