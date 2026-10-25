const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const vm = require("node:vm");
const { createRuntime, createResources, workerSource } = require("../index.cjs");
function fixture() {
  const stores = new Map(),
    handlers = {};
  const env = {
    location: { origin: "https://example.test" },
    registration: {},
    crypto: webcrypto,
    clients: { matchAll: async () => [], claim: async () => {} },
    caches: {
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const data = stores.get(name);
        return {
          match: async (key) =>
            data.get(typeof key === "string" ? key : key.url)?.clone(),
          put: async (key, value) => data.set(key, value.clone()),
          addAll: async (requests) => {
            const responses = await Promise.all(
              requests.map((r) => env.fetch(r)),
            );
            if (!responses.every((r) => r.ok))
              throw Error("Incomplete atomic batch");
            requests.forEach((r, i) => data.set(r.url, responses[i]));
          },
        };
      },
    },
    fetch: async () => new Response("ok"),
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: async () => {},
  };
  return { env, stores, handlers, runtime: createRuntime(env, "/app/") };
}
test("generated worker runtime executes without module imports or outer dependencies", () => {
  const { env } = fixture();
  const runtime = vm.runInNewContext(workerSource() + "offline", {
    self: env,
    CONFIG: { base: "/app/" },
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  assert.equal(typeof runtime.navigate, "function");
  assert.equal(
    runtime.requestURL(new Request("https://example.test/other/")),
    null,
  );
  assert.equal(
    runtime.requestURL(new Request("https://other.test/app/")),
    null,
  );
  assert.equal(
    runtime.requestURL(
      new Request("https://example.test/app/", { method: "POST" }),
    ),
    null,
  );
  assert.equal(
    runtime.requestURL(new Request("https://example.test/app/a")).pathname,
    "/app/a",
  );
});
test("verified staging keeps root documents navigable and manifests typed", async () => {
  const { env, stores } = fixture();
  const runtime = createRuntime(env, "/app/", createResources(env));
  await runtime.stageAssets("typed", [
    { url: "https://example.test/app/" },
    { url: "https://example.test/app/manifest.webmanifest" },
  ]);
  assert.equal(stores.get("typed").get("https://example.test/app/").headers.get("Content-Type"), "text/html");
  assert.equal(stores.get("typed").get("https://example.test/app/manifest.webmanifest").headers.get("Content-Type"), "application/manifest+json");
});
test("interrupted cache reads preserve files instead of treating them as corrupt", async () => {
  const { env } = fixture();
  let deleted = false;
  env.caches.open = async () => ({
    match: async () => ({ok: true, arrayBuffer: async () => {throw new DOMException("Read interrupted", "AbortError");}}),
    delete: async () => {deleted = true;},
  });
  const runtime = createRuntime(env, "/app/", createResources(env));
  const files = [{url: "https://example.test/app/a", sha256: "0".repeat(64)}];
  await assert.rejects(runtime.stageAssets("assets", files), {name: "AbortError"});
  await assert.rejects(runtime.verified("assets", files), {name: "AbortError"});
  assert.equal(deleted, false);
});
test("concurrent staging deduplicates; failures drain writes and retry safely", async () => {
  const { runtime, env, stores } = fixture();
  let release,
    calls = 0;
  const gate = new Promise((resolve) => (release = resolve));
  env.fetch = async (request) => {
    calls++;
    if (request.url.endsWith("bad")) return new Response("", { status: 503 });
    await gate;
    return new Response("ok");
  };
  const prepare = () =>
    runtime.stageAssets("assets", [
      { url: "https://example.test/app/good" },
      { url: "https://example.test/app/bad" },
    ]);
  let finished = false;
  const a = runtime.publish("v1", prepare).catch(() => (finished = true));
  const b = runtime.publish("v1", prepare).catch(() => {});
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 2);
  assert.equal(finished, false);
  release();
  await Promise.all([a, b]);
  env.fetch = async () => new Response("ok");
  await runtime.publish("v1", prepare);
  assert.equal(stores.get("assets").size, 2);
});
test("bad hashes and incomplete atomic batches never publish release metadata", async () => {
  const { runtime, env, stores } = fixture();
  let committed = false;
  await assert.rejects(
    runtime.publish("bad", async () => {
      await runtime.stageAssets("assets", [
        { url: "https://example.test/app/a", sha256: "0".repeat(64) },
      ]);
      committed = true;
    }),
    /integrity/,
  );
  assert.equal(committed, false);
  assert.equal(stores.get("assets").size, 0);
  env.fetch = async (r) =>
    new Response("", { status: r.url.endsWith("b") ? 503 : 200 });
  await assert.rejects(
    runtime.stageAssets(
      "shell",
      ["a", "b"].map((s) => ({ url: "https://example.test/app/" + s })),
      { atomic: true },
    ),
  );
  assert.equal(stores.get("shell").size, 0);
});
test("cleanup waits for writes; unknown scoped tabs prevent eviction; grace is bounded", async () => {
  const { runtime, env } = fixture();
  let release,
    cleaned = false;
  const task = runtime.publish(
    "v1",
    () => new Promise((resolve) => (release = resolve)),
  );
  const cleanup = runtime.cleanup(async () => (cleaned = true));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(cleaned, false);
  release();
  await task;
  await cleanup;
  assert.equal(cleaned, true);
  env.clients.matchAll = async () => [
    { id: "old", url: "https://example.test/app/" },
    { id: "outside", url: "https://example.test/other/" },
  ];
  assert.equal(await runtime.protectedClients(["v2"], async () => null), null);
  const state = await runtime.protectedClients(["v2"], async (id) =>
    id === "old" ? ["v1"] : null,
  );
  assert.deepEqual([...state.keep], ["v2", "v1"]);
  assert.equal(state.live.length, 1);
  assert.equal(runtime.recent(0, 600000), false);
  assert.equal(runtime.recent(1, 600000), true);
});
test("navigation skips partial/corrupt candidates and pins the chosen complete fallback", async () => {
  const { runtime } = fixture();
  let remembered;
  const response = await runtime.navigate(
    {
      request: new Request("https://example.test/app/"),
      resultingClientId: "new",
    },
    {
      latest: async () => {
        throw Error("offline");
      },
      candidates: async () => ["corrupt", "partial", "valid"],
      load: async (id) => {
        if (id === "corrupt") throw Error("broken JSON");
        return { id };
      },
      document: async (p) => (p.id === "valid" ? new Response("v1") : null),
      remember: async (id, pack) => (remembered = [id, pack.id]),
    },
  );
  assert.equal(await response.text(), "v1");
  assert.deepEqual(remembered, ["new", "valid"]);
});
test("deadline aborts fetches and failed install never activates an incomplete release", async () => {
  const { runtime, handlers, env } = fixture();
  let skipped = false;
  await assert.rejects(
    runtime.withDeadline(
      5,
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason)),
        ),
    ),
  );
  env.skipWaiting = async () => (skipped = true);
  runtime.lifecycle(async () => {
    throw Error("missing file");
  });
  let task;
  handlers.install({ waitUntil: (promise) => (task = promise) });
  await assert.rejects(task);
  assert.equal(skipped, false);
});

