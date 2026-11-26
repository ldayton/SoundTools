/** Manual model/runtime conformance experiment; no application assets change. */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
  browserName,
} from "../../../../scripts/ci/browser-harness.cjs";
const root = resolve(process.argv[2] ?? "work/neural-piano");
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url!, "http://local").pathname);
    if (path === "/") {
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><title>Piano inference conformance</title>");
      return;
    }
    const file = resolve(root, "." + path);
    if (!file.startsWith(root + "/")) {
      res.statusCode = 403;
      res.end();
      return;
    }
    res.setHeader(
      "content-type",
      (
        {
          ".mjs": "text/javascript",
          ".js": "text/javascript",
          ".wasm": "application/wasm",
          ".json": "application/json",
        } as Record<string, string>
      )[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("No server address");
const browser = await launchBrowser();
try {
  const page = await newPage(browser),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:" + address.port);
  const result = await page.evaluate(async () => {
    // Deliberately no CDN, GPU, audio, product code or prediction API from upstream.
    const runtimeUrl =
      "/runtime/node_modules/onnxruntime-web/dist/ort.wasm.min.mjs";
    const ort = await import(runtimeUrl);
    ort.env.wasm.numThreads = 1;
    const probes = await (await fetch("/onnx-probe.json")).json();
    const begin = performance.now();
    const sessions: Record<string, any> = {};
    for (const hand of ["left", "right"])
      sessions[hand] = await ort.InferenceSession.create(
        "/upstream/lumikey/js/models/fingering_transformer_" + hand + ".onnx",
        { executionProviders: ["wasm"] },
      );
    const loadMs = performance.now() - begin;
    let maxError = 0,
      matches = 0;
    const times: number[] = [];
    for (const probe of probes) {
      const start = performance.now();
      const out = await sessions[probe.hand].run({
        tokens: new ort.Tensor(
          "float32",
          new Float32Array(probe.tokens),
          [1, 26, 5],
        ),
      });
      times.push(performance.now() - start);
      const actual = Array.from(out.logits.data) as number[];
      maxError = Math.max(
        maxError,
        ...actual.map((v, i) => Math.abs(v - probe.logits[i])),
      );
      if (
        actual.indexOf(Math.max(...actual)) ===
        probe.logits.indexOf(Math.max(...probe.logits))
      )
        matches++;
    }
    for (const session of Object.values(sessions))
      await (session as any).release();
    const sorted = times.slice(2).sort((a, b) => a - b);
    return {
      probes: probes.length,
      matches,
      maxError,
      loadMs,
      medianInferenceMs: sorted[Math.floor(sorted.length / 2)],
      p95InferenceMs: sorted[Math.floor(sorted.length * 0.95)],
      times,
    };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.matches, result.probes);
  assert.ok(result.maxError < 1e-3, JSON.stringify(result));
  const report = { browser: browserName(), onnxruntime: "1.23.2", ...result };
  await writeFile(
    resolve(root, "browser-" + browserName() + ".json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  await new Promise<void>((r) => server.close(() => r()));
}
