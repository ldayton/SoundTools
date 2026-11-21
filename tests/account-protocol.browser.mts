/** Actual local Postgres/Auth/Realtime protocol contract; never uses production. */
import { waitForRealtimeReplication } from "../scripts/ci/realtime.cjs";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const { env } = JSON.parse(
  await readFile(
    new URL("../work/account-local-status.json", import.meta.url),
    "utf8",
  ),
);
assert(env.API_URL.startsWith("http://127.0.0.1:"));
const admin = createClient(env.API_URL, env.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const generated = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: "owner@soundtools.test",
});
assert.ifError(generated.error);
const owner = createClient(env.API_URL, env.PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await owner.auth.verifyOtp({
  email: "owner@soundtools.test",
  token: generated.data.properties.email_otp,
  type: "email",
});
assert.ifError(auth.error);
const user = auth.data.user!.id,
  app = "notewise",
  node = crypto.randomUUID(),
  key = `protocol:${crypto.randomUUID()}`;
async function rpc(name: string, args: object) {
  const result = await owner.rpc(name, args);
  assert.ifError(result.error);
  return result.data;
}
const channels: ReturnType<typeof owner.channel>[] = [];
try {
  const initial = await rpc("account_initialize", {
    p_app: app,
    p_records: { schema: 1 },
    p_device: node,
  });
  const snapshot = await rpc("account_snapshot_v2", {
    p_app: app,
    p_since: null,
  });
  const now = snapshot.serverTime;
  let notifications = 0;
  let realtimeStatus = "joining";
  const live = owner.channel(`account:${user}:${app}`, {
    config: { private: true },
  });
  channels.push(live);
  live.on("broadcast", { event: "changed" }, () => notifications++);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Realtime subscription timed out")),
      20000,
    );
    live.subscribe((status, error) => {
      realtimeStatus = status;
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        reject(error || Error(status));
      }
    });
  });
  // Joining the websocket can precede the separate WAL broadcast connection.
  // Observe the backend-owned boundary before issuing any tested writes.
  await waitForRealtimeReplication(env);
  console.log(
    "Realtime: private channel subscribed and database broadcast replication ready",
  );
  const args = {
    p_app: app,
    p_key: key,
    p_value: 100,
    p_revision: 0,
    p_operation: crypto.randomUUID(),
    p_device: node,
    p_stamp: { time: now - 1000, counter: 0, node },
  };
  const first = await rpc("account_write_v2", args);
  assert.equal(first.applied, true);
  const second = await rpc("account_write_v2", {
    ...args,
    p_revision: first.row.revision,
    p_value: 120,
    p_operation: crypto.randomUUID(),
    p_stamp: { time: now - 500, counter: 0, node },
  });
  assert.equal(second.applied, true);
  const stale = await rpc("account_write_v2", {
    ...args,
    p_revision: second.row.revision,
    p_value: 90,
    p_operation: crypto.randomUUID(),
  });
  assert.equal(stale.applied, false);
  assert.equal(stale.row.value, 120);
  const duplicate = await rpc("account_write_v2", args);
  assert.equal(duplicate.applied, true);
  assert.equal(duplicate.row.value, 120);
  const mismatch = await owner.rpc("account_write_v2", {
    ...args,
    p_value: 999,
  });
  assert.equal(mismatch.error?.code, "22023");
  const delta = await rpc("account_snapshot_v2", {
    p_app: app,
    p_since: snapshot.cursor,
  });
  assert.ok(delta.rows.every((row: any) => row.sequence > snapshot.cursor));
  assert.equal(delta.rows.find((row: any) => row.key === key)?.value, 120);
  const none = await rpc("account_snapshot_v2", {
    p_app: app,
    p_since: delta.cursor,
  });
  assert.equal(none.rows.length, 0);
  await rpc("account_write_v2", {
    ...args,
    p_revision: second.row.revision,
    p_value: null,
    p_operation: crypto.randomUUID(),
    p_stamp: { time: now, counter: 0, node },
  });
  const deleted = await rpc("account_snapshot_v2", {
    p_app: app,
    p_since: delta.cursor,
  });
  assert.equal(deleted.rows.find((row: any) => row.key === key)?.value, null);
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (notifications > 0) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > 10000) {
        clearInterval(timer);
        reject(
          Error(
            `No private change notification (channel=${live.state}, status=${realtimeStatus})`,
          ),
        );
      }
    }, 50);
  });
  const forbidden = owner.channel(`account:${crypto.randomUUID()}:${app}`, {
    config: { private: true },
  });
  channels.push(forbidden);
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 15000);
    forbidden.subscribe((status) => {
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
  assert.notEqual(
    status,
    "SUBSCRIBED",
    "private invalidations must not leak to another account topic",
  );
  console.log(
    "PASS: real Postgres HLC ordering, CAS, idempotent replay/mismatch, incremental cursors, tombstones, private realtime notifications and topic isolation",
  );
} finally {
  for (const channel of channels) await owner.removeChannel(channel);
  await owner.auth.signOut();
  owner.realtime.disconnect();
  admin.realtime.disconnect();
}
