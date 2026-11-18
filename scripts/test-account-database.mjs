import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const { env } = JSON.parse(
  readFileSync("work/account-local-status.json", "utf8"),
);
assert(env.API_URL.startsWith("http://127.0.0.1:"));
const admin = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function login(email) {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (generated.error) throw generated.error;
  const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.verifyOtp({
    email,
    token: generated.data.properties.email_otp,
    type: "email",
  });
  if (error) throw error;
  return client;
}
const owner = await login("owner@soundtools.test");
const unapproved = await login("unapproved@soundtools.test");
const anon = createClient(env.API_URL, env.PUBLISHABLE_KEY);
assert(
  (
    await anon.auth.signUp({
      email: "cannot-sign-up@soundtools.test",
      password: "not-a-real-password-1234",
    })
  ).error,
);
for (const client of [anon, unapproved]) {
  assert((await client.rpc("account_snapshot", { p_app: "dorego" })).error);
  assert(
    (
      await client.rpc("account_initialize", {
        p_app: "dorego",
        p_records: {},
        p_device: crypto.randomUUID(),
      })
    ).error,
  );
  const result = await client.from("account_records").select("*");
  assert(result.error || result.data.length === 0);
}
const app = "notewise";
// This local contract test owns a disposable app namespace. Browser tests now
// exercise all four apps, so repeated suite runs must not depend on an empty DB.
for (const table of ["public.account_apps", "private.account_operations"])
  execFileSync("supabase", ["db", "query", `delete from ${table} where app = 'notewise';`], {stdio:"ignore"});
const device = crypto.randomUUID();
let result = await owner.rpc("account_initialize", {
  p_app: app,
  p_records: { "test.tempo": 80 },
  p_device: device,
});
assert.ifError(result.error);
let snapshot = await owner.rpc("account_snapshot", { p_app: app });
assert.ifError(snapshot.error);
const row = snapshot.data.rows.find((r) => r.key === "test.tempo");
const operation = crypto.randomUUID();
const args = {
  p_app: app,
  p_key: "test.tempo",
  p_value: 100,
  p_revision: row.revision,
  p_operation: operation,
  p_device: device,
};
const first = await owner.rpc("account_write", args);
assert.ifError(first.error);
assert(first.data.applied);
const duplicate = await owner.rpc("account_write", args);
assert.ifError(duplicate.error);
assert(duplicate.data.applied);
assert.equal(duplicate.data.row.revision, first.data.row.revision);
const stale = await owner.rpc("account_write", {
  ...args,
  p_operation: crypto.randomUUID(),
  p_value: 110,
});
assert.ifError(stale.error);
assert.equal(stale.data.applied, false);
assert(
  (await owner.from("account_records").update({ value: 999 }).eq("app", app))
    .error,
  "direct writes cannot bypass revision checks",
);
console.log(
  "Database: signup denial, anonymous/unapproved isolation, ownership, atomic initialization, revisions and idempotent retries passed",
);
