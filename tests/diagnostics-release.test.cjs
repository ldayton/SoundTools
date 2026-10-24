const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { publishDiagnostics } = require("../scripts/publish-diagnostics.cjs");
test("reporting publishes the exact runtime release and uploads hidden maps before cleanup", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostics-release-"));
  try {
    fs.writeFileSync(
      path.join(output, "diagnostics-release.json"),
      JSON.stringify({ release: "abcdef123456-123456abcdef" }),
    );
    const commands = [],
      env = {
        VERCEL_ENV: "production",
        VITE_SENTRY_DSN: "public",
        SENTRY_ORG: "org",
        SENTRY_PROJECT: "dorego",
        SENTRY_AUTH_TOKEN: "not-a-real-token",
      };
    assert(
      publishDiagnostics({
        app: "dorego",
        output,
        env,
        run: (args) => commands.push(args),
      }),
    );
    assert.equal(commands[0][2], "dorego@abcdef123456-123456abcdef");
    assert(commands[1].includes("~/assets"));
    assert(commands[1].includes("--strict"));
    assert(commands[1].includes("--wait"));
    assert(!JSON.stringify(commands).includes("not-a-real-token"));
    assert.equal(
      publishDiagnostics({
        app: "dorego",
        output,
        env: { ...env, VERCEL_ENV: "preview" },
        run: () => assert.fail(),
      }),
      false,
    );
    assert.throws(
      () =>
        publishDiagnostics({
          app: "dorego",
          output,
          env: { ...env, SENTRY_AUTH_TOKEN: "" },
          run: () => assert.fail(),
        }),
      /SENTRY_AUTH_TOKEN/,
    );
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
