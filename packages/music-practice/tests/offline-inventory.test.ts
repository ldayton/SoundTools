import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { offlineWorker, MAX_OFFLINE_FILES } from "../scripts/offline-worker";

type Pack = Parameters<typeof offlineWorker>[0]["pack"];

function validate(count: number, patch?: (pack: Pack) => void) {
  const pack: Pack = {
    shellCache: "notewise-shell-1234567890abcdef",
    files: Array.from({ length: count }, (_, i) => ({
      url: i === 0 ? "/" : `/assets/file-${i}.flac`,
      sha256: "0".repeat(64),
    })),
  };
  patch?.(pack);
  return vm.runInNewContext(
    offlineWorker({ app: "notewise", base: "/", pack, inventory: "/offline-pack.json" }) +
      "\nvalid(CONFIG.pack)",
    {
      self: {
        location: { origin: "https://example.test" },
        registration: {},
        addEventListener() {},
      },
      URL, Request, Response, AbortController, TextEncoder, TextDecoder,
      setTimeout, clearTimeout,
    },
  );
}

test("generated worker accepts backing sample libraries above 256 files within the shared shell limit", () => {
  assert.equal(validate(321), true);
  assert.equal(validate(MAX_OFFLINE_FILES), true);
  assert.equal(validate(MAX_OFFLINE_FILES + 1), false);
});

test("larger inventories still reject foreign URLs, duplicates and invalid hashes", () => {
  assert.equal(validate(321, p => { p.files[320].url = "https://untrusted.test/file"; }), false);
  assert.equal(validate(321, p => { p.files[320].url = p.files[1].url; }), false);
  assert.equal(validate(321, p => { p.files[320].sha256 = "invalid"; }), false);
});
