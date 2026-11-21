import test from "node:test";
import assert from "node:assert/strict";
import { RequestLifetime } from "../request-lifetime";
for (const boundary of ["beforeunload", "pagehide"])
  test(`${boundary} aborts a held request and prevents later network work until pageshow`, async () => {
    const events = new EventTarget();
    let calls = 0,
      signal!: AbortSignal;
    const lifetime = new RequestLifetime(events, async (_input, init) => {
      calls++;
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    });
    const held = lifetime.fetch("https://account.test/snapshot");
    events.dispatchEvent(new Event(boundary));
    await assert.rejects(held, { name: "AbortError" });
    assert(signal.aborted);
    await assert.rejects(lifetime.fetch("https://account.test/snapshot"), {
      name: "AbortError",
    });
    assert.equal(calls, 1);
    events.dispatchEvent(new Event("pageshow"));
    const restored = lifetime.fetch("https://account.test/snapshot");
    assert.equal(calls, 2);
    assert(!signal.aborted);
    events.dispatchEvent(new Event("pagehide"));
    await assert.rejects(restored, { name: "AbortError" });
  });
test("caller cancellation and genuine live fetch failures are preserved", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  let calls = 0;
  const failure = new TypeError("Live network failure");
  const lifetime = new RequestLifetime(new EventTarget(), async () => {
    calls++;
    throw failure;
  });
  await assert.rejects(
    lifetime.fetch("https://account.test/snapshot", {
      signal: cancelled.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
  await assert.rejects(
    lifetime.fetch("https://account.test/snapshot"),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
});

test("RequestInit cancellation overrides the Request signal using native fetch semantics", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const input = new Request("https://account.test/snapshot", {
    signal: cancelled.signal,
  });
  let calls = 0;
  const lifetime = new RequestLifetime(new EventTarget(), async () => {
    calls++;
    return new Response("ok");
  });
  await assert.rejects(lifetime.fetch(input), { name: "AbortError" });
  assert.equal(calls, 0);
  assert.equal(
    await (
      await lifetime.fetch(input, { signal: new AbortController().signal })
    ).text(),
    "ok",
  );
  assert.equal(
    await (await lifetime.fetch(input, { signal: null })).text(),
    "ok",
  );
  assert.equal(calls, 2);
});
