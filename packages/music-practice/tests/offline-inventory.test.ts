import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { offlineWorker, MAX_OFFLINE_FILES } from "../scripts/offline-worker";

type Pack = Parameters<typeof offlineWorker>[0]["pack"];

function validate(count: number, patch?: (pack: Pack) => void) {
  const pack: Pack = {
    shellCache: "notewise-shell-1234567890abcdef",
    files: Array.from({ length: count }, (_, i) => ({
      url: i === 0 ? "/" : `/assets/file-${i}.flac`,
      sha256: "0".repeat(64),
    })),
  };
  patch?.(pack);
  return vm.runInNewContext(
    offlineWorker({ app: "notewise", base: "/", pack, inventory: "/offline-pack.json" }) +
      "\nvalid(CONFIG.pack)",
    {
      self: {
        location: { origin: "https://example.test" },
        registration: {},
        addEventListener() {},
      },
      URL, Request, Response, AbortController, TextEncoder, TextDecoder,
      setTimeout, clearTimeout,
    },
  );
}

test("generated worker accepts backing sample libraries above 256 files within the shared shell limit", () => {
  assert.equal(validate(321), true);
  assert.equal(validate(1400), true);
  assert.equal(validate(MAX_OFFLINE_FILES), true);
  assert.equal(validate(MAX_OFFLINE_FILES + 1), false);
});

test("larger inventories still reject foreign URLs, duplicates and invalid hashes", () => {
  assert.equal(validate(321, p => { p.files[320].url = "https://untrusted.test/file"; }), false);
  assert.equal(validate(321, p => { p.files[320].url = p.files[1].url; }), false);
  assert.equal(validate(321, p => { p.files[320].sha256 = "invalid"; }), false);
});

async function workerFixture(documentVersion: string) {
  const { webcrypto } = await import("node:crypto");
  const shellCache = "notewise-shell-1234567890abcdef";
  const html = `<head><meta name="practice-shell" content="${documentVersion}"></head>`;
  const pack = {shellCache, files: [{url: "/", sha256: Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(html))).toString("hex")}]};
  const stores = new Map<string, Map<string, Response>>();
  const requests: {url: string; cache: string}[] = [];
  const caches = {
    has: async (name: string) => stores.has(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name)!;
      return {
        match: async (key: string) => data.get(key)?.clone(),
        put: async (key: string, value: Response) => { data.set(key, value.clone()); },
        delete: async (key: string) => data.delete(key),
      };
    },
  };
  const scope = vm.createContext({
    self: {
      location: {origin: "https://example.test"}, registration: {active: {}},
      crypto: webcrypto, caches, addEventListener() {},
      fetch: async (url: string, options: RequestInit) => {
        requests.push({url, cache: options.cache!});
        // The HTTP cache holds a prior deployment's inventory. Discovery must
        // use the network, while immutable asset fetches keep their own policy.
        return new Response(url === "/offline-pack.json"
          ? JSON.stringify(options.cache === "no-store" ? pack : {...pack, files: []}) : html);
      },
    },
    caches, URL, Request, Response, Headers, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  });
  vm.runInContext(offlineWorker({app: "notewise", base: "/", pack, inventory: "/releases/pinned/offline-pack.json"}), scope);
  return {scope, stores, requests, pack};
}

test("update discovery bypasses a stale HTTP inventory and commits a fully verified copy", async () => {
  const f = await workerFixture("notewise-shell-1234567890abcdef");
  const result = await vm.runInContext("latest()", f.scope);
  assert.equal(result.shellCache, f.pack.shellCache);
  assert.equal(f.requests[0].cache, "no-store");
  assert(f.stores.get(f.pack.shellCache)?.has("/offline-pack.json"));
  assert(f.stores.get("notewise-clients-v1")?.has("https://example.test/__offline_client__/latest"));
});

test("a hash-valid document belonging to another release never commits its inventory or latest pointer", async () => {
  const f = await workerFixture("notewise-shell-fedcba0987654321");
  await assert.rejects(vm.runInContext("latest()", f.scope), (error: any) => {
    assert.equal(error.offlineReason, "integrity");
    assert.equal(error.cacheStage, "document_validation");
    return true;
  });
  assert(!f.stores.get(f.pack.shellCache)?.has("/offline-pack.json"));
  assert(!f.stores.get("notewise-clients-v1")?.has("https://example.test/__offline_client__/latest"));
});
