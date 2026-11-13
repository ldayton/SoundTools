import { selectPractice } from "./navigation-helpers";
import { chromium, firefox, webkit } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
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
let root = rootA,
  networkDown = false,
  slowNavigation = false,
  breakAssets = false,
  failInstall = false;
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
      /^\/(piano|guitar|rhythm|theory)(\/[a-z0-9-]+)*\/?$/.test(url.pathname)
        ? "index.html"
        : url.pathname.slice(1);
  if (path === "sw.js" && failInstall) {
    breakAssets = true;
    failInstall = false;
  }
  if (networkDown) {
    req.socket.destroy();
    return;
  }
  if (breakAssets && path.startsWith("assets/")) {
    res.writeHead(503);
    res.end("Unavailable");
    return;
  }
  if (slowNavigation && path === "index.html")
    await new Promise((r) => setTimeout(r, 5000));
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
const browser = await type.launch({
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
try {
  const context = await browser.newContext();
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
  // Verified update is staged while a session is active, never replacing the question.
  root = rootB;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page
    .getByRole("img", { name: "Update available", exact: true })
    .waitFor({ timeout: 20000 });
  assert.equal(
    await page.locator('meta[name="notecards-shell"]').getAttribute("content"),
    packA.shellCache,
  );
  assert.equal(await page.locator("#counter").textContent(), "2 / 12");
  console.log("active update staged");
  await untouched.evaluate(() => window.dispatchEvent(new Event("online")));
  await untouched.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="notecards-shell"]')
        ?.getAttribute("content") === v,
    packB.shellCache,
    { timeout: 20000 },
  );
  await untouched.close();
  // A new untouched page opens the latest verified generation.
  const fresh = await context.newPage();
  await fresh.goto(base);
  await fresh.locator("#persistence-notice").waitFor();
  await fresh.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="notecards-shell"]')
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
  // A complete cached copy starts without waiting for a hung network navigation.
  networkDown = false;
  await context.setOffline(false);
  slowNavigation = true;
  const start = Date.now();
  await fresh.goto(base);
  await fresh.locator('[data-letter="E"]:enabled').waitFor();
  assert.ok(
    Date.now() - start < 4500,
    "Cached startup must beat a 5-second network stall",
  );
  slowNavigation = false;
  console.log("offline practice and fast startup ready");
  // A never-visited deep URL uses the same verified offline shell and honours its settings.
  await context.setOffline(true);
  networkDown = true;
  await fresh.goto(base + "piano/keys?key=G&low=C4&high=B5&clef=grand");
  await fresh.locator("main:not([inert]) #notation svg").waitFor();
  assert.equal(await fresh.locator("#key").inputValue(), "G");
  assert.equal(await fresh.locator("#staffLayout").inputValue(), "grand");
  await fresh.goto(
    base + "piano/hymns/amazing-grace?arrangement=bass&bars=2&section=2",
  );
  await fresh.locator(".hymn-paper svg").first().waitFor({ state: "attached" });
  assert.equal(await fresh.locator("#hymn-arrangement").inputValue(), "bass");
  assert.equal(
    await fresh.locator("#hymn-section").count(),
    0,
    "legacy section links open the complete hymn without the retired section selector",
  );
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
    await fresh.locator('meta[name="notecards-shell"]').getAttribute("content"),
    packA.shellCache,
  );
  console.log("corruption fallback ready");
  // Reconnect repairs the corrupt copy, then applies only on the user's update action.
  await fresh.locator('[data-letter="E"]').click();
  networkDown = false;
  await context.setOffline(false);
  await fresh.evaluate(() => window.dispatchEvent(new Event("online")));
  await fresh
    .getByRole("img", { name: "Update available", exact: true })
    .waitFor({ timeout: 20000 });
  await fresh.locator("a[data-settings]").click();
  await fresh.locator("#offline-update").click();
  await fresh.waitForFunction(
    (v) =>
      document
        .querySelector('meta[name="notecards-shell"]')
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
      if (name.startsWith("notecards-shell-")) await caches.delete(name);
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
  const partialContext = await browser.newContext();
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
  console.log(
    "failed install detected",
    await partial.locator("#offline-status").textContent(),
  );
  breakAssets = false;
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
  await mkdir("work", { recursive: true });
  await partial.screenshot({
    path: `work/offline-${name}.png`,
    fullPage: true,
  });
  await partialContext.close();
  const blockedContext = await browser.newContext();
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
    `PASS ${name}: verified install, automatic latest startup, active-session update protection, old tabs, offline practice, fast cached startup, corruption fallback/repair, eviction, failed install/retry, blocked offline access.`,
  );
} finally {
  await browser.close();
  await rm(fixed, { recursive: true, force: true }).catch((error) => {
    if (!["EACCES", "EPERM"].includes(error.code)) throw error;
  });
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
}
