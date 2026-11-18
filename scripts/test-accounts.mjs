import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
async function run(command, args) {
  const p = spawn(command, args, { stdio: "inherit" });
  await new Promise((resolve, reject) => {
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(command + " failed")),
    );
  });
}
await run("node", ["scripts/test-account-database.mjs"]);
await run("node", ["scripts/build-accounts-local.mjs"]);
const servers = spawn("node", ["scripts/dev-accounts.mjs", "--preview"], {
  stdio: "inherit",
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (
        await Promise.all(
          [4391, 4392].map((port) => fetch(`http://127.0.0.1:${port}/`)),
        )
      ).every((r) => r.ok);
    } catch {}
    if (ready) break;
    await setTimeout(100);
  }
  if (!ready) throw Error("Local account previews did not start.");
  await run("npx", ["tsx", "tests/accounts.browser.mts"]);
} finally {
  servers.kill("SIGTERM");
}
