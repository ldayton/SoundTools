import { captureFailure, closeBrowser, launchBrowser, createContext } from '../scripts/ci/browser-harness.cjs';
import { chromium, firefox, webkit, expect } from "@playwright/test";
import {
  account as openAccount,
  login,
  closeModal,
} from "./account-helpers.mts";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
const { env } = JSON.parse(
  await readFile("work/account-local-status.json", "utf8"),
);
assert.equal(new URL(env.API_URL).hostname, "127.0.0.1");
const admin = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await admin.storage.emptyBucket("soundtools-files");
for (const query of [
  "delete from public.media_files",
  "delete from public.account_apps where app='soundglow'",
  "delete from private.account_operations where app='soundglow'",
])
  execFileSync("supabase", ["db", "query", query, "--yes"], {
    stdio: "ignore",
  });
const engine = process.env.TEST_BROWSER || "chromium";
const fixed = await mkdtemp(join(tmpdir(), "soundtools-files-"));
const browser = await launchBrowser({
  args: engine === "chromium" ? ["--mute-audio"] : [],
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
const base = "http://127.0.0.1:4394/dist/index.html#settings";
const audio = await readFile("apps/soundglow/dist/audio/alice-waters.m4a");
const contexts = [];
try {
  const first = await createContext(browser, {
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: "block",
  });
  contexts.push(first);
  const second = await createContext(browser, {
    viewport: { width: 1680, height: 1050 },
    serviceWorkers: "block",
  });
  contexts.push(second);
  const a = await first.newPage(),
    b = await second.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) {
    await p.exposeFunction("__fileError", (message: string) =>
      errors.push(message),
    );
    await p.addInitScript(() => {
      window.addEventListener("error", (e) => {
        if (e.message)
          void (window as any).__fileError(e.message).catch(() => {});
      });
      window.addEventListener(
        "unhandledrejection",
        (e) =>
          void (window as any)
            .__fileError(String(e.reason?.message || e.reason))
            .catch(() => {}),
      );
    });
  }
  await a.goto(base);
  await login(a);
  await a.locator("#audioFileInput").setInputFiles({
    name: "Cloud practice.m4a",
    mimeType: "audio/mp4",
    buffer: audio,
  });
  await a.waitForFunction(() =>
    (window as any).SoundglowFiles.rows.some((f: any) => f.state === "ready"),
  );
  await expect(a.locator("[data-file]")).toHaveCount(1);
  await expect(a.locator("[data-file]")).toContainText("Synced");
  await a.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading;
  });
  await a.evaluate(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    l.loop = { start: 1, end: 2 };
    l.setView(0, 5);
    l.draw();
  });
  await a.locator("#bookmarkSelection").click();
  await a.locator("#bookmarkName").fill("Cloud verse");
  await a.locator("#saveBookmark").click();
  await a.evaluate(() => (window as any).SoundglowAccount.flush());
  await b.goto(base);
  await login(b);
  await expect(b.locator("[data-file]")).toHaveCount(1);
  await expect(b.locator("[data-file]")).toContainText("In cloud");
  assert.equal(
    await b.evaluate(
      async () =>
        (await (window as any).soundglowSession.accountLibrary().store.list())
          .length,
    ),
    0,
    "catalogue does not silently download all audio",
  );
  await expect(b.locator("[data-bookmark]")).toHaveCount(1);
  const signedObjects = env.API_URL + "/storage/v1/object/sign/**";
  await b.route(signedObjects, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "damaged bytes",
        })
      : route.continue(),
  );
  await b.locator("[data-bookmark]").click();
  await expect(
    b.getByRole("status").filter({ hasText: "did not match the original" }),
  ).toBeVisible();
  assert.equal(
    await b.evaluate(
      async () =>
        (await (window as any).soundglowSession.accountLibrary().store.list())
          .length,
    ),
    0,
    "corrupt download is never saved",
  );
  await b.unroute(signedObjects);
  await b.locator("[data-bookmark]").click();
  await b.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading && l.loopEnabled && l.loop?.start === 1;
  });
  await expect(b.locator("[data-file]")).toContainText("Downloaded");
  await b.screenshot({ path: `work/cloud-files-${engine}-desktop.png` });
  console.log(
    engine +
      ": automatic private upload, cloud catalogue and bookmark download passed",
  );

  const retryTab = await second.newPage();
  await retryTab.goto(base);
  await retryTab.waitForFunction(() =>
    (window as any).SoundglowFiles.rows.some((f: any) => f.state === "ready"),
  );
  let downloadReady!: () => void, releaseDownload!: () => void;
  const downloadSeen = new Promise<void>(
      (resolve) => (downloadReady = resolve),
    ),
    downloadGate = new Promise<void>((resolve) => (releaseDownload = resolve));
  await retryTab.route(signedObjects, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    downloadReady();
    await downloadGate;
    await route.fulfill({ response }).catch(() => {});
  });
  await retryTab.evaluate(() => {
    const cloud = (window as any).SoundglowFiles;
    (window as any).pendingDownload = cloud
      .download(cloud.rows.find((f: any) => f.state === "ready").id)
      .catch(() => {});
  });
  await downloadSeen;
  await b.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    await l.removeDownload(l.files[0].id);
  });
  releaseDownload();
  await retryTab.unroute(signedObjects);
  await retryTab.evaluate(() => (window as any).pendingDownload);
  await b.evaluate(() => (window as any).SoundglowFiles.retry());
  await expect(b.locator("[data-file]")).toContainText("In cloud");
  assert.equal(
    await b.evaluate(
      async () =>
        (await (window as any).soundglowSession.accountLibrary().store.list())
          .length,
    ),
    0,
    "late download cannot undo Remove download",
  );
  await retryTab.close();
  await b.locator("[data-file]").click();
  await b.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading;
  });
  console.log(
    engine +
      ": removing a download cancels another tab's durable retry and late completion",
  );
  await b.route(env.API_URL + "/**", (route) => route.abort());
  await b.reload();
  await b.locator("[data-file]").waitFor();
  await b.locator("[data-file]").click();
  await b.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading;
  });
  await expect(b.locator("[data-file]")).toContainText("Downloaded");
  await b.unroute(env.API_URL + "/**");
  const id = await b.evaluate(
    () => (window as any).soundglowSession.accountLibrary().files[0].cloudId,
  );
  await b.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    await l.removeDownload(l.files[0].id);
  });
  await expect(b.locator("[data-file]")).toContainText("In cloud");
  assert.equal(
    await a.evaluate(() => (window as any).SoundglowFiles.rows[0].state),
    "ready",
    "remove download keeps the cloud recording",
  );
  await b.locator("[data-file]").click();
  await b.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading;
  });
  await b.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    await l.renameItem("file", l.files[0].id, "Renamed across computers");
  });
  await expect
    .poll(
      async () =>
        (await admin.from("media_files").select("name").eq("id", id)).data?.[0]
          ?.name,
    )
    .toBe("Renamed across computers");
  await a.evaluate(() => (window as any).SoundglowFiles.retry());
  await expect(a.locator("[data-file]")).toContainText(
    "Renamed across computers",
  );
  let releaseRename!: () => void, sawRename!: () => void;
  const renameSeen = new Promise<void>((resolve) => (sawRename = resolve)),
    renameGate = new Promise<void>((resolve) => (releaseRename = resolve));
  let firstRename = true;
  await b.route(env.API_URL + "/rest/v1/rpc/media_rename", async (route) => {
    if (!firstRename) {
      await route.continue();
      return;
    }
    firstRename = false;
    const response = await route.fetch();
    sawRename();
    await renameGate;
    await route.fulfill({ response });
  });
  await b.evaluate(() =>
    (window as any).SoundglowFiles.rename(
      (window as any).SoundglowFiles.rows.find((f: any) => f.state === "ready")
        .id,
      "First queued name",
    ),
  );
  await b.evaluate(() => {
    void (window as any).SoundglowFiles.retry();
  });
  await renameSeen;
  await b.evaluate(() =>
    (window as any).SoundglowFiles.rename(
      (window as any).SoundglowFiles.rows.find((f: any) => f.state === "ready")
        .id,
      "Newest queued name",
    ),
  );
  releaseRename();
  await expect
    .poll(
      async () =>
        (await admin.from("media_files").select("name").eq("id", id)).data?.[0]
          ?.name,
      { timeout: 15000 },
    )
    .toBe("Newest queued name");
  await b.unroute(env.API_URL + "/rest/v1/rpc/media_rename");
  console.log(
    engine +
      ": cached offline playback, remove-download and cross-device rename passed",
  );

  await b.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    await l.remove(l.files[0].id);
  });
  await b.evaluate(() => (window as any).SoundglowFiles.retry());
  await expect
    .poll(
      async () =>
        (await admin.from("media_files").select("state").eq("id", id)).data?.[0]
          ?.state,
    )
    .toBe("deleted");
  await a.evaluate(() => (window as any).SoundglowFiles.retry());
  await expect(a.locator("[data-file]")).toHaveCount(0);
  await expect(b.locator("[data-file]")).toHaveCount(0);
  // A completed tombstone no longer schedules repeated object deletions.
  await expect
    .poll(
      async () =>
        (
          await admin.storage
            .from("soundtools-files")
            .list(
              `${(await admin.from("media_files").select("user_id").eq("id", id)).data?.[0]?.user_id}/soundglow`,
            )
        ).data?.filter((f) => f.name === id).length,
    )
    .toBe(0);
  const files = await admin.from("media_files").select("state").eq("id", id);
  assert.equal(files.data?.[0].state, "deleted");
  const objects = await admin.storage.from("soundtools-files").list();
  assert.ifError(objects.error);
  // TUS must resume from the first completed 6 MiB chunk after a reload.
  const samples = 48000 * 2 * 40,
    pcm = Buffer.alloc(44 + samples * 2);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(pcm.length - 8, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(48000, 24);
  pcm.writeUInt32LE(192000, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(pcm.length - 44, 40);
  let interrupted = false,
    resumedOffset = 0;
  const patches = env.API_URL + "/storage/v1/upload/resumable/**";
  await a.route(patches, async (route) => {
    if (route.request().method() === "PATCH") {
      interrupted = true;
      await route.fulfill({ status: 503, body: "interrupted" });
    } else await route.continue();
  });
  await a.locator("#audioFileInput").setInputFiles({
    name: "Resume practice.wav",
    mimeType: "audio/wav",
    buffer: pcm,
  });
  await expect.poll(() => interrupted, { timeout: 30000 }).toBe(true);
  a.on("response", (response) => {
    if (
      response.request().method() === "HEAD" &&
      response.url().includes("/upload/resumable/")
    )
      resumedOffset = Number(response.headers()["upload-offset"]);
  });
  await openAccount(a);
  await a.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(a.locator("[data-file]")).toHaveCount(0);
  assert.equal(
    await a.evaluate(
      () => (window as any).soundglowSession.accountLibrary().current,
    ),
    null,
    "logout releases private file playback",
  );
  await a.reload();
  await login(a);
  await expect
    .poll(() => resumedOffset, { timeout: 30000 })
    .toBeGreaterThanOrEqual(6 * 1024 * 1024);
  await a.unroute(patches);
  await a.evaluate(() => (window as any).SoundglowFiles.retry());
  await a.waitForFunction(
    () =>
      (window as any).SoundglowFiles.rows.some(
        (f: any) => f.name === "Resume practice.wav" && f.state === "ready",
      ),
    {},
    { timeout: 45000 },
  );
  console.log(
    engine +
      ": interrupted upload resumed after reload from a confirmed 6 MiB checkpoint",
  );
  // Oversize originals remain useful locally without making a doomed upload.
  await a.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary(),
      id = crypto.randomUUID();
    await l.store.add(
      {
        id,
        name: "Large local recording.wav",
        type: "audio/wav",
        bytes: 52428801,
        duration: 1,
        position: 0,
        addedAt: Date.now(),
        owner: (window as any).SoundglowFiles.user,
        fingerprint: "sha256-tree-v1:" + "f".repeat(64),
      },
      new Blob(["local test original"]),
    );
    await (window as any).SoundglowFiles.imported(id);
    await l.refreshCloudFiles();
  });
  await expect(
    a.locator("[data-file]").filter({ hasText: "Large local recording" }),
  ).toContainText("over 50 MB");
  assert.equal(
    (
      await admin
        .from("media_files")
        .select("id")
        .eq("name", "Large local recording.wav")
    ).data?.length,
    0,
  );
  let reserved!: () => void, releaseReserve!: () => void;
  const reservationSeen = new Promise<void>((resolve) => (reserved = resolve)),
    reservationGate = new Promise<void>(
      (resolve) => (releaseReserve = resolve),
    );
  await a.route(env.API_URL + "/rest/v1/rpc/media_reserve", async (route) => {
    const response = await route.fetch();
    reserved();
    await reservationGate;
    await route.fulfill({ response });
  });
  await a.locator("#audioFileInput").setInputFiles({
    name: "Deleted during reservation.m4a",
    mimeType: "audio/mp4",
    buffer: audio,
  });
  await reservationSeen;
  await a.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary();
    await l.remove(
      l.files.find((f: any) => f.name === "Deleted during reservation.m4a").id,
    );
  });
  releaseReserve();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("media_files")
            .select("state")
            .eq("name", "Deleted during reservation.m4a")
        ).data?.[0]?.state,
      { timeout: 15000 },
    )
    .toBe("deleted");
  await a.unroute(env.API_URL + "/rest/v1/rpc/media_reserve");
  console.log(
    engine + ": removing an import during reservation leaves no phantom upload",
  );
  const importingUser = await a.evaluate(
    () => (window as any).SoundglowFiles.user,
  );
  await a.evaluate(() => {
    const l = (window as any).soundglowSession.accountLibrary(),
      metadata = l.metadata.bind(l);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    (window as any).releaseImport = release;
    l.metadata = async (blob: Blob) => {
      const duration = await metadata(blob);
      (window as any).importHeld = true;
      await gate;
      return duration;
    };
  });
  await a.locator("#audioFileInput").setInputFiles({
    name: "Private late import.m4a",
    mimeType: "audio/mp4",
    buffer: audio,
  });
  await a.waitForFunction(() => (window as any).importHeld);
  await openAccount(a);
  await a.getByRole("button", { name: "Sign out", exact: true }).click();
  await a.waitForFunction(() => !(window as any).SoundglowFiles.user);
  await a.evaluate(() => (window as any).releaseImport());
  await a.waitForFunction(
    () => !(window as any).soundglowSession.accountLibrary().importing,
  );
  await expect(a.locator("[data-file]")).toHaveCount(0);
  assert.equal(
    await a.evaluate(async () => {
      const l = (window as any).soundglowSession.accountLibrary();
      return (await l.store.list()).find(
        (f: any) => f.name === "Private late import.m4a",
      )?.owner;
    }),
    importingUser,
    "import ownership is fixed before asynchronous audio inspection",
  );
  assert.equal(
    await a.evaluate(
      () => (window as any).soundglowSession.accountLibrary().current,
    ),
    null,
  );
  await a.reload();
  await login(a);
  await a.waitForFunction(() =>
    (window as any).SoundglowFiles.rows.some(
      (f: any) => f.name === "Private late import.m4a" && f.state === "ready",
    ),
  );
  const selected = await a.evaluate(async () => {
    const l = (window as any).soundglowSession.accountLibrary(),
      file = l.files.find((f: any) => f.name === "Private late import.m4a");
    await l.select(file.id);
    l.position = 2;
    l.savePosition(true);
    await l.pendingSave;
    return file.id;
  });
  await a.reload();
  await expect
    .poll(() =>
      a.evaluate(() => {
        const l = (window as any).soundglowSession?.accountLibrary();
        return l && !l.loading ? l.current?.id : null;
      }),
    )
    .toBe(selected);
  await expect(a.locator("#welcome")).not.toBeVisible();
  assert.equal(
    Math.floor(
      await a.evaluate(
        () => (window as any).soundglowSession.accountLibrary().position,
      ),
    ),
    2,
  );
  console.log(
    engine +
      ": imports finishing after logout stay private; selected account files restore paused after reload",
  );
  const blocked = await first.newPage();
  await blocked.exposeFunction("__fileError", (message: string) =>
    errors.push(message),
  );
  await blocked.addInitScript(() => {
    window.addEventListener("error", (event) => {
      if (event.message)
        void (window as any).__fileError(event.message).catch(() => {});
    });
    window.addEventListener(
      "unhandledrejection",
      (event) =>
        void (window as any)
          .__fileError(String(event.reason?.message || event.reason))
          .catch(() => {}),
    );
  });
  await blocked.addInitScript({
    content: `(() => {
    const prototype = Object.getPrototypeOf(indexedDB), open = prototype.open;
    Object.defineProperty(prototype, "open", { configurable: true, writable: true,
      value: function(name, version) {
        if (name === "soundtools-file-transfers") throw new DOMException("Queue storage blocked", "SecurityError");
        return version === undefined ? open.call(this, name) : open.call(this, name, version);
      }
    });
  })();`,
  });
  await blocked.goto(base);
  assert(
    await blocked.evaluate(() => {
      try {
        indexedDB.open("soundtools-file-transfers");
        return false;
      } catch {
        return true;
      }
    }),
    "test must block the native queue open in every engine",
  );
  await expect(
    blocked.locator("[data-file]").filter({ hasText: "Private late import" }),
  ).toContainText("Sync unavailable");
  await blocked
    .locator("[data-file]")
    .filter({ hasText: "Private late import" })
    .click();
  await blocked.waitForFunction(() => {
    const l = (window as any).soundglowSession.accountLibrary();
    return l.current && !l.loading;
  });
  await openAccount(blocked);
  await blocked.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(blocked.locator("[data-file]")).toHaveCount(0);
  assert.equal(
    await blocked.evaluate(
      () => (window as any).soundglowSession.accountLibrary().current,
    ),
    null,
  );
  console.log(
    engine +
      ": blocked sync storage preserves local playback and cannot bypass logout isolation",
  );
  await openAccount(b);
  await b.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(b.locator("[data-file]")).toHaveCount(0);
  // A failed worker import is returned to its caller, not also thrown globally.
  await b.route("**/__test_worker_load.js", route => route.fulfill({
    contentType: "text/javascript",
    body: "importScripts('/__test_missing_processor.js')",
  }));
  await b.route("**/__test_missing_processor.js", route => route.fulfill({ status: 503, body: "Unavailable" }));
  const workerFailure = await b.evaluate(async () => {
    const client = new (window as any).PraatClient({ workerURL: "/__test_worker_load.js" });
    try { await client.init(); return "unexpected success"; }
    catch (error) { return (error as { code: string }).code; }
    finally { client.dispose(); }
  });
  assert.equal(workerFailure, "WORKER_ERROR");
  await b.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  assert.deepEqual(errors, []);
  console.log(
    engine +
      ": deletion reaches both devices and private downloads do not appear in guest mode",
  );
} catch (error) {
  await captureFailure(browser, error);
  for (const c of contexts)
    for (const p of c.pages())
      await p
        .screenshot({ path: `work/cloud-files-${engine}-failure.png` })
        .catch(() => {});
  throw error;
} finally {
  for (const c of contexts) await c.close();
  await closeBrowser(browser);
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
