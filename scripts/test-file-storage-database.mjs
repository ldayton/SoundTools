import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const { env } = JSON.parse(
  readFileSync("work/account-local-status.json", "utf8"),
);
assert(
  new URL(env.API_URL).hostname === "127.0.0.1",
  "Local storage tests only",
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SECRET_KEY, options);
async function login(email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw error;
  const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, options);
  const verified = await client.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: "email",
  });
  if (verified.error) throw verified.error;
  return { client, user: verified.data.user.id };
}
const owner = await login("owner@soundtools.test");
await admin.auth.admin.createUser({
  email: "unapproved@soundtools.test",
  email_confirm: true,
});
const denied = await login("unapproved@soundtools.test");
const guest = createClient(env.API_URL, env.PUBLISHABLE_KEY, options);
const created = [];
const reserve = (client, extra = {}) =>
  client.rpc("media_reserve", {
    p_app: "soundglow",
    p_fingerprint: "sha256-tree-v1:" + randomBytes(32).toString("hex"),
    p_name: "Policy test.wav",
    p_mime: "audio/wav",
    p_bytes: 4,
    p_details: { duration: 1 },
    ...extra,
  });
try {
  const result = await reserve(owner.client);
  assert.ifError(result.error);
  const file = result.data;
  created.push(file);
  const path = `${owner.user}/soundglow/${file.id}`;
  assert(
    (await owner.client.rpc("media_finish", { p_id: file.id })).error,
    "cannot claim an unfinished upload is ready",
  );
  assert(
    (await reserve(denied.client)).error,
    "unapproved authenticated users cannot reserve files",
  );
  assert(
    (await guest.rpc("media_snapshot", { p_app: "soundglow" })).error,
    "anonymous catalogue access denied",
  );
  assert(
    (await denied.client.rpc("media_snapshot", { p_app: "soundglow" })).error,
    "unapproved catalogue access denied",
  );
  assert(
    (
      await denied.client.storage
        .from("soundtools-files")
        .upload(path, new Uint8Array(4))
    ).error,
    "cross-owner upload denied",
  );
  assert(
    (
      await owner.client.storage
        .from("soundtools-files")
        .upload(`${owner.user}/soundglow/unreserved`, new Uint8Array(4))
    ).error,
    "objects require a reserved catalogue record",
  );
  const uploaded = await owner.client.storage
    .from("soundtools-files")
    .upload(path, new Uint8Array([1, 2, 3, 4]), { contentType: "audio/wav" });
  assert.ifError(uploaded.error);
  assert(
    (await denied.client.storage.from("soundtools-files").download(path)).error,
    "cross-owner download denied",
  );
  assert(
    (await guest.storage.from("soundtools-files").download(path)).error,
    "anonymous download denied",
  );
  const publicUrl = owner.client.storage
    .from("soundtools-files")
    .getPublicUrl(path).data.publicUrl;
  assert.notEqual(
    (await fetch(publicUrl)).status,
    200,
    "private objects cannot be served through the public endpoint",
  );
  assert(
    (
      await owner.client.storage.updateBucket("soundtools-files", {
        public: true,
      })
    ).error,
    "browser users cannot make the bucket public",
  );
  assert(
    (
      await owner.client.storage.createBucket("unexpected-public-bucket", {
        public: true,
      })
    ).error,
    "browser users cannot create public buckets",
  );
  for (const [method, args] of [
    ["media_rename", { p_id: file.id, p_name: "forged" }],
    ["media_delete", { p_id: file.id }],
    ["media_finish", { p_id: file.id }],
    ["media_pending_deletes", { p_app: "soundglow" }],
  ]) {
    assert(
      (await denied.client.rpc(method, args)).error,
      "unapproved users cannot invoke " + method,
    );
  }
  await owner.client.storage.from("soundtools-files").remove([path]);
  assert.ifError(
    (await owner.client.storage.from("soundtools-files").download(path)).error,
    "bytes cannot be deleted without a tombstone",
  );
  const snapshot = await owner.client.rpc("media_snapshot", {
    p_app: "soundglow",
  });
  assert.ifError(snapshot.error);
  assert.equal(
    snapshot.data.find((f) => f.id === file.id).state,
    "ready",
    "snapshot recovers upload completed before catalogue confirmation",
  );
  const duplicate = await reserve(owner.client, {
    p_fingerprint: file.fingerprint,
  });
  assert.ifError(duplicate.error);
  assert.equal(
    duplicate.data.id,
    file.id,
    "concurrent imports reuse the same content",
  );
  assert(
    (
      await owner.client.storage
        .from("soundtools-files")
        .upload(path, new Uint8Array(4), { upsert: true })
    ).error,
    "immutable audio cannot be overwritten",
  );
  assert(
    (await reserve(owner.client, { p_bytes: 52428801 })).error,
    "50 MB cap enforced in database",
  );
  assert(
    (
      await owner.client
        .from("media_files")
        .update({ state: "ready" })
        .eq("id", file.id)
    ).error,
    "client cannot directly forge transfer state",
  );
  const renamed = await owner.client.rpc("media_rename", {
    p_id: file.id,
    p_name: "Renamed.wav",
  });
  assert.ifError(renamed.error);
  assert.equal(renamed.data.name, "Renamed.wav");
  const stamp = { time: Date.now() + 1000, counter: 1, node: crypto.randomUUID() };
  const currentName = await owner.client.rpc("media_rename_v2", {
    p_id: file.id, p_name: "Latest.wav", p_stamp: stamp,
  });
  assert.ifError(currentName.error);
  assert.equal(currentName.data.name, "Latest.wav");
  const staleName = await owner.client.rpc("media_rename_v2", {
    p_id: file.id, p_name: "Stale.wav", p_stamp: { ...stamp, time: stamp.time - 1000 },
  });
  assert.ifError(staleName.error);
  assert.equal(staleName.data.name, "Latest.wav", "stale offline rename cannot replace newer intent");

  assert.ifError(
    (await owner.client.rpc("media_delete", { p_id: file.id })).error,
  );
  assert(
    (await owner.client.rpc("media_finish", { p_id: file.id })).error,
    "late completion cannot resurrect a deleted file",
  );
  assert.ifError(
    (await owner.client.storage.from("soundtools-files").remove([path])).error,
  );
  assert(
    (
      await owner.client.storage
        .from("soundtools-files")
        .upload(path, new Uint8Array(4))
    ).error,
    "old upload paths stay retired",
  );
  assert(
    (await reserve(owner.client, { p_fingerprint: file.fingerprint })).error,
    "a lost reservation response cannot resurrect deleted content",
  );
  const replacement = await reserve(owner.client, {
    p_previous_delete: file.id,
    p_fingerprint: file.fingerprint,
  });
  assert.ifError(replacement.error);
  created.push(replacement.data);
  assert.notEqual(
    replacement.data.id,
    file.id,
    "explicit reimport gets a new immutable path",
  );
  console.log(
    "Native file policies: owner-only access, reservation, size limit, immutable objects, recovery, deduplication and deletion fencing passed",
  );
} finally {
  await admin.storage
    .from("soundtools-files")
    .remove(created.map((f) => `${owner.user}/soundglow/${f.id}`));
  // Local fixture cleanup; production clients have no table-write privileges.
  await admin
    .from("media_files")
    .delete()
    .in(
      "id",
      created.map((f) => f.id),
    );
}
