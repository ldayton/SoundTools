import { readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
const config = JSON.parse(
  readFileSync(new URL("../work/account-local.json", import.meta.url), "utf8"),
);
if (new URL(config.SUPABASE_URL).hostname !== "127.0.0.1")
  throw Error("Local preview only.");
execFileSync(
  process.execPath,
  ["apps/soundglow/scripts/prepare-diagnostics.cjs"],
  { stdio: "inherit" },
);
const child = spawn(
  process.execPath,
  ["scripts/dev-server.cjs", "--port", "4394"],
  {
    cwd: new URL("../apps/soundglow/", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      ...config,
      ACCOUNT_APP_URL: "http://127.0.0.1:4394",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
