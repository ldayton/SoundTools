import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { offlineBuild } from "./scripts/offline-build";
let revision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local";
if (revision === "local")
  try {
    revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {}
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== "node_modules")
    .flatMap((entry) =>
      entry.isDirectory()
        ? sources(dir + "/" + entry.name)
        : [dir + "/" + entry.name],
    )
    .sort();
}
const hash = createHash("sha256");
for (const file of [
  ...sources("src"),
  ...sources("scripts"),
  ...sources("../../packages/ui"),
  ...sources("../../packages/browser-controls"),
  ...sources("../../packages/browser-offline"),
  ...sources("../../packages/browser-diagnostics").filter(
    (f) => !f.includes("/node_modules/") && !f.includes("/test"),
  ),
  "vite.config.ts",
  "index.html",
  "../../package-lock.json",
])
  hash.update(file).update(readFileSync(file));
const release = revision + "-" + hash.digest("hex").slice(0, 12);
export default defineConfig({
  define: {
    __NOTECARDS_BUILD__: JSON.stringify(release),
    "import.meta.env.VITE_DEPLOY_ENV": JSON.stringify(
      process.env.VERCEL_ENV || "development",
    ),
  },
  plugins: [react(), offlineBuild(release)],
  optimizeDeps: {
    include: ["@ldayton/browser-offline", "@ldayton/browser-diagnostics"],
  },
  build: {
    sourcemap: "hidden",
    commonjsOptions: {
      include: [/node_modules/, /packages\/browser-(offline|diagnostics)/],
    },
  },
});
