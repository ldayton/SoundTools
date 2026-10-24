const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const root = path.resolve(__dirname, "..");
test("both apps resolve the same shared workspace source, without vendored archives", () => {
  for (const library of ["browser-diagnostics", "browser-offline"]) {
    const expected = fs.realpathSync(path.join(root, "packages", library));
    for (const app of ["dorego", "soundglow"]) {
      const requireApp = createRequire(
        path.join(root, "apps", app, "package.json"),
      );
      assert.equal(
        fs.realpathSync(
          path.dirname(
            requireApp.resolve("@ldayton/" + library + "/package.json"),
          ),
        ),
        expected,
      );
      const pkg = requireApp("./package.json");
      assert.equal(pkg.dependencies["@ldayton/" + library], "*");
      assert(
        !fs.existsSync(
          path.join(
            root,
            "apps",
            app,
            "vendor",
            "ldayton-" + library + "-0.1.0.tgz",
          ),
        ),
      );
    }
  }
});
test("Soundglow copies shared browser assets only as generated build output", () => {
  const source = path.join(root, "packages/browser-diagnostics"),
    output = path.join(root, "apps/soundglow/dist/vendor/diagnostics");
  for (const file of [
    "core.js",
    "sentry.js",
    "LICENSE",
    "SENTRY-LICENSE",
    "sentry.js.LEGAL.txt",
  ])
    assert(
      fs
        .readFileSync(path.join(source, file))
        .equals(fs.readFileSync(path.join(output, file))),
    );
});
