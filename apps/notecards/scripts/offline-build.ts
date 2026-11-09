import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { startupHTML, workerSource } from "@ldayton/browser-offline";
import { offlineWorker } from "./offline-worker";
export function offlineBuild(release: string): Plugin {
  let base = "/";
  return {
    name: "notecards-offline",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      base = config.base;
    },
    generateBundle: {
      // Vite finalizes dynamic-import preload lists in a normal generateBundle hook.
      // Hash the finished chunks, otherwise the offline worker rejects their bytes.
      order: "post",
      handler(_, bundle) {
        this.emitFile({
          type: "asset",
          fileName: "diagnostics-release.json",
          source: JSON.stringify({ release }),
        });
        const html = bundle["index.html"];
        if (!html || html.type !== "asset") throw Error("Missing app document");
        html.source = String(html.source).replace(
          "<head>",
          "<head>" + startupHTML(),
        );
        const entries = new Map<string, string | Uint8Array>();
        for (const [path, item] of Object.entries(bundle)) {
          if (!path.endsWith(".map"))
            entries.set(
              path === "index.html" ? base : base + path,
              item.type === "chunk" ? item.code : item.source,
            );
        }
        const publicFiles = (folder: string): string[] =>
          readdirSync(resolve("public", folder), { withFileTypes: true })
            .flatMap((entry) =>
              entry.isDirectory()
                ? publicFiles(folder + entry.name + "/")
                : [folder + entry.name],
            )
            .sort();
        for (const path of publicFiles(""))
          entries.set(base + path, readFileSync(resolve("public", path)));
        const hash = createHash("sha256")
          .update(workerSource())
          .update(readFileSync(resolve("scripts/offline-worker.ts")));
        for (const [url, bytes] of entries) hash.update(url).update(bytes);
        const version = "notecards-shell-" + hash.digest("hex").slice(0, 16);
        const inventory = base + `releases/${version}/offline-pack.json`;
        html.source = String(html.source).replace(
          "<head>",
          `<head><meta name="notecards-shell" content="${version}"><meta name="notecards-inventory" content="${inventory}">`,
        );
        entries.set(base, String(html.source));
        const files = [...entries].map(([url, bytes]) => ({
          url,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        }));
        const pack = { shellCache: version, files };
        const source = JSON.stringify(pack);
        this.emitFile({ type: "asset", fileName: "offline-pack.json", source });
        this.emitFile({
          type: "asset",
          fileName: inventory.slice(base.length),
          source,
        });
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: offlineWorker({ base, pack, inventory }),
        });
      },
    },
  };
}
