import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { loginHandler } from "../server";
async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
test("login enforces approval and origin on the server and fixes the redirect for streamed and Vercel-parsed bodies", async () => {
  const requests: { url: string; body: any }[] = [];
  const upstream = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    requests.push({ url: req.url!, body: JSON.parse(body) });
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
  const upstreamUrl = await listen(upstream);
  let appUrl = "";
  const server = createServer((req, res) => {
    if (req.url === "/parsed")
      (req as any).body = { email: " OWNER@soundtools.test " };
    void loginHandler({
      SUPABASE_URL: upstreamUrl,
      SUPABASE_PUBLISHABLE_KEY: "test-public-key",
      ACCOUNT_APP_URL: appUrl,
      ACCOUNT_APPROVED_EMAIL: "owner@soundtools.test",
    })(req, res);
  });
  appUrl = await listen(server);
  const send = (email: string, origin = appUrl, path = "/") =>
    fetch(appUrl + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, redirect: "https://attacker.example" }),
    });
  try {
    assert.equal((await fetch(appUrl)).status, 405);
    const denied = await send("other@soundtools.test");
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, "Not on approved list.");
    assert.equal(
      (await send("owner@soundtools.test", "https://attacker.example")).status,
      403,
    );
    assert.equal((await send("x".repeat(1100))).status, 413);
    assert.equal(requests.length, 0);
    assert.equal((await send(" OWNER@soundtools.test ")).status, 200);
    assert.equal(
      (await send("ignored", "http://wrong.example", "/parsed")).status,
      403,
    );
    assert.equal((await send("ignored", appUrl, "/parsed")).status, 200);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.body.email, "owner@soundtools.test");
      assert.equal(request.body.create_user, false);
      assert.equal(
        new URL(request.url, upstreamUrl).searchParams.get("redirect_to"),
        appUrl + "/auth/confirm",
      );
    }
    const local = appUrl.replace("127.0.0.1", "localhost");
    assert.equal((await send("owner@soundtools.test", local)).status, 200);
    assert.equal(
      new URL(requests.at(-1)!.url, upstreamUrl).searchParams.get(
        "redirect_to",
      ),
      local + "/auth/confirm",
    );
    assert.equal(
      (await send("owner@soundtools.test", "http://localhost:1")).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    upstream.closeAllConnections();
    server.close();
    upstream.close();
  }
});
