import { defineConfig } from "vite";
import { offlineBuild } from "./scripts/offline-build";
export default defineConfig({
  plugins: [offlineBuild()],
  optimizeDeps: { include: ["@ldayton/browser-offline"] },
  build: {
    commonjsOptions: { include: [/node_modules/, /packages\/browser-offline/] },
  },
});
