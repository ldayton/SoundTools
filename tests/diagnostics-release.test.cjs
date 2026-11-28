const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { publishDiagnostics } = require("../scripts/publish-diagnostics.cjs");
for (const app of ["dorego", "notewise", "songalong", "tagaluya"])
  test(
    app +
      ": reporting publishes the exact runtime release and uploads hidden maps before cleanup",
    () => {
      const output = fs.mkdtempSync(
        path.join(os.tmpdir(), "diagnostics-release-"),
      );
      try {
        fs.writeFileSync(
          path.join(output, "diagnostics-release.json"),
          JSON.stringify({ release: "abcdef123456-123456abcdef" }),
        );
        fs.writeFileSync(
          path.join(output, "sw.js"),
          "// exact generated worker\nthrow new Error('test');\n",
        );
        const commands = [],
          env = {
            VERCEL_ENV: "production",
            VITE_SENTRY_DSN: "public",
            SENTRY_ORG: "org",
            SENTRY_PROJECT: app,
            SENTRY_AUTH_TOKEN: "not-a-real-token",
          };
        assert(
          publishDiagnostics({
            app,
            output,
            env,
            run: (args) => {
              commands.push(args);
              if (args.includes("~/")) {
                const dir = args.at(-1),
                  map = JSON.parse(
                    fs.readFileSync(path.join(dir, "sw.js.map")),
                  );
                assert.equal(
                  fs.readFileSync(path.join(dir, "sw.js"), "utf8"),
                  fs.readFileSync(path.join(output, "sw.js"), "utf8"),
                );
                assert.equal(
                  map.sourcesContent[0],
                  fs.readFileSync(path.join(output, "sw.js"), "utf8"),
                );
                assert.equal(map.mappings, "AAAA;AACA;AACA");
              }
            },
          }),
        );
        assert.equal(commands[0][2], app + "@abcdef123456-123456abcdef");
        assert(commands[1].includes("~/assets"));
        assert(commands[1].includes("--strict"));
        assert(commands[1].includes("--wait"));
        assert(commands[2].includes("~/"));
        assert(!JSON.stringify(commands).includes("not-a-real-token"));
        assert.equal(
          publishDiagnostics({
            app,
            output,
            env: { ...env, VERCEL_ENV: "preview" },
            run: () => assert.fail(),
          }),
          false,
        );
        assert.throws(
          () =>
            publishDiagnostics({
              app,
              output,
              env: { ...env, SENTRY_AUTH_TOKEN: "" },
              run: () => assert.fail(),
            }),
          /SENTRY_AUTH_TOKEN/,
        );
      } finally {
        fs.rmSync(output, { recursive: true, force: true });
      }
    },
  );

test("soundglow uploads bundled UI maps against its immutable release URLs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "soundglow-ui-maps-"));
  const output = path.join(root, "site");
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output,"sw.js"),"// exact Soundglow worker\n");
  fs.writeFileSync(
    path.join(output, "release.json"),
    JSON.stringify({ version: "abc123", base: "/Soundglow/" }),
  );
  try {
    const commands = [];
    publishDiagnostics({
      app: "soundglow",
      output,
      env: {
        VERCEL_ENV: "production",
        SOUNDGLOW_SENTRY_DSN: "public",
        SENTRY_ORG: "org",
        SENTRY_PROJECT: "soundglow",
        SENTRY_AUTH_TOKEN: "test",
      },
      run: (args) => commands.push(args),
    });
    assert.equal(commands[0][2], "soundglow@abc123");
    assert(commands[1].includes("~/Soundglow/releases/abc123/ui"));
    assert.equal(commands[1].at(-1), path.join(root, "dist/ui"));
    assert(commands[1].includes("--strict"));
    assert(commands[1].includes("--wait"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
