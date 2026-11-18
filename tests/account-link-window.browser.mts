import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { chromium, firefox, webkit, expect } from "playwright/test";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url);
const { macBookAir13 } = require("../scripts/test-devices.cjs");
const config = JSON.parse(
  await readFile(
    new URL("../work/account-local.json", import.meta.url),
    "utf8",
  ),
);
const { env } = JSON.parse(
  await readFile(
    new URL("../work/account-local-status.json", import.meta.url),
    "utf8",
  ),
);
assert(
  env.API_URL.startsWith("http://127.0.0.1:"),
  "Never use production credentials for this test",
);
assert.equal(env.API_URL, config.VITE_SUPABASE_URL);
const admin = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const engine = process.env.TEST_BROWSER || "chromium";
const fixed = await mkdtemp(join(tmpdir(), "soundtools-link-"));
const browser = await (
  { chromium, firefox, webkit }[engine] || chromium
).launch({
  args: engine === "chromium" ? ["--mute-audio"] : [],
  env: { ...process.env, CFFIXED_USER_HOME: fixed },
});
await mkdir("work/account-link-window", { recursive: true });
const errors: string[] = [];
async function link(base: string) {
  const result = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: config.ACCOUNT_APPROVED_EMAIL,
  });
  if (result.error) throw result.error;
  return (
    base +
    "/auth/confirm#token_hash=" +
    encodeURIComponent(result.data.properties.hashed_token) +
    "&type=email"
  );
}
try {
  for (const [id, name, port] of [
    ["songalong", "SongAlong", 4392],
    ["notewise", "NoteWise", 4393],
    ["dorego", "DoReGo", 4391],
  ] as const) {
    const context = await browser.newContext({
      ...macBookAir13,
      serviceWorkers: "block",
    });
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    const base = `http://127.0.0.1:${port}`;
    const app = await context.newPage();
    await app.goto(base);
    await app.getByRole("button", { name: "Log in", exact: true }).waitFor();
    if (id !== "dorego")
      await expect
        .poll(() =>
          app.evaluate(
            async (id) =>
              (await navigator.locks.query()).held?.some(
                (lock) => lock.name === `soundtools-${id}-writer`,
              ),
            id,
          ),
        )
        .toBe(true);
    const callback = await context.newPage();
    await callback.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      (window as any).__openedDatabases = [];
      indexedDB.open = (...args) => {
        (window as any).__openedDatabases.push(args[0]);
        return open(...args);
      };
    });
    const rpc: string[] = [];
    callback.on("request", (request) => {
      if (request.url().includes("/rest/v1/rpc/")) rpc.push(request.url());
    });
    await callback.goto(await link(base));
    await callback
      .getByRole("heading", { name: "Confirm sign-in", exact: true })
      .waitFor();
    assert(!callback.url().includes("token_hash"));
    assert.equal(
      await callback
        .getByText("Practice is open in another window.", { exact: false })
        .count(),
      0,
    );
    await callback.route(env.API_URL + "/auth/v1/verify", (route) =>
      route.abort(),
    );
    await callback
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(callback.getByRole("alert")).toContainText(
      "Check your connection and try again.",
    );
    await callback.unroute(env.API_URL + "/auth/v1/verify");
    await callback
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await callback
      .getByRole("heading", { name: "Signed in", exact: true })
      .waitFor();
    await app.getByRole("button", { name: "Account", exact: true }).waitFor();
    assert.deepEqual(
      await callback.evaluate(() => (window as any).__openedDatabases),
      [],
      "Confirmation never opens practice or account-sync storage",
    );
    assert.deepEqual(
      rpc,
      [],
      "Confirmation never initializes or syncs practice data",
    );
    if (id !== "dorego") {
      await expect(callback.getByRole("status")).toContainText(
        `Return to your open ${name} window`,
      );
      assert.equal(
        await callback
          .getByRole("link", { name: `Continue to ${name}` })
          .count(),
        0,
      );
      const duplicate = await context.newPage();
      await duplicate.goto(base);
      await duplicate
        .locator("#persistence-notice-body")
        .filter({ hasText: "Practice is open in another window." })
        .waitFor();
      await duplicate.close();
    }
    if (id === "songalong")
      await callback.screenshot({
        path: `work/account-link-window/${engine}-return-to-app.png`,
      });
    await callback.close();
    await app.reload();
    await app.getByRole("button", { name: "Account", exact: true }).waitFor();
    await context.close();
    // A link with no running app still offers an explicit normal startup.
    const cold = await browser.newContext({
      ...macBookAir13,
      serviceWorkers: "block",
    });
    const page = await cold.newPage();
    await page.goto(await link(base));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("link", { name: `Continue to ${name}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Account", exact: true }).waitFor();
    await cold.close();
    console.log(
      `${engine}: ${name} email confirmation preserves open practice, shares sign-in, survives reload, and supports cold startup`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await rm(fixed, { recursive: true, force: true }).catch(() => {});
}
