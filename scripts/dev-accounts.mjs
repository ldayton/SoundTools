import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const config = JSON.parse(
  readFileSync(new URL("../work/account-local.json", import.meta.url), "utf8"),
);
const children = [
  spawn(
    process.execPath,
    [
      "../../node_modules/vite/bin/vite.js",
      ...(process.argv.includes("--preview") ? ["preview"] : []),
      "--host",
      "127.0.0.1",
      "--port",
      "4391",
      "--strictPort",
    ],
    {
      cwd: new URL("../apps/dorego", import.meta.url),
      stdio: "inherit",
      env: {
        ...process.env,
        ...config,
        PORT: "4391",
        ACCOUNT_APP_URL: "http://127.0.0.1:4391",
      },
    },
  ),
  spawn(
    process.execPath,
    [
      "../../node_modules/vite/bin/vite.js",
      ...(process.argv.includes("--preview") ? ["preview"] : []),
      "--host",
      "127.0.0.1",
      "--port",
      "4392",
      "--strictPort",
    ],
    {
      cwd: new URL("../apps/songalong", import.meta.url),
      stdio: "inherit",
      env: {
        ...process.env,
        ...config,
        ACCOUNT_APP_URL: "http://127.0.0.1:4392",
      },
    },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((child) => child.kill(signal));
  });
