import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, readRoute } from "../src/navigation";
test("every exercise has one unique route and a readable title", () => {
  assert.equal(new Set(EXERCISES.map((e) => e.path)).size, EXERCISES.length);
  assert.equal(new Set(EXERCISES.map((e) => e.mode)).size, EXERCISES.length);
  for (const e of EXERCISES)
    for (const path of [e.path, e.path + "/"]) {
      const route = readRoute(new URL(path, "https://notes.test"), "staff");
      assert.equal(route.kind, "exercise");
      if (route.kind === "exercise") assert.equal(route.mode, e.mode);
    }
});
test("root remembers practice; settings and unknown pages are independent of exercise state", () => {
  assert.deepEqual(readRoute(new URL("https://notes.test/settings"), "piano"), {
    kind: "settings",
  });
  const root = readRoute(new URL("https://notes.test/"), "rhythm");
  assert.equal(root.kind, "exercise");
  if (root.kind === "exercise") assert.equal(root.mode, "rhythm");
  const hymn = readRoute(
    new URL("https://notes.test/piano/hymns/amazing-grace?section=3"),
    "staff",
  );
  assert.equal(hymn.kind, "exercise");
  if (hymn.kind === "exercise") {
    assert.equal(hymn.hymn, "amazing-grace");
    assert.equal(hymn.query.get("section"), "3");
  }
  for (const path of [
    "/missing",
    "/piano/keys/extra",
    "/assets/no.js",
    "/piano/hymns/a%2Fb",
  ])
    assert.deepEqual(readRoute(new URL(path, "https://notes.test"), "staff"), {
      kind: "not-found",
    });
});
