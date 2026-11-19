import test from "node:test";
import assert from "node:assert/strict";
import { Account } from "../client";
test("continuous persistence writes cannot starve the automatic upload window", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const account: any = new Account("test");
  let value = 0,
    uploads = 0;
  account.binding = { read: () => ({ tempo: value }) };
  account.captured = { tempo: 0 };
  account.applied = { tempo: 0 };
  account.engine = { state: { device: "test" }, change: async () => {} };
  account.sync = async () => {
    uploads++;
  };
  for (let i = 0; i < 12; i++) {
    value++;
    await account.changed();
    t.mock.timers.tick(50);
  }
  assert.equal(
    uploads,
    3,
    "upload starts every 200ms even while saves continue",
  );
});
test("a sync requested during an in-flight pass runs again without overlapping requests", async () => {
  const account: any = new Account("test");
  account.engine = {};
  let calls = 0,
    active = 0,
    peak = 0,
    release!: () => void;
  account.synchronize = async () => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    if (calls === 1) await new Promise<void>((r) => (release = r));
    active--;
  };
  const first = account.sync();
  const second = account.sync();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(peak, 1);
});

test("unrelated incoming settings apply without pausing or rebuilding an active session", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null },
  });
  try {
    const account: any = new Account("test");
    let local = { safe: 1, active: 1 },
      paused = 0,
      rebuilds = 0;
    account.bound = true;
    account.applied = { ...local };
    account.captured = { ...local };
    account.engine = {
      state: { initialized: true },
      records: { safe: 2, active: 2 },
    };
    account.binding = {
      read: () => local,
      canApply: () => false,
      pause: () => paused++,
      apply: () => rebuilds++,
      applyPartial: async (records: any) => {
        local.safe = records.safe;
        return ["safe"];
      },
    };
    await account.apply();
    assert.equal(local.safe, 2);
    assert.equal(local.active, 1);
    assert.equal(paused, 0);
    assert.equal(rebuilds, 0);
    assert.equal(account.getSnapshot().updates, true);
    account.binding.canApply = () => true;
    await account.apply();
    assert.equal(paused, 1);
    assert.equal(rebuilds, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete (globalThis as any).document;
  }
});
