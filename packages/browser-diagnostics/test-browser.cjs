// Real SDK contract: all outbound telemetry is intercepted, never sent to Sentry.
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");
(async () => {
  const root = path.dirname(
    require.resolve("@ldayton/browser-diagnostics/package.json"),
  );
  const peer = require("esbuild").buildSync({
    stdin: {
      contents: 'export {getIsolationScope} from "@sentry/browser";',
      resolveDir: root,
    },
    bundle: true,
    format: "iife",
    globalName: "SentryPeer",
    write: false,
  }).outputFiles[0].text;
  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      return res.end("<!doctype html><title>Diagnostics test</title>");
    }
    if (req.url === "/peer.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(peer);
    }
    res.setHeader("Content-Type", "text/javascript");
    res.end(fs.readFileSync(path.join(root, req.url)));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  const payloads = [];
  const failed = [];
  let fail = false,
    sdkLoads = 0;
  function items() {
    return payloads.flatMap((body) => {
      const lines = body.trim().split("\n"),
        out = [];
      for (let i = 1; i < lines.length; i += 2)
        out.push({
          type: JSON.parse(lines[i]).type,
          payload: JSON.parse(lines[i + 1]),
        });
      return out;
    });
  }
  try {
    browser = await { chromium, firefox, webkit }[
      process.env.TEST_BROWSER || "chromium"
    ].launch();
    const context = await browser.newContext(),
      page = await context.newPage();
    page.on("request", (r) => {
      if (r.url().endsWith("/sentry.js")) sdkLoads++;
    });
    await context.route("https://telemetry.invalid/**", async (route) => {
      if (fail) {
        failed.push(route.request().postData());
        return route.abort("failed");
      }
      payloads.push(route.request().postData());
      await route.fulfill({
        status: 200,
        body: "{}",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ url: "/peer.js" });
    await page.evaluate(() => {
      SentryPeer.getIsolationScope().setUser({ email: "PRIVATE" });
      SentryPeer.getIsolationScope().setAttributes({ private_text: "PRIVATE" });
    });
    await page.addScriptTag({ url: "/core.js" });
    await page.evaluate(async () => {
      localStorage.setItem("soundglow:diagnostics:sharing", "no");
      window.d = BrowserDiagnostics.create({
        app: "soundglow",
        release: "test-1",
        dsn: "https://public@telemetry.invalid/1",
        sdkUrl: "/sentry.js",
        snapshot: () => ({
          view: "pitch",
          sampleRate: 48000,
          title: "PRIVATE",
        }),
      });
      await d.ready;
      BrowserDiagnostics.attachPanel(d, document.body);
    });
    assert.equal(sdkLoads, 0, "No SDK loads before consent");
    assert.equal(payloads.length, 0, "No uploads before consent");
    await page
      .getByRole("checkbox", {
        name: "Share diagnostic information",
        exact: true,
      })
      .check();
    await page.waitForFunction(() => d.getState().status === "connected");
    await page.evaluate(async () => {
      d.event("transport.play", { running: true, title: "PRIVATE" });
      d.metric("analysis.ms", 12);
      d.capture(
        Object.assign(new Error("PRIVATE"), {
          stack:
            "Error: PRIVATE\n at app (https://example.org/app.js?token=SECRET:12:9)",
        }),
        "audio.failed",
      );
      d.flush();
      await d.persist();
    });
    await page.waitForFunction(() => d.getState().status === "connected");
    assert.equal(sdkLoads, 1);
    const deadline = Date.now() + 5000;
    const complete = () =>
      ["event", "log", "trace_metric"].every((type) =>
        items().some((item) => item.type === type),
      );
    while (!complete() && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert(
      complete(),
      "Missing event/log/metric envelopes: " + items().map((item) => item.type),
    );
    const event = items().find((i) => i.type === "event").payload;
    assert.equal(event.release, "soundglow@test-1");
    assert(!event.request && !event.user);
    assert.equal(
      event.contexts.diagnostics.errors[0].frames[0].filename,
      "https://example.org/app.js",
    );
    assert(!event.contexts.trace);
    const logs = items()
      .filter((i) => i.type === "log")
      .flatMap((i) => i.payload.items);
    assert(logs.some((log) => log.body === "transport.play"));
    assert(logs.some((log) => log.body === "session.started"));
    const metrics = items()
      .filter((i) => i.type === "trace_metric")
      .flatMap((i) => i.payload.items);
    assert(
      metrics.some((m) => m.name === "analysis.ms.count" && m.value === 1),
    );
    assert(
      metrics.some((m) => m.name === "analysis.ms.total" && m.value === 12),
    );
    assert(
      !items().some(
        (i) =>
          i.type === "event" &&
          i.payload.message === "diagnostics.health_summary",
      ),
    );
    assert(!/PRIVATE|SECRET|user\.email|user\.id/.test(payloads.join("")));
    assert(
      await page.evaluate(() => {
        const now = Date.now() / 1000,
          check = BrowserDiagnosticsSentry.freshEnvelope;
        return (
          check([
            {},
            [[{ type: "trace_metric" }, { items: [{ timestamp: now }] }]],
          ]) &&
          !check([
            {},
            [[{ type: "log" }, { items: [{ timestamp: now - 86401 }] }]],
          ]) &&
          !check([{}, [[{ type: "event" }, { timestamp: now - 86401 }]]]) &&
          !check([{}, [[{ type: "replay_event" }, {}]]])
        );
      }),
    );
    fail = true;
    await page.evaluate(() => {
      d.capture(Error("PRIVATE"), "audio.offline");
      d.event("browser.offline");
      d.metric("analysis.ms", 20);
      d.flush();
    });
    const queued = () =>
      page.evaluate(
        async () =>
          new Promise((resolve) => {
            const r = indexedDB.open("soundglow-sentry-offline");
            // A probe must never create an empty database ahead of the SDK's
            // first failed send; otherwise its lazy store sees no queue store.
            r.onupgradeneeded = () => r.transaction.abort();
            r.onerror = () => resolve(0);
            r.onsuccess = () => {
              const db = r.result;
              if (!db.objectStoreNames.contains("queue")) {
                db.close();
                return resolve(0);
              }
              const tx = db.transaction("queue"),
                q = tx.objectStore("queue").count();
              q.onsuccess = () => resolve(q.result);
              tx.oncomplete = () => db.close();
            };
          }),
      );
    for (let i = 0; i < 50 && (await queued()) < 3; i++)
      await page.waitForTimeout(100);
    assert(
      (await queued()) >= 3,
      "Errors, metrics and logs persist offline: " +
        JSON.stringify({
          queued: await queued(),
          failed: failed.map((body) => body?.split("\n")[1]),
        }),
    );
    assert((await queued()) <= 30);
    assert(
      await page.evaluate(
        async () =>
          new Promise((resolve) => {
            const request = indexedDB.open("soundglow-sentry-offline");
            request.onsuccess = () => {
              const db = request.result,
                tx = db.transaction("queue"),
                all = tx.objectStore("queue").getAll();
              all.onsuccess = () =>
                resolve(!/PRIVATE|SECRET/.test(JSON.stringify(all.result)));
              tx.oncomplete = () => db.close();
            };
          }),
      ),
      "Offline persistence must also exclude inherited private attributes",
    );
    fail = false;
    for (let i = 0; i < 150 && (await queued()) > 0; i++)
      await page.waitForTimeout(100);
    assert.equal(await queued(), 0, "Offline retry drains successfully");
    await page
      .getByRole("checkbox", {
        name: "Share diagnostic information",
        exact: true,
      })
      .uncheck();
    await page.waitForFunction(() => !d.getState().automatic);
    await page.waitForTimeout(300);
    const afterOptOut = payloads.length;
    await page.evaluate(() => {
      d.capture(Error("PRIVATE"), "after.opt_out");
      d.metric("after.ms", 999);
      d.flush();
      window.dispatchEvent(new Event("online"));
    });
    await page.waitForTimeout(300);
    assert.equal(payloads.length, afterOptOut, "No uploads after opt-out");
    await page
      .getByRole("checkbox", {
        name: "Share diagnostic information",
        exact: true,
      })
      .check();
    await page.waitForFunction(() => d.getState().status === "connected");
    assert(!payloads.join("").includes("after.opt_out"));
    await page.evaluate(async () => {
      window.other = BrowserDiagnostics.create({
        app: "dorego",
        release: "test-2",
        dsn: "https://public@telemetry.invalid/2",
        sdkUrl: "/sentry.js",
      });
      await other.ready;
      await other.setSharing(true);
      other.capture(Error("PRIVATE"), "audio.second_app");
      await other.dispose();
      d.capture(Error("PRIVATE"), "audio.first_app");
      await d.dispose();
    });
    await page.waitForTimeout(300);
    assert(
      items().some(
        (i) => i.type === "event" && i.payload.release === "dorego@test-2",
      ),
    );
    assert(
      items().some(
        (i) =>
          i.type === "event" &&
          i.payload.exception.values[0].value === "audio.first_app" &&
          i.payload.release === "soundglow@test-1",
      ),
      "Isolated clients do not steal app events",
    );
    await page.reload();
    await page.addScriptTag({ url: "/core.js" });
    const saved = await page.evaluate(async () => {
      const d = BrowserDiagnostics.create({
        app: "soundglow",
        release: "test-2",
      });
      await d.ready;
      const r = await d.report();
      await d.dispose();
      return r.previousReports;
    });
    assert.equal(saved.length, 0);
    assert(!JSON.stringify(saved).includes("PRIVATE"));
    const broken = await context.newPage();
    await broken.addInitScript(() =>
      Object.defineProperty(window, "indexedDB", {
        value: {
          open() {
            return {};
          },
        },
      }),
    );
    await broken.goto(`http://127.0.0.1:${server.address().port}/`);
    await broken.addScriptTag({ url: "/core.js" });
    await broken.evaluate(async () => {
      window.local = BrowserDiagnostics.create({
        app: "fault",
        release: "test",
        storageTimeoutMs: 25,
      });
      local.capture(Error("PRIVATE"), "audio.storage_fault");
      await local.ready;
      BrowserDiagnostics.attachPanel(local, document.body);
    });
    const sharing = broken.getByRole("checkbox", {
      name: "Share diagnostic information",
      exact: true,
    });
    assert.equal(await broken.locator("button").count(), 0);
    assert.equal(await sharing.isChecked(), false);
    await sharing.check();
    assert.equal(await broken.evaluate(() => local.getState().sharing), true);
    await sharing.uncheck();
    assert.equal(await broken.evaluate(() => local.getState().sharing), false);
    fail = true;
    await broken.evaluate(async () => {
      window.memory = BrowserDiagnostics.create({
        app: "memory",
        release: "test",
        dsn: "https://public@telemetry.invalid/4",
        sdkUrl: "/sentry.js",
        storageTimeoutMs: 25,
      });
      await memory.ready;
      await memory.setSharing(true);
      memory.capture(Error("PRIVATE"), "audio.memory_only");
      memory.flush();
    });
    // Allow the deliberately blocked SDK database to reach its 1.5s deadline.
    await broken.waitForTimeout(2000);
    fail = false;
    await broken.evaluate(() => dispatchEvent(new Event("online")));
    const recovered = () =>
      items().some(
        (item) =>
          item.type === "event" &&
          item.payload.exception.values[0].value === "audio.memory_only",
      );
    const recoveryDeadline = Date.now() + 5000;
    while (!recovered() && Date.now() < recoveryDeadline)
      await broken.waitForTimeout(50);
    assert(
      recovered(),
      "Blocked SDK storage must fall back to bounded memory and retry",
    );
    await broken.evaluate(() => memory.dispose());
    await broken.close();
    console.log(
      "Opt-in diagnostics: isolated SDK, error/log/metric envelopes, privacy, TTL, offline retry and consent controls passed:",
      process.env.TEST_BROWSER || "chromium",
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