test("navigation diagnostics hand off only coded results after consent and never replay an opt-out", async () => {
  const { runtime, handlers } = fixture(),
    received = [];
  const adapter = {
    latest: async () => {
      throw Object.assign(Error("PRIVATE URL"), { offlineReason: "integrity" });
    },
    candidates: async () => ["valid"],
    load: async () => ({}),
    document: async () => new Response("ok"),
    remember: async () => {},
  };
  const navigation = (id) =>
    runtime.navigate(
      {
        request: new Request("https://example.test/app/"),
        resultingClientId: id,
      },
      adapter,
    );
  await navigation("yes");
  handlers.message({
    data: { type: "offline-diagnostics", sharing: true },
    source: { id: "yes", postMessage: (x) => received.push(x) },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].outcome, "ready");
  assert.equal(received[0].details.cacheSource, "cache");
  assert(!JSON.stringify(received).includes("PRIVATE"));
  await navigation("no");
  const source = { id: "no", postMessage: (x) => received.push(x) };
  handlers.message({
    data: { type: "offline-diagnostics", sharing: false },
    source,
  });
  handlers.message({
    data: { type: "offline-diagnostics", sharing: true },
    source,
  });
  assert.equal(received.length, 1);
});

test("cached startup never waits for update discovery, and metadata failure does not hide a cached response", async () => {
  const { runtime } = fixture();
  let updateStarted = false,
    release;
  const background = [];
  const response = await runtime.navigate(
    {
      request: new Request("https://example.test/app/"),
      resultingClientId: "new",
      waitUntil: (task) => background.push(task),
    },
    {
      latest: () => {
        updateStarted = true;
        return new Promise((resolve) => (release = resolve));
      },
      candidates: async () => ["valid"],
      load: async () => ({}),
      document: async () => new Response("cached"),
      remember: async () => {
        throw Error("storage denied");
      },
    },
  );
  assert.equal(await response.text(), "cached");
  assert(updateStarted);
  assert.equal(background.length, 1);
  release();
  await background[0];
});
test("stalled cache lookup fails open to the network within a bounded time", async () => {
  const { runtime } = fixture();
  const started = Date.now();
  const response = await runtime.navigate(
    { request: new Request("https://example.test/app/") },
    {
      latest: async () => {},
      candidates: () => new Promise(() => {}),
      load: async () => null,
      document: async () => null,
      remember: async () => {},
    },
  );
  assert.equal(await response.text(), "ok");
  assert(Date.now() - started < 2000);
});

