import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { captureAccountLink } from "../link";
test("early classic bootstrap strips tokens before later scripts and preserves the one-time handoff", () => {
  const location = {
    pathname: "/auth/confirm",
    hash: "#token_hash=example&type=email",
  };
  const env = {
    location,
    history: {
      replaceState(_state: unknown, _title: string, path: string) {
        assert.equal(path, "/");
        location.pathname = path;
        location.hash = "";
      },
    },
  };
  // Exercise the exact generated browser asset, not a separately copied snippet.
  vm.runInNewContext(`(${captureAccountLink.toString()})();`, {
    ...env,
    URLSearchParams,
    globalThis: env,
  });
  assert.equal(location.hash, "");
  assert.equal(
    (env as typeof env & { __soundtoolsAccountConfirmation: boolean })
      .__soundtoolsAccountConfirmation,
    true,
  );
  assert.equal(captureAccountLink(env), "example");
  assert.equal(
    captureAccountLink({
      location: { pathname: "/settings", hash: "#notes" },
      history: env.history,
    }),
    null,
  );
});
