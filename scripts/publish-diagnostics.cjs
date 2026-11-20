// Upload before stripping maps. Do not mutate fingerprinted JavaScript: the
// offline manifests and retained asset inventory depend on those exact bytes.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
function publishDiagnostics({
  app,
  output,
  env = process.env,
  run = (args) =>
    execFileSync(
      process.execPath,
      [require.resolve("@sentry/cli/bin/sentry-cli"), ...args],
      { env, stdio: "inherit" },
    ),
}) {
  const dsn =
    env[app === "soundglow" ? "SOUNDGLOW_SENTRY_DSN" : "VITE_SENTRY_DSN"];
  if (env.VERCEL_ENV !== "production" || !dsn) return false;
  for (const key of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"])
    if (!env[key])
      throw Error(
        `Automatic production reporting needs ${key} for release publication`,
      );
  const version =
    app !== "soundglow"
      ? JSON.parse(
          fs.readFileSync(path.join(output, "diagnostics-release.json")),
        ).release
      : JSON.parse(fs.readFileSync(path.join(output, "release.json"))).version;
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(version))
    throw Error("Invalid diagnostics release");
  const release = app + "@" + version;
  run(["releases", "new", release]);
  if (app !== "soundglow")
    run([
      "sourcemaps",
      "upload",
      "--release",
      release,
      "--url-prefix",
      "~/assets",
      "--ignore",
      "**/sentry-*.js",
      "--validate",
      "--strict",
      "--wait",
      path.join(output, "assets"),
    ]);
  if (app === "soundglow") {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(output, "release.json")),
    );
    const ui = path.resolve(output, "../dist/ui");
    // Upload the exact compiled UI before static-output cleanup. Never rewrite its bytes.
    run([
      "sourcemaps",
      "upload",
      "--release",
      release,
      "--url-prefix",
      "~" + manifest.base + "releases/" + version + "/ui",
      "--validate",
      "--strict",
      "--wait",
      ui,
    ]);
  }
  // Generated workers are outside Vite's assets directory. Publish their exact
  // readable source with an identity map; never modify deployed/cache-hashed bytes.
  const workerPath = path.join(output, "sw.js");
  if (!fs.existsSync(workerPath)) throw Error("Missing generated worker source for diagnostics publication");
  {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "soundtools-worker-map-"),
    );
    try {
      const source = fs.readFileSync(workerPath, "utf8");
      fs.writeFileSync(path.join(directory, "sw.js"), source);
      fs.writeFileSync(
        path.join(directory, "sw.js.map"),
        JSON.stringify({
          version: 3,
          file: "sw.js",
          sources: [app + "/generated-service-worker.js"],
          sourcesContent: [source],
          names: [],
          mappings: source
            .split("\n")
            .map((_, line) => (line === 0 ? "AAAA" : "AACA"))
            .join(";"),
        }),
      );
      const base =
        app === "soundglow"
          ? JSON.parse(fs.readFileSync(path.join(output, "release.json"))).base
          : "/";
      run([
        "sourcemaps",
        "upload",
        "--release",
        release,
        "--url-prefix",
        "~" + base,
        "--validate",
        "--strict",
        "--wait",
        directory,
      ]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  // The remaining Soundglow scripts retain their deployed source line numbers.
  run(["releases", "finalize", release]);
  return true;
}
module.exports = { publishDiagnostics };
