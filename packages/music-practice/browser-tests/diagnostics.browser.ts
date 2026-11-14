import { readFileSync } from "node:fs";
const app = JSON.parse(readFileSync("package.json", "utf8")).name;
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const output = resolve("work/diagnostics-release");
const build = spawnSync(
  process.execPath,
  ["../../node_modules/vite/bin/vite.js", "build", "--outDir", output],
  {
    env: {
      ...process.env,
      VERCEL_ENV: "production",
      VITE_SENTRY_DSN: "https://public@telemetry.invalid/1",
    },
    encoding: "utf8",
  },
);
assert.equal(build.status, 0, build.stderr);
const mime: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/vnd.microsoft.icon",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname;
  try {
    const bytes = await readFile(
      resolve(
        output,
        path === "/" ||
          path === "/settings" ||
          /^\/(piano|guitar|rhythm|theory)(\/[a-z0-9-]+)*\/?$/.test(path)
          ? "index.html"
          : path.slice(1),
      ),
    );
    res.setHeader(
      "Content-Type",
      mime[extname(path)] ||
        (/^\/(piano|guitar|rhythm|theory)(\/[a-z0-9-]+)*\/?$/.test(path) ||
        path === "/" ||
        path === "/settings"
          ? "text/html"
          : "application/octet-stream"),
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage(),
    uploads: string[] = [];
  let fail = false,
    sdkLoads = 0;
  await context.route("https://telemetry.invalid/**", (route) => {
    if (fail) return route.abort("failed");
    uploads.push(route.request().postData() || "");
    return route.fulfill({
      status: 200,
      body: "{}",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  page.on("request", (r) => {
    if (/\/sentry-[^/]+\.js$/.test(r.url())) sdkLoads++;
  });
  await page.goto(
    `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
  );
  await page.locator(app === "songalong" ? ".hymn-paper svg" : '[data-letter="E"]:enabled').first().waitFor();
  await page.locator("a[data-settings]").click();
  const checkbox = page.getByRole("checkbox", {
    name: "Share diagnostic information",
    exact: true,
  });
  assert.equal(await checkbox.isChecked(), false);
  await page.evaluate(() =>
    window.practiceDiagnostics!.capture(
      Error("PRIVATE before consent"),
      "test.before_consent",
    ),
  );
  assert.equal(
    await page.evaluate(
      () => (window.practiceDiagnostics!.snapshot().errors as unknown[]).length,
    ),
    0,
  );
  assert.equal(sdkLoads, 0);
  assert.equal(uploads.length, 0);
  await checkbox.check();
  await page.waitForFunction(
    () => window.practiceDiagnostics?.getState().automatic === true,
  );
  await page.evaluate(() => {
    const d = window.practiceDiagnostics!;
    d.capture(Error("PRIVATE user@example.com"), "monitoring.smoke_test");
    d.metric("practice.render_ms", 12);
    d.event("practice.started");
    d.offline("storage", "failed", { cacheReason: "quota" });
    d.flush();
  });
  await page
    .waitForFunction(
      () => window.practiceDiagnostics?.getState().status === "connected",
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(
    uploads.some((body) => body.includes("monitoring.smoke_test")),
    "Opted-in errors reach actual SDK envelopes",
  );
  assert.ok(!uploads.join("").includes("PRIVATE"));
  assert.ok(!uploads.join("").includes("user@example.com"));
  assert.ok(uploads.join("").includes(app + "@"));
  assert.ok(uploads.join("").includes("cache.storage_failed"));
  assert.ok(
    uploads.join("").includes("trace_metric"),
    "Performance metrics are uploaded",
  );
  assert.ok(
    uploads.join("").includes("practice.started"),
    "Usage logs are uploaded",
  );
  // Failed transmission is queued and retried, without preventing practice.
  fail = true;
  await page.evaluate(() => {
    window.practiceDiagnostics!.capture(
      Error("PRIVATE offline"),
      "monitoring.offline_retry",
    );
    window.practiceDiagnostics!.flush();
  });
  await new Promise((r) => setTimeout(r, 500));
  fail = false;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.practiceDiagnostics!.flush();
  });
  const until = Date.now() + 12000;
  while (
    !uploads.some((s) => s.includes("monitoring.offline_retry")) &&
    Date.now() < until
  )
    await new Promise((r) => setTimeout(r, 200));
  assert.ok(uploads.some((s) => s.includes("monitoring.offline_retry")));
  await page.reload();
  await checkbox.waitFor();
  assert.equal(await checkbox.isChecked(), true);
  await checkbox.uncheck();
  await page.reload();
  await checkbox.waitFor();
  assert.equal(await checkbox.isChecked(), false);
  const count = uploads.length;
  await page.evaluate(() => {
    window.practiceDiagnostics!.capture(
      Error("PRIVATE opted out"),
      "test.after_opt_out",
    );
    window.practiceDiagnostics!.flush();
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(uploads.length, count);
  console.log(
    `PASS: ${app} real-SDK uploads, default opt-out, consent persistence, privacy, offline errors, failed-send retry, opt-out suppression.`,
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
