const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { webcrypto } = require("node:crypto");
const { createResources } = require("../index.cjs");
test("resource loader retries transient failures and verifies exact bytes and SHA before returning", async () => {
  let calls = 0,
    retries = 0;
  const bytes = new TextEncoder().encode("verified");
  const loader = createResources({
    crypto: webcrypto,
    fetch: async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 503 });
      if (calls === 2) return new Response("corrupt!");
      return new Response(bytes);
    },
  });
  const sha256 = await loader.digest(bytes);
  assert.deepEqual(
    new Uint8Array(
      await loader.fetchBytes("https://example.test/a", {
        bytes: bytes.length,
        sha256,
        retryMs: 1,
        onRetry: () => retries++,
      }),
    ),
    bytes,
  );
  assert.equal(calls, 3);
  assert.equal(retries, 2);
});
test("stall detection bounds body reads, and client cancellation never retries", async () => {
  let attempts = 0;
  const loader = createResources({
    crypto: webcrypto,
    fetch: async () => {
      attempts++;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
        }),
      );
    },
  });
  await assert.rejects(
    loader.fetchBytes("https://example.test/a", {
      idleMs: 10,
      timeoutMs: 500,
      attempts: 2,
      retryMs: 1,
    }),
    (e) => e.offlineReason === "timeout",
  );
  assert.equal(attempts, 2);
  const controller = new AbortController();
  controller.abort(new DOMException("cancel", "AbortError"));
  await assert.rejects(
    loader.fetchBytes("https://example.test/a", { signal: controller.signal }),
    (e) => e.name === "AbortError",
  );
  assert.equal(attempts, 2);
});
test("nonretryable HTTP failures do not loop; hard deadlines reject a non-abortable storage wait", async () => {
  let attempts = 0;
  const loader = createResources({
    crypto: webcrypto,
    fetch: async () => {
      attempts++;
      return new Response("", { status: 404 });
    },
  });
  await assert.rejects(
    loader.fetchBytes("https://example.test/a"),
    (e) => e.offlineReason === "unavailable",
  );
  assert.equal(attempts, 1);
  let finish;
  await assert.rejects(
    loader.deadline(10, () => new Promise((resolve) => (finish = resolve))),
    (e) => e.offlineReason === "timeout",
  );
  assert(loader.busy());
  finish();
  await Promise.resolve();
  await Promise.resolve();
  assert(!loader.busy());
});
