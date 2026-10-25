const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const {
  sha,
  safePath,
  selectHistory,
  publishAssets,
  restorePrevious,
} = require("../scripts/deployment-assets.cjs");
test("deployment retention rejects unsafe paths and protects recent releases", () => {
  for (const url of [
    "/../private",
    "/assets/../x",
    "//evil/asset",
    "/assets/x.js?secret=x",
    "/assets/x.map",
    "/index.html",
    "/assets/%2e%2e/x",
  ])
    assert.throws(() => safePath(url));
  const now = Date.now(),
    entries = Array.from({ length: 5 }, (_, i) => ({
      version: String(i),
      publishedAt: i === 4 ? now : 0,
      files: [],
    }));
  assert.deepEqual(
    selectHistory(entries, now).map((x) => x.version),
    ["0", "1", "2", "4"],
  );
});
test("a new deployment retains verified old lazy assets; failed download/integrity stops publication", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-tools-retention-")),
    old = path.join(dir, "old"),
    next = path.join(dir, "next"),
    previous = path.join(dir, "previous");
  fs.mkdirSync(path.join(old, "assets"), { recursive: true });
  fs.writeFileSync(path.join(old, "assets/a.js"), "old");
  fs.writeFileSync(path.join(old, "index.html"), "old html");
  publishAssets(old, previous, [], "old");
  let corrupt = false;
  const server = http.createServer((req, res) => {
    const file = path.join(old, new URL(req.url, "http://test").pathname);
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.end(
      corrupt && file.endsWith("a.js") ? "corrupt" : fs.readFileSync(file),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    const history = await restorePrevious(origin, previous);
    fs.mkdirSync(path.join(next, "assets"), { recursive: true });
    fs.writeFileSync(path.join(next, "assets/b.js"), "new");
    publishAssets(next, previous, history, "new");
    assert.equal(
      fs.readFileSync(path.join(next, "assets/a.js"), "utf8"),
      "old",
    );
    assert.equal(
      sha(fs.readFileSync(path.join(next, "assets/b.js"))),
      sha(Buffer.from("new")),
    );
    corrupt = true;
    await assert.rejects(restorePrevious(origin, previous), /integrity/);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("optional models belong to the current inventory without extending old release lifetimes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soundtools-inventory-"));
  try {
    for (const file of [
      "releases/current/app.js",
      "releases/older/app.js",
      "vendor/neural/current/model.onnx",
    ]) {
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file);
    }
    const history = publishAssets(dir, "", [], "current", [
      "/releases/current/app.js",
    ]);
    assert.deepEqual(history[0].files.map((file) => file.url).sort(), [
      "/releases/current/app.js",
      "/vendor/neural/current/model.onnx",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("web sound banks survive deployments and cannot change at immutable URLs", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soundtools-banks-'));
  const old=path.join(dir,'old'),next=path.join(dir,'next');
  try {
    const bank='samples/bitklavier-web-v1/C4.flac';
    for(const root of [old,next])fs.mkdirSync(path.join(root,path.dirname(bank)),{recursive:true});
    fs.writeFileSync(path.join(old,bank),'recording');
    fs.mkdirSync(path.join(old,'samples/bitklavier'),{recursive:true});
    fs.writeFileSync(path.join(old,'samples/bitklavier/original.wav'),'original');
    const history=publishAssets(old,'',[],'old');
    assert.deepEqual(history[0].files.map(f=>f.url),['/'+bank]);
    publishAssets(next,old,history,'next');
    assert.equal(fs.readFileSync(path.join(next,bank),'utf8'),'recording');
    fs.writeFileSync(path.join(next,bank),'changed');
    assert.throws(()=>publishAssets(next,old,history,'bad'),/Immutable deployment path reused/);
    assert.throws(()=>safePath('/samples/bitklavier/original.wav'));
    assert.throws(()=>safePath('/samples/bitklavier-web-v1/nested/file.flac'));
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
