import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = {
  ...process.env,
  ...JSON.parse(
    readFileSync(
      new URL("../work/account-local.json", import.meta.url),
      "utf8",
    ),
  ),
};
for (const app of ["dorego", "songalong", "notewise", "soundglow"]) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      [
        "run",
        app === "soundglow" ? "prepare:shared" : "build",
        "--workspace=" + app,
      ],
      {
        stdio: "inherit",
        env,
      },
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(app + " build failed")),
    );
  });
}
