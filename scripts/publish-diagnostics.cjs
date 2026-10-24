// Upload before stripping maps. Do not mutate fingerprinted JavaScript: the
// offline manifests and retained asset inventory depend on those exact bytes.
const fs = require("node:fs");
const path = require("node:path");
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
    env[app === "dorego" ? "VITE_SENTRY_DSN" : "SOUNDGLOW_SENTRY_DSN"];
  if (env.VERCEL_ENV !== "production" || !dsn) return false;
  for (const key of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"])
    if (!env[key])
      throw Error(
        `Automatic production reporting needs ${key} for release publication`,
      );
  const version =
    app === "dorego"
      ? JSON.parse(
          fs.readFileSync(path.join(output, "diagnostics-release.json")),
        ).release
      : JSON.parse(fs.readFileSync(path.join(output, "release.json"))).version;
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(version))
    throw Error("Invalid diagnostics release");
  const release = app + "@" + version;
  run(["releases", "new", release]);
  if (app === "dorego")
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
  // Soundglow's authored JS is unminified and retains its deployed line numbers.
  run(["releases", "finalize", release]);
  return true;
}
module.exports = { publishDiagnostics };
