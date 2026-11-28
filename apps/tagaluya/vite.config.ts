import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {offlineBuild} from "../../packages/music-practice/scripts/offline-build";
import {startupHTML} from "@ldayton/browser-offline";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
const revision=process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,12)||execFileSync("git",["rev-parse","--short=12","HEAD"],{encoding:"utf8"}).trim();
export default defineConfig({
  define:{__TAGALUJAH_RELEASE__:JSON.stringify(revision),"import.meta.env.VITE_DEPLOY_ENV":JSON.stringify(process.env.VERCEL_ENV||"development")},
  cacheDir:process.env.CI_VITE_CACHE_DIR?resolve(process.env.CI_VITE_CACHE_DIR,"tagaluya"):undefined,
  plugins:[react(),{name:"tagaluya-dev-startup",apply:"serve",transformIndexHtml:html=>html.replace("<head>","<head>"+startupHTML())},offlineBuild(revision,"tagaluya",["services","settings"])],
  optimizeDeps:{include:["@ldayton/browser-offline","@ldayton/browser-diagnostics"]},
  build:{sourcemap:"hidden",commonjsOptions:{include:[/node_modules/,/packages\/browser-(offline|diagnostics)/]}},
  server:{fs:{allow:[resolve("../..")]}},
});
