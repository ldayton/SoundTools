import test from "node:test";
import assert from "node:assert/strict";
import { RendererLifetime } from "../src/renderer-lifetime";

test("disposing removes listeners; remounting does not duplicate input", () => {
  const target = new EventTarget() as unknown as HTMLElement;
  let calls = 0;
  const first = new RendererLifetime();
  first.listen(target, "click", () => calls++);
  target.dispatchEvent(new Event("click"));
  first.dispose();
  first.dispose();
  target.dispatchEvent(new Event("click"));
  assert.equal(calls, 1);
  const second = new RendererLifetime();
  second.listen(target, "click", () => calls++);
  target.dispatchEvent(new Event("click"));
  assert.equal(calls, 2);
  second.dispose();
});

test("resize notifications coalesce and queued drawing cannot outlive disposal", () => {
  const original = {
    ResizeObserver: globalThis.ResizeObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let notify!: () => void,
    disconnected = 0,
    drawings = 0,
    next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      notify = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {
      disconnected++;
    }
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++next, callback);
    return next;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  try {
    const lifetime = new RendererLifetime();
    lifetime.observe({} as Element, () => drawings++);
    notify();
    notify();
    assert.equal(frames.size, 1);
    const callback = [...frames.values()][0];
    frames.clear();
    callback(0);
    assert.equal(drawings, 1);
    notify();
    const staleCallback = [...frames.values()][0];
    lifetime.dispose();
    assert.equal(disconnected, 1);
    assert.equal(frames.size, 0);
    staleCallback(0);
    notify();
    assert.equal(drawings, 1);
    assert.equal(frames.size, 0);
    let immediate = 0;
    lifetime.add(() => immediate++);
    assert.equal(immediate, 1);
  } finally {
    Object.assign(globalThis, original);
  }
});
