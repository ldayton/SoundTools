import { captureFailure, closeBrowser, launchBrowser, createOfflineContext as createContext } from '../../../scripts/ci/browser-harness.cjs';
import { selectPractice } from "../../../packages/music-practice/browser-tests/helpers";
import { chromium, firefox, webkit } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
async function showUpdate(page: import("playwright").Page) {
  await page.getByRole('button', {name:'Complete update',exact:true}).waitFor({state:'visible',timeout:20000});
}
const name = process.env.TEST_BROWSER || "chromium";
const type = { chromium, firefox, webkit }[name];
if (!type) throw Error("Unknown browser");
const rootA = resolve(`work/offline-release-a-${name}`),
  rootB = resolve(`work/offline-release-b-${name}`);
await cp(resolve("dist"), rootA, { recursive: true, force: true });
const built = spawnSync(
  process.execPath,
  [
    "../../node_modules/vite/bin/vite.js",
    "build",
    "--minify",
    "false",
    "--outDir",
    rootB,
  ],
  { encoding: "utf8" },
);
assert.equal(built.status, 0, built.stderr);
const packA = JSON.parse(await readFile(rootA + "/offline-pack.json", "utf8"));
const packB = JSON.parse(await readFile(rootB + "/offline-pack.json", "utf8"));
assert.notEqual(packA.shellCache, packB.shellCache);
// Fail a required offline resource without breaking the foreground JS/CSS.
const failedInstallURL = packA.files.find((file: { url: string }) =>
  file.url.endsWith('/manifest.webmanifest')
)?.url;
assert(failedInstallURL, 'The incomplete-install fixture requires the shell manifest');
let root = rootA,
  networkDown = false,
  breakAssets = false,
  failInstall = false,
  failInstallAsset = false,
  failedInstallFetches = 0;
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/vnd.microsoft.icon",
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, "http://localhost"),
    path =
      url.pathname === "/" ||
      url.pathname === "/settings" ||
      /^\/(piano|guitar|theory)(\/[a-z0-9-]+)*\/?$/.test(url.pathname)
        ? "index.html"
        : url.pathname.slice(1);
  if (path === "sw.js" && failInstall) {
    failInstallAsset = true;
    failInstall = false;
  }
  if (networkDown) {
    req.socket.destroy();
    return;
  }
  const installFailure = failInstallAsset && url.pathname === failedInstallURL;
  if (installFailure) failedInstallFetches++;
  if (installFailure || (breakAssets && path.startsWith("assets/"))) {
    res.writeHead(503);
    res.end("Unavailable");
    return;
  }
  try {
    const bytes = await readFile(resolve(root, path));
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
const fixed = await mkdtemp(join(tmpdir(), "notecards-offline-"));
const browser = await launchBrowser({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
try {
  const context = await createContext(browser);
  await context.addInitScript(() => localStorage.setItem('notewise:diagnostics:sharing', 'yes'));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('[data-letter="E"]:enabled').waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
    {},
    { timeout: 20000 },
  );
  // A reconnect during an existing check must schedule a follow-up, not be dropped.
  await page.evaluate(() => {
    const post = ServiceWorker.prototype.postMessage;
    let injected = false;
    (window as any).offlineRechecks = 0;
    (window as any).restoreWorkerPost = () => {
      ServiceWorker.prototype.postMessage = post;
    };
    ServiceWorker.prototype.postMessage = function (
      message: any,
      ...rest: any[]
    ) {
      if (message?.type === "prepare-update") {
        (window as any).offlineRechecks++;
        if (!injected) {
          injected = true;
          window.dispatchEvent(new Event("online"));
        }
      }
      return Reflect.apply(post, this, [message, ...rest]);
    };
    window.dispatchEvent(new Event("online"));
  });
  await page.waitForFunction(() => (window as any).offlineRechecks >= 2);
  await page.evaluate(() => (window as any).restoreWorkerPost());
  console.log("initial save ready");
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.locator('[data-letter="E"]').click();
  await page.waitForFunction(
    () => document.querySelector("#counter")?.textContent === "2 / 12",
  );
  const untouched = await context.newPage();
  await untouched.goto(base);
  await untouched.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  // "Available offline" proves the saved copy, not completion of the network
  // update check. Both tabs share the worker's in-flight latest() operation.
  // Finish the release-A checks before switching the server to release B;
  // otherwise the reconnect can join an old operation and return A legitimately.
  for (const tab of [page, untouched]) {
    await tab.waitForFunction(() => {
      const events = window.practiceDiagnostics?.snapshot().events as
        { code: string }[] | undefined;
      return events?.filter(event => event.code.startsWith('cache.update.')).at(-1)?.code
        === 'cache.update.ready';
    }, undefined, { timeout: 20000 });
  }
  // Verified update is staged while a session is active, never replacing the question.
  assert.equal(
    await page
      .getByRole("button", { name: "Complete update", exact: true })
      .count(),
    0,
  );
  const toolbarBounds = () =>
    page.locator(".application-toolbar").boundingBox();
  const beforeUpdate = await toolbarBounds();
  root = rootB;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page
    .locator("#offline-update")
    .waitFor({ state: "attached", timeout: 20000 });
  assert.deepEqual(
    await toolbarBounds(),
    beforeUpdate,
    "Staging an update preserves toolbar geometry",
  );
  for (const width of [320, 390, 1680, 320, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await showUpdate(page);
    assert.equal(await page.locator("header #offline-update").count(), 1);
    const update = await page.locator('#offline-update').boundingBox();
    assert.ok(update && Math.abs(update.x + update.width / 2 - width / 2) <= 1, 'Update toolbar centers the action at every width');
    assert.equal(await page.locator('.application-update-bar #offline-update').count(), 1);
    assert.ok(
      await page
        .getByRole("button", { name: "Complete update", exact: true })
        .isVisible(),
    );
  }
  await page.screenshot({ path: "work/complete-update-desktop.png" });
  assert.equal(
    await page.locator('meta[name="practice-shell"]').getAttribute("content"),
    packA.shellCache,
  );
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  console.log("active update staged");
  // A verified update can reload this untouched tab before evaluate's reply arrives.
  // Accept only that expected navigation race; the new generation is verified below.
  await untouched
    .evaluate(() => window.dispatchEvent(new Event("online")))
    .catch((error: Error) => {
      if (!error.message.includes("Execution context was destroyed"))
        throw error;
    });
  await untouched.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="practice-shell"]')
        ?.getAttribute("content") === v,
    packB.shellCache,
    { timeout: 20000 },
  );
  await untouched.close();
  // A new untouched page opens the latest verified generation.
  const fresh = await context.newPage();
  await fresh.goto(base);
  // Concurrent practice windows are supported. The new generation must open
  // writable with the saved checkpoint while the active old generation survives.
  await fresh.locator('[data-letter="E"]:enabled').waitFor();
  assert.equal(await fresh.locator("#persistence-notice").isVisible(), false);
  assert.equal(await fresh.locator("#counter").textContent(), "2 / 12");
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  await fresh.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="practice-shell"]')
        ?.getAttribute("content") === v,
    packB.shellCache,
  );
  // The old tab retains its exact assets after worker replacement and update staging.
  for (const file of packA.files.filter((f: { url: string }) =>
    f.url.startsWith("/assets/"),
  )) {
    assert.equal(
      await page.evaluate(async (u) => (await fetch(u)).status, file.url),
      200,
    );
  }
  console.log("new page latest ready");
  await page.close();
  // No connection: reload, notation fonts, grading, options, and progress all work.
  await context.setOffline(true);
  networkDown = true;
  await fresh.reload();
  await fresh.locator('[data-letter="E"]:enabled').waitFor();
  await fresh.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  assert.equal(await fresh.locator("#notation svg").count(), 1);
  await selectPractice(fresh, "find");
  await fresh.locator('[data-fret="0"]').click();
  await fresh.waitForFunction(
    () => document.querySelector("#counter")?.textContent === "2 / 12",
  );
  await selectPractice(fresh, "staff");
  await fresh.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  // Real startup latency is owned by the CPU-isolated offline-startup witness.
  // A never-visited deep URL uses the same verified offline shell and honours its settings.
  await context.setOffline(true);
  networkDown = true;
  await fresh.goto(base + "piano/keys?key=G&low=C4&high=B5&clef=grand");
  await fresh.locator("main:not([inert]) #notation svg").waitFor();
  assert.equal(await fresh.locator("#key").inputValue(), "G");
  assert.equal(await fresh.locator("#staffLayout").inputValue(), "grand");
  await selectPractice(fresh, "staff");
  await fresh.goto(base + "settings");
  await fresh.locator(".settings-page").waitFor();
  await fresh.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  await selectPractice(fresh, "staff");
  await fresh.goto(base + "theory/scales?task=build-scale");
  await fresh
    .locator('#scales-practice [data-piano="60"][aria-disabled="false"]')
    .click();
  assert.equal(
    await fresh.locator("#scales-practice .theory-steps .is-done").count(),
    1,
    "scale building works on a never-visited offline route",
  );
  await fresh.goto(base + "theory/intervals");
  await fresh
    .locator("#intervals-practice .theory-answers button")
    .first()
    .waitFor();
  assert.equal(
    await fresh.locator("#intervals-practice .theory-answers button").count(),
    2,
  );
  await selectPractice(fresh, "staff");
  console.log("unvisited offline deep links ready");
  // Corrupt newest copy: offline navigation falls back to a verified older generation.
  await fresh.evaluate(
    async ({ version, url }) => {
      await (
        await caches.open(version)
      ).put(
        url,
        new Response("broken", {
          headers: { "Content-Type": "text/javascript" },
        }),
      );
    },
    {
      version: packB.shellCache,
      url: packB.files.find((f: { url: string }) => f.url.endsWith(".js")).url,
    },
  );
  await context.setOffline(true);
  networkDown = true;
  await fresh.goto(base);
  await fresh.locator('[data-letter="E"]:enabled').waitFor();
  assert.equal(
    await fresh.locator('meta[name="practice-shell"]').getAttribute("content"),
    packA.shellCache,
  );
  console.log("corruption fallback ready");
  // Reconnect repairs the corrupt copy, then applies only on the user's update action.
  await fresh.locator('[data-letter="E"]').click();
  networkDown = false;
  await context.setOffline(false);
  await fresh.evaluate(() => window.dispatchEvent(new Event("online")));
  await showUpdate(fresh);
  await fresh.locator("#offline-update").click();
  await fresh.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="practice-shell"]')
        ?.getAttribute("content") === v,
    packB.shellCache,
  );
  await fresh.waitForFunction(
    () =>
      document.querySelector("#offline-status")?.textContent ===
      "Available offline",
  );
  await selectPractice(fresh, "staff");
  // Verification can finish before or after feedback advances; both checkpoints are valid.
  await fresh
    .locator('#feedback-next:visible, [data-letter="E"]:enabled')
    .first()
    .waitFor();
  if (await fresh.locator("#feedback-next").isVisible())
    await fresh.locator("#feedback-next").click();
  await fresh.locator('[data-letter="E"]:enabled').waitFor();
  console.log("repair ready");
  // Storage eviction leaves a useful offline explanation, not a blank app.
  await context.setOffline(true);
  networkDown = true;
  await fresh.evaluate(async () => {
    for (const name of await caches.keys())
      if (name.startsWith("notewise-shell-")) await caches.delete(name);
  });
  await fresh.goto(base);
  await fresh
    .getByRole("heading", { name: "No offline copy available" })
    .waitFor();
  assert.ok(await fresh.getByRole("button", { name: "Try again" }).isVisible());
  assert.deepEqual(errors, []);
  networkDown = false;
  await context.setOffline(false);
  await context.close();
  // A failed/incomplete first installation cannot advertise offline readiness.
  networkDown = false;
  root = rootA;
  breakAssets = false;
  const partialContext = await createContext(browser);
  await partialContext.setOffline(false);
  const partial = await partialContext.newPage();
  failInstall = true;
  await partial.goto(base);
  await partial.locator('[data-letter="E"]:enabled').waitFor();
  await partial.waitForFunction(
    () =>
      document.querySelector("#offline-retry")?.hasAttribute("hidden") ===
      false,
    {},
    { timeout: 25000 },
  );
  assert.notEqual(
    await partial.locator("#offline-status").textContent(),
    "Available offline",
  );
  assert(failedInstallFetches > 0, 'The intended required resource must actually fail installation');
  assert.equal(await partial.evaluate(async ({ cache, url }) => {
    if (!(await caches.has(cache))) return false;
    return !!(await (await caches.open(cache)).match(url));
  }, { cache: packA.shellCache, url: failedInstallURL }), false, 'The failed resource must not be cached');
  console.log(
    "failed install detected",
    await partial.locator("#offline-status").textContent(),
  );
  breakAssets = false;
  failInstallAsset = false;
  await partial.locator("a[data-settings]").click();
  await partial.locator("#offline-retry").click();
  try {
    await partial.waitForFunction(
      () =>
        document.querySelector("#offline-status")?.textContent ===
        "Available offline",
      {},
      { timeout: 25000 },
    );
  } catch (error) {
    console.log(
      "retry failed",
      await partial.evaluate(async () => ({
        status: document.querySelector("#offline-status")?.textContent,
        controller: navigator.serviceWorker.controller?.state,
        registrations: (await navigator.serviceWorker.getRegistrations()).map(
          (r) => ({
            active: r.active?.state,
            waiting: r.waiting?.state,
            installing: r.installing?.state,
          }),
        ),
        caches: await caches.keys(),
      })),
    );
    throw error;
  }
  assert.equal(await partial.evaluate(async ({ cache, url }) => {
    if (!(await caches.has(cache))) return false;
    return !!(await (await caches.open(cache)).match(url));
  }, { cache: packA.shellCache, url: failedInstallURL }), true, 'Retry must cache the previously failed resource');
  await mkdir("work", { recursive: true });
  await partial.screenshot({
    path: `work/offline-${name}.png`,
    fullPage: true,
  });
  await partialContext.close();
  const blockedContext = await createContext(browser);
  await blockedContext.addInitScript(() =>
    Object.defineProperty(navigator, "serviceWorker", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  const blocked = await blockedContext.newPage();
  await blocked.goto(base);
  await blocked.locator('[data-letter="E"]:enabled').waitFor();
  assert.match(
    (await blocked.locator("#offline-status").textContent())!,
    /Practice still works/,
  );
  await blockedContext.close();
  console.log(
    `PASS ${name}: verified install, automatic latest startup, active-session update protection, old tabs, offline practice, corruption fallback/repair, eviction, failed install/retry, blocked offline access.`,
  );
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error('Offline failure state:', await page.evaluate(() => ({
      visibility: document.visibilityState,
      status: document.querySelector('#offline-status')?.textContent,
      events: (window.practiceDiagnostics?.snapshot().events as { code: string }[] | undefined)
        ?.filter(event => event.code.startsWith('cache.')).slice(-20),
    })).catch(() => 'Page no longer available'));
  }
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await rm(fixed, { recursive: true, force: true }).catch((error) => {
    if (!["EACCES", "EPERM"].includes(error.code)) throw error;
  });
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
