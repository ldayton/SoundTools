const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const prefixes = [
  "assets/",
  "releases/",
  "engines/",
  "media/",
  "vendor/neural/",
];
function safePath(url) {
  if (
    typeof url !== "string" ||
    !url.startsWith("/") ||
    url.includes("..") ||
    url.includes("\\") ||
    /[?#%]/.test(url) ||
    url.endsWith(".map")
  )
    throw Error("Invalid retained asset path");
  const relative = url.slice(1);
  if (!prefixes.some((prefix) => relative.startsWith(prefix)))
    throw Error("Asset is outside immutable directories");
  return relative;
}
function selectHistory(entries, now = Date.now()) {
  if (!Array.isArray(entries) || entries.length > 100)
    throw Error("Invalid asset history");
  return entries.filter(
    (entry, index) => index < 3 || now - entry.publishedAt < 86400000,
  );
}
async function restorePrevious(origin, directory, { soundglow = false } = {}) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  if (!origin) return [];
  const base = new URL(origin);
  if (
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(base.hostname))
  )
    throw Error("Retention origin must be an HTTPS site root");
  const response = await fetch(
    new URL("asset-history.json?check=" + Date.now(), base),
    { signal: AbortSignal.timeout(30000), cache: "no-store" },
  );
  if (!response.ok)
    throw Error("Could not read previous asset history: " + response.status);
  const history = selectHistory(await response.json());
  const files = new Map();
  for (const entry of history) {
    if (
      typeof entry.version !== "string" ||
      !Number.isFinite(entry.publishedAt) ||
      !Array.isArray(entry.files)
    )
      throw Error("Invalid release history");
    for (const file of entry.files) {
      safePath(file.url);
      if (!/^[a-f0-9]{64}$/.test(file.sha256))
        throw Error("Invalid asset hash");
      if (files.has(file.url) && files.get(file.url).sha256 !== file.sha256)
        throw Error("Immutable path changed contents");
      files.set(file.url, file);
    }
  }
  if (files.size > 5000) throw Error("Excessive retained file count");
  let total = 0;
  const pending = [...files.values()];
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      while (pending.length) {
        const file = pending.shift();
        const r = await fetch(new URL(file.url, base), {
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw Error("Missing retained asset: " + file.url);
        const bytes = Buffer.from(await r.arrayBuffer());
        total += bytes.length;
        if (bytes.length > 64e6 || total > 512e6 || sha(bytes) !== file.sha256)
          throw Error("Retained asset failed integrity/size checks");
        const dest = path.join(directory, safePath(file.url));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, bytes);
      }
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  if (soundglow) {
    const r = await fetch(
      new URL("release-history.json?check=" + Date.now(), base),
      { signal: AbortSignal.timeout(30000), cache: "no-store" },
    );
    if (!r.ok) throw Error("Missing Soundglow release history");
    const releases = await r.json();
    if (!Array.isArray(releases))
      throw Error("Invalid Soundglow release history");
    for (const entry of releases)
      for (const file of entry.manifest?.files || []) safePath(file.url);
    fs.writeFileSync(
      path.join(directory, "release-history.json"),
      JSON.stringify(releases),
    );
  }
  return history;
}
function publishAssets(output, previous, history, version, currentAssets) {
  const current = currentAssets && new Set(currentAssets);
  const files = [];
  function walk(directory, relative = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = relative + entry.name;
      if (entry.isDirectory())
        walk(path.join(directory, entry.name), file + "/");
      else if (
        prefixes.some((prefix) => file.startsWith(prefix)) &&
        !file.endsWith(".map") &&
        (!current || current.has("/" + file))
      )
        files.push({
          url: "/" + file,
          sha256: sha(fs.readFileSync(path.join(directory, entry.name))),
        });
    }
  }
  walk(output);
  const retained = selectHistory(
    history.filter((entry) => entry.version !== version),
  );
  for (const entry of retained)
    for (const file of entry.files) {
      const relative = safePath(file.url),
        destination = path.join(output, relative);
      const bytes = fs.readFileSync(path.join(previous, relative));
      if (sha(bytes) !== file.sha256)
        throw Error("Previous asset changed on disk");
      if (fs.existsSync(destination)) {
        if (sha(fs.readFileSync(destination)) !== file.sha256)
          throw Error("Immutable deployment path reused");
      } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes);
      }
    }
  const result = [{ version, publishedAt: Date.now(), files }, ...retained];
  fs.writeFileSync(
    path.join(output, "asset-history.json"),
    JSON.stringify(result),
  );
  return result;
}
module.exports = {
  sha,
  safePath,
  selectHistory,
  restorePrevious,
  publishAssets,
};
