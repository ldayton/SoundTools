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
  account.engine = { change: async () => {} };
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
