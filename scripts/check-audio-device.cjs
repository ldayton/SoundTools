// Fail early when a headless runner has no working Firefox audio device/clock.
process.env.TEST_BROWSER = "firefox";
(async () => {
  const { launchTestBrowser } = await import("../apps/dorego/tests/browser-harness.ts");
  const browser = await launchTestBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<button onclick="window.audio = new AudioContext(); audio.resume()">Start</button>`,
    );
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForFunction(
      () => window.audio.state === "running" && window.audio.currentTime > 0.1,
      undefined,
      { timeout: 5000 },
    );
    await page.evaluate(() => window.audio.close());
    console.log("Firefox audio output clock advances.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
