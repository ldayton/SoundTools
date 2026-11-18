// Local-only bootstrap: the CLI's privileged key never enters an app environment.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const status = JSON.parse(
  execFileSync("supabase", ["status", "--output-format", "json"], {
    encoding: "utf8",
  }),
);
mkdirSync("work", { recursive: true });
writeFileSync("work/account-local-status.json", JSON.stringify(status), {
  mode: 0o600,
});
const env = status.env;
if (!env.API_URL.startsWith("http://127.0.0.1:"))
  throw Error("This script only provisions local Supabase.");
const client = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = "owner@soundtools.test";
const users = await client.auth.admin.listUsers();
if (users.error) throw users.error;
let owner = users.data.users.find((user) => user.email === email);
if (!owner) {
  const result = await client.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (result.error) throw result.error;
  owner = result.data.user;
}
if (!/^[0-9a-f-]{36}$/.test(owner.id)) throw Error("Invalid local owner id.");
execFileSync(
  "supabase",
  [
    "db",
    "query",
    `insert into private.account_owners(user_id,email) values ('${owner.id}','${email}') on conflict(user_id) do nothing;`,
  ],
  { stdio: "ignore" },
);
mkdirSync("work", { recursive: true });
writeFileSync(
  "work/account-local.json",
  JSON.stringify(
    {
      VITE_SUPABASE_URL: env.API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.PUBLISHABLE_KEY,
      SUPABASE_URL: env.API_URL,
      SUPABASE_PUBLISHABLE_KEY: env.PUBLISHABLE_KEY,
      ACCOUNT_APPROVED_EMAIL: email,
      MAILPIT_URL: env.MAILPIT_URL,
    },
    null,
    2,
  ),
);
console.log(
  "Local account ready. Test emails are captured at " + env.MAILPIT_URL,
);
