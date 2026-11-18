import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const config = JSON.parse(
  readFileSync(new URL("../work/account-local.json", import.meta.url), "utf8"),
);
const children = ["dorego", "songalong", "notewise", "soundglow"].map(
  (app, index) => {
    const port = String(4391 + index);
    return spawn(
      process.execPath,
      app === "soundglow"
        ? ["scripts/dev-server.cjs", "--port", port]
        : [
            "../../node_modules/vite/bin/vite.js",
            ...(process.argv.includes("--preview") ? ["preview"] : []),
            "--host",
            "127.0.0.1",
            "--port",
            port,
            "--strictPort",
          ],
      {
        cwd: new URL("../apps/" + app, import.meta.url),
        stdio: "inherit",
        env: {
          ...process.env,
          ...config,
          PORT: port,
          ACCOUNT_APP_URL: "http://127.0.0.1:" + port,
        },
      },
    );
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((child) => child.kill(signal));
  });
