const { execFileSync } = require("node:child_process");
for (const [app, source] of Object.entries(require("./history.json"))) {
  execFileSync("git", ["merge-base", "--is-ancestor", source.commit, "HEAD"]);
  const count = execFileSync("git", ["rev-list", "--count", source.commit], {
    encoding: "utf8",
  }).trim();
  console.log(
    `${app}: ${count} original commits preserved, original tip ${source.commit}`,
  );
}
