import { spawn } from "node:child_process";
import { createRequire } from "node:module";
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
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(`${app} preview exited`);
    try {
      if ((await fetch(base)).ok) return { base, stop: () => server.kill() };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw Error(`${app} preview did not start`);
}
