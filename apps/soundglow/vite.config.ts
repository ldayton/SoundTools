import { defineConfig } from "vite";
import { captureAccountLink } from "@ldayton/account/link";
import { accountApi } from "@ldayton/account/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The existing release packager still owns HTML, workers, media and offline hashes.
export default defineConfig({
  plugins: [
    react(),
    accountApi(),
    {
      name: "soundtools-early-auth-link",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "account-link.js",
          source: `(${captureAccountLink.toString()})();`,
        });
      },
    },
  ],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/ui/index.ts"),
      name: "SoundglowUI",
      formats: ["iife"],
      fileName: () => "soundglow-ui.js",
      cssFileName: "soundglow-ui",
    },
  },
});
