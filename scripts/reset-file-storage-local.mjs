// Disposable local fixtures only. Never run this against a hosted project.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const { env } = JSON.parse(
  readFileSync("work/account-local-status.json", "utf8"),
);
assert.equal(new URL(env.API_URL).hostname, "127.0.0.1");
const admin = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await admin.storage.emptyBucket("soundtools-files");
assert.ifError(error);
execFileSync(
  "supabase",
  ["db", "query", "delete from public.media_files", "--yes"],
  { stdio: "ignore" },
);
