import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadPianoBenchmark } from "../../test-fixtures/piano-benchmark";
import { hybridCandidateSet } from "../../test-fixtures/piano-hybrid-ranking";
import {
  neuralContacts,
  type NeuralHands,
} from "../../test-fixtures/piano-neural-comparison";
const input = process.argv[2],
  directory = process.argv[3];
if (!input || !directory)
  throw Error(
    "Specify existing neural artifact directory and new hybrid directory",
  );
if (existsSync(directory + "/requests.json"))
  throw Error("Hybrid requests already frozen; choose a new directory");
const protocol = JSON.parse(
  readFileSync(new URL("./hybrid-protocol.json", import.meta.url), "utf8"),
);
execFileSync(
  "git",
  [
    "diff",
    "--exit-code",
    protocol.baselineRevision,
    "--",
    "packages/music-practice/src",
  ],
  { stdio: "pipe" },
);
const bytes = readFileSync(input + "/lumikey.json"),
  neural = JSON.parse(bytes.toString());
assert.equal(neural.model, protocol.model);
assert.equal(neural.beamWidth, protocol.beamWidth);
assert.equal(neural.pitchShift ?? 0, 0);
const cases = (["hanon", "beringer", "beringer-scales"] as const).flatMap(
  (source) =>
    loadPianoBenchmark(source).map((c) => ({ ...c, id: source + ":" + c.id })),
);
const byId = new Map<string, NeuralHands>(
  neural.cases.map((c: { id: string; hands: NeuralHands }) => [c.id, c.hands]),
);
assert.equal(neural.cases.length, cases.length);
assert.equal(byId.size, cases.length);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const result = {
  study: protocol.study,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  protocolSha256: hash(JSON.stringify(protocol)),
  predictionSha256: hash(bytes),
  cases: cases.map((c) => {
    const predictions = byId.get(c.id);
    if (!predictions) throw Error("Missing neural case");
    return {
      id: c.id,
      bpm: c.bpm,
      notesSha256: hash(JSON.stringify(c.notes)),
      contacts: neuralContacts(c.notes).map((n) => ({
        id: n.id,
        hand: n.hand,
        midi: n.midi,
        time: (n.start * 60000) / c.bpm,
        duration: (n.duration * 60000) / c.bpm,
        ...(n.finger !== undefined ? { finger: n.finger } : {}),
      })),
      hands: hybridCandidateSet(c.notes, predictions, c.bpm),
    };
  }),
};
mkdirSync(directory, { recursive: true });
writeFileSync(
  directory + "/protocol.json",
  JSON.stringify(protocol, null, 2) + "\n",
);
writeFileSync(directory + "/requests.json", JSON.stringify(result) + "\n");
console.log(
  "Frozen",
  cases.length,
  "label-free hybrid cases before evaluation",
);
