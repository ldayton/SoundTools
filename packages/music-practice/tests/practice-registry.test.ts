import test from "node:test";
import assert from "node:assert/strict";
import {
  createPracticeRegistry,
  mountPracticeSurface,
  registerPracticeOptions,
  setSidebarSelection,
} from "../src/practice-surfaces";
const element = (id: string) =>
  ({ id, replaceChildren() {} }) as unknown as HTMLElement;
test("practice registrations belong to one app and stale cleanup cannot erase a replacement", () => {
  const first = createPracticeRegistry(),
    second = createPracticeRegistry();
  const host = element("practice"),
    other = element("practice");
  first.bind(host);
  second.bind(other);
  const stale = mountPracticeSurface(host, "old");
  const dispose = mountPracticeSurface(host, "new");
  registerPracticeOptions(host, "options");
  setSidebarSelection(host, "hymns");
  mountPracticeSurface(other, "other app");
  stale();
  assert.equal(first.getSnapshot().views[0].content, "new");
  assert.equal(second.getSnapshot().views[0].content, "other app");
  dispose();
  dispose();
  assert.deepEqual(first.getSnapshot(), {
    views: [],
    options: [],
    selection: null,
  });
  first.dispose();
  assert.throws(
    () => mountPracticeSurface(host, "detached"),
    /No React practice host/,
  );
  second.dispose();
});
