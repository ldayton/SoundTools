import test from "node:test";
import assert from "node:assert/strict";
import { FeedbackAdvance } from "../src/feedback-advance";
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("navigation during a save cannot schedule feedback advancement after returning", async () => {
  let saved!: (value: boolean) => void;
  const commit = new Promise<boolean>((resolve) => {
    saved = resolve;
  });
  const advance = new FeedbackAdvance();
  let calls = 0;
  advance.schedule(
    commit,
    1,
    () => true,
    () => calls++,
  );
  advance.cancel();
  saved(true);
  await settle();
  assert.equal(calls, 0);
});

test("interruptions cancel scheduled transitions and a later answer advances normally", async () => {
  const advance = new FeedbackAdvance();
  let calls = 0;
  advance.schedule(
    Promise.resolve(true),
    1,
    () => true,
    () => calls++,
  );
  await Promise.resolve();
  advance.cancel();
  await settle();
  assert.equal(calls, 0);
  advance.schedule(
    Promise.resolve(true),
    1,
    () => true,
    () => calls++,
  );
  await settle();
  assert.equal(calls, 1);
});

test("blocked input or failed persistence leaves feedback in place", async () => {
  const advance = new FeedbackAdvance();
  let eligible = true,
    calls = 0;
  advance.schedule(
    Promise.resolve(true),
    1,
    () => eligible,
    () => calls++,
  );
  await Promise.resolve();
  eligible = false;
  await settle();
  advance.schedule(
    Promise.resolve(false),
    1,
    () => true,
    () => calls++,
  );
  await settle();
  assert.equal(calls, 0);
});
