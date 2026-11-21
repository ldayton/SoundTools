import assert from "node:assert/strict";
import { expect, type Route } from "@playwright/test";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { playbackHymn } from "../../../packages/music-practice/test-fixtures/hymns";

const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4578),
);
const browser = await launchBrowser();
try {
  const page = await newPage(browser);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = ((window as any).sampleProbe = {
      started: 0,
      aborted: 0,
      pending: 0,
      loaded: 0,
    });
    const original = window.fetch;
    window.fetch = async (input, options) => {
      if (!String(input).endsWith(".flac")) return original(input, options);
      probe.started++;
      probe.pending++;
      options?.signal?.addEventListener("abort", () => probe.aborted++, {
        once: true,
      });
      try {
        const response = await original(input, options);
        // Track the response body too: pagehide can arrive after headers.
        const data = await response.arrayBuffer();
        probe.loaded++;
        return new Response(data, {
          status: response.status,
          headers: response.headers,
        });
      } finally {
        probe.pending--;
      }
    };
  });
  let hold = true;
  const blocked: Route[] = [];
  await page.route("**/*.flac", async (route) => {
    if (hold) blocked.push(route);
    else await route.continue();
  });
  for (const boundary of ["beforeunload", "pagehide"]) {
    hold = true;
    blocked.length = 0;
    await page.goto(
      server.base + `/piano/hymns/${playbackHymn.id}?mode=playback&countIn=0`,
    );
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as any).sampleProbe.started))
      .toBe(4);
    // Keep the document alive long enough to observe the departure boundary.
    // SongAlong reloads bfcache restorations because its views were disposed.
    await page.evaluate(
      (boundary) => dispatchEvent(new Event(boundary)),
      boundary,
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).sampleProbe.aborted))
      .toBe(4);
    hold = false;
    await Promise.all(blocked.map((route) => route.continue().catch(() => {})));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => (window as any).sampleProbe?.loaded || 0))
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(() => (window as any).sampleProbe.pending))
      .toBe(0);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    assert.deepEqual(errors, []);
  }

  // Genuine failures in a live document must still reach the user. No blanket
  // access-control, network-error, or pageerror filtering is permitted.
  const broken = await newPage(browser);
  await broken.route("**/*.flac", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await broken.goto(
    server.base + `/piano/hymns/${playbackHymn.id}?mode=playback&countIn=0`,
  );
  await broken.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    broken.getByText("Audio couldn’t load. Try starting again.", {
      exact: true,
    }),
  ).toBeVisible();
  console.log(
    "PASS: pending samples abort on departure, restoration reloads safely, playback recovers, and live HTTP failures remain visible",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
