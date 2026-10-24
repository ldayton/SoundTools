const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const {
  restorePrevious,
  publishAssets,
  sha,
} = require("./deployment-assets.cjs");
const root = path.resolve(__dirname, ".."),
  app = process.argv[2];
if (!["dorego", "soundglow"].includes(app))
  throw Error("Choose dorego or soundglow");
const project = path.join(root, "apps", app),
  output = path.join(project, app === "dorego" ? "dist" : "site");
const previous = path.join(root, "work", "previous-" + app);
(async () => {
  let currentAssets;
  const history = await restorePrevious(
    process.env.RETAIN_FROM_ORIGIN,
    previous,
    { soundglow: app === "soundglow" },
  );
  execFileSync("npm", ["run", "build:shared"], { cwd: root, stdio: "inherit" });
  execFileSync("npm", ["run", "test:shared"], { cwd: root, stdio: "inherit" });
  if (app === "dorego") {
    execFileSync("npm", ["run", "build", "--workspace=dorego"], {
      cwd: root,
      stdio: "inherit",
    });
    const originals = path.join(output, "samples/bitklavier");
    for (const file of fs.readdirSync(originals))
      if (file !== "NOTICE.txt")
        fs.rmSync(path.join(originals, file), { recursive: true });
  } else {
    execFileSync(process.execPath, ["scripts/verify-assets.cjs"], {
      cwd: project,
      stdio: "inherit",
    });
    const build = require(path.join(project, "scripts/build-site.cjs")).build;
    const before = process.cwd();
    try {
      process.chdir(project);
      currentAssets = build({ out: output, base: "/", previous }).files.map(
        (file) => file.url,
      );
    } finally {
      process.chdir(before);
    }
  }
  // Static hosting does not publish source maps.
  function removeMaps(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, file.name);
      if (file.isDirectory()) removeMaps(p);
      else if (file.name.endsWith(".map")) fs.rmSync(p);
    }
  }
  removeMaps(output);
  publishAssets(
    output,
    previous,
    history,
    sha(fs.readFileSync(path.join(output, "index.html"))).slice(0, 32),
    currentAssets,
  );
  console.log("Vercel static output ready:", output);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
