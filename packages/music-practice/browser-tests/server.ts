import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { waitForServer } from '../../../scripts/ci/browser-harness.cjs';
export async function preview(app: string, port: number) {
  const cwd = new URL(`../../../apps/${app}/`, import.meta.url);
  const vite = createRequire(import.meta.url)
    .resolve("vite/package.json")
    .replace(/package.json$/, "bin/vite.js");
  const server = spawn(
    process.execPath,
    [
      vite,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd, stdio: "ignore" },
  );
  const base = `http://127.0.0.1:${port}`;
  try { await waitForServer(base, { server }); }
  catch (error) { server.kill(); throw error; }
  return { base, stop: () => server.kill() };
}