test("exhausted storage tracking still permits a healthy network navigation", async () => {
  const { env } = fixture();
  const runtime = createRuntime(env, "/app/", {
    deadline: () =>
      Promise.reject(
        Object.assign(Error("stalled storage"), { offlineReason: "storage" }),
      ),
  });
  const response = await runtime.navigate(
    { request: new Request("https://example.test/app/") },
    {
      latest: async () => {},
      candidates: async () => [],
      load: async () => null,
      document: async () => null,
      remember: async () => {},
    },
  );
  assert.equal(await response.text(), "ok");
});

test("a slow verified cache remains usable when the network is offline or returns 503", async () => {
  for (const outage of [true, false]) {
    const {env,runtime}=fixture();
    env.fetch=async()=>{if(outage)throw new TypeError('offline');return new Response('outage',{status:503})};
    const response=await runtime.navigate({request:new Request('https://example.test/app/')},{
      candidates:async()=>['saved'],load:async()=>({version:'saved'}),
      document:async()=>{await new Promise(resolve=>setTimeout(resolve,1500));return new Response('verified saved app')},
      remember:async()=>{},latest:async()=>{},
    });
    assert.equal(await response.text(),'verified saved app');
  }
});

test("a late cache lookup never pins the version of a healthy network document", async()=>{
  const {runtime}=fixture();let pinned=false;
  const response=await runtime.navigate({request:new Request('https://example.test/app/')},{
    candidates:async()=>['old'],load:async()=>({}),document:async()=>{await new Promise(resolve=>setTimeout(resolve,1500));return new Response('old')},
    remember:async()=>{pinned=true},latest:async()=>{},
  });
  assert.equal(await response.text(),'ok');await new Promise(resolve=>setTimeout(resolve,400));assert.equal(pinned,false);
});

test("damaged advisory JSON metadata cannot prevent release-cache recovery",async()=>{
  const {runtime,env}=fixture(),cache=await env.caches.open('metadata');
  const store=runtime.jsonStore('metadata',key=>'https://example.test/app/'+key);
  for(const body of ['{broken','null','[]','123']){await cache.put('https://example.test/app/latest',new Response(body));assert.equal(await store.read('latest'),null)}
});

test('complete cached assets support offline byte ranges and HEAD without modifying the stored response',async()=>{
 const{runtime}=fixture();
 for(const [range,status,text]of [['bytes=1-3',206,'bcd'],['bytes=3-',206,'def'],['bytes=-2',206,'ef'],['bytes=50-',416,''],['bytes=-0',416,''],['bytes=4-1',416,''],['bytes=0-1,4-5',200,'abcdef'],['invalid',200,'abcdef']]){
  const response=await runtime.assetResponse(new Request('https://example.test/app/audio',{headers:{Range:range}}),new Response('abcdef'));
  assert.equal(response.status,status,range);assert.equal(await response.text(),text,range);
 }
 const head=await runtime.assetResponse(new Request('https://example.test/app/audio',{method:'HEAD'}),new Response('abcdef',{headers:{'Content-Length':'6'}}));assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),'6');
 const full=await runtime.assetResponse(new Request('https://example.test/app/audio',{headers:{Range:'bytes=0-1','If-Range':'"old"'}}),new Response('abcdef',{headers:{ETag:'"new"'}}));assert.equal(full.status,200);
});


test("readiness verification cannot delete a concurrently repaired response", async () => {
  const {createResources}=require('../index.cjs');
  let deleted=false;
  const env={caches:{open:async()=>({match:async()=>new Response('corrupt'),delete:async()=>{deleted=true}})},addEventListener(){}};
  const offline=createRuntime(env,'/',createResources());
  assert.equal(await offline.verified('app',[{url:'/asset',sha256:'0'.repeat(64)}]),false);
  assert.equal(deleted,false);
});


test("explicit update navigation prefers its verified release over a stale latest pointer", async () => {
 const {env}=fixture(),runtime=createRuntime(env,'/app/');
 const response=await runtime.navigate({request:new Request('https://example.test/app/?__soundtools_update=new'),waitUntil(){}},{candidates:async()=>['old','new'],load:async id=>({id}),document:async pack=>new Response(pack.id),remember:async()=>{},latest:async()=>{}});
 assert.equal(await response.text(),'new');
});


test("a stalled claim cannot hold activation and future navigations indefinitely", async()=>{
 const {env,handlers,runtime}=fixture();env.clients={claim:()=>new Promise(()=>{}),matchAll:async()=>[]};runtime.lifecycle(async()=>{});
 let activated;const start=Date.now();handlers.activate({waitUntil:task=>activated=task});await activated;
 assert(Date.now()-start<3000);
});


test("late worker replies to a closed document cannot reject completed jobs",()=>{
 const {runtime}=fixture();assert.doesNotThrow(()=>runtime.reply({ports:[{postMessage(){throw new DOMException('Context is stopped','InvalidStateError')}}]},{ready:true}));assert.doesNotThrow(()=>runtime.reply({ports:[]},{ready:false}));
});
