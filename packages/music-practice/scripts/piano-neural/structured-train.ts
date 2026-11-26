import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadPianoBenchmark } from "../../test-fixtures/piano-benchmark";
import {
  initialRankingWeights,
  rankPianoPhrase,
  pianoPlanRankingFeatures,
  updateRankingWeights,
  type RankingWeights,
  type RankingMode,
} from "../../test-fixtures/piano-structured-ranking";

const output = process.argv[2];
if (!output || existsSync(output))
  throw Error("Specify a new weights artifact (never overwrite a frozen run)");
const bytes = readFileSync(
    new URL("./structured-protocol.json", import.meta.url),
  ),
  protocol = JSON.parse(bytes.toString());
const hash = (v: Buffer | string) =>
  createHash("sha256").update(v).digest("hex");
const sources = ["hanon", "beringer", "beringer-scales"] as const;
const cases = sources.flatMap((source) =>
  loadPianoBenchmark(source)
    .filter((c) => (c.evidence ?? "printed") === "printed")
    .map((c) => ({ ...c, id: source + ":" + c.id })),
);
if (cases.some((c) => c.alternatives?.length))
  throw Error(
    "This frozen training protocol does not combine alternative label sequences",
  );
const started = performance.now(),
  learners: Record<string, unknown> = {};
for (const mode of ["scalar", "structured"] as RankingMode[]) {
  let weights = initialRankingWeights(),
    count = 0;
  const sum: RankingWeights = {},
    epochs = [];
  for (let epoch = 0; epoch < protocol.epochs; epoch++) {
    const t = performance.now();
    let updates = 0,
      incompatible = 0,
      labels = 0;
    const skipped = [];
    for (const c of cases) {
      // Full two-hand input preserves the shared-pitch hand-conflict contract.
      const gold = new Map(
        c.labels
          .filter((l) => l.kind === "printed" && l.finger !== undefined)
          .map((l) => [l.id, l.finger!]),
      );
      for (const hand of ["right", "left"] as const) {
        const hs = c.notes.filter((n) => n.hand === hand),
          ids = new Set(hs.map((n) => n.id));
        const targets = [...gold].filter(([id]) => ids.has(id));
        if (!targets.length) continue;
        const reference = new Map(targets);
        const compatible = rankPianoPhrase(c.notes, weights, mode, {
          bpm: c.bpm,
          compatible: reference,
        });
        const augmented = rankPianoPhrase(c.notes, weights, mode, {
          bpm: c.bpm,
          loss: reference,
        });
        labels += targets.length;
        if (
          compatible.hands[hand].status !== "complete" ||
          augmented.hands[hand].status !== "complete"
        ) {
          incompatible++;
          skipped.push({
            id: c.id,
            hand,
            compatible: compatible.hands[hand].diagnostic,
            augmented: augmented.hands[hand].diagnostic,
          });
        } else {
          // Isolate features, not the physical search input or hard constraints.
          const only = (plan: typeof compatible) => ({
            ...plan,
            hands: {
              ...plan.hands,
              [hand === "right" ? "left" : "right"]: {
                ...plan.hands[hand === "right" ? "left" : "right"],
                status: "unsupported" as const,
              },
            },
          });
          const chosen = new Map(
            augmented.hands[hand].notes.map((n) => [n.id, n.finger]),
          );
          if (targets.some(([id, digit]) => chosen.get(id) !== digit)) {
            weights = updateRankingWeights(
              weights,
              pianoPlanRankingFeatures(c.notes, only(compatible), mode),
              pianoPlanRankingFeatures(c.notes, only(augmented), mode),
              mode,
              protocol.learningRate,
              protocol.regularization,
              targets.length,
            );
            updates++;
          }
        }
        count++;
        for (const [k, v] of Object.entries(weights))
          sum[k] = (sum[k] ?? 0) + v;
      }
    }
    const row = {
      epoch: epoch + 1,
      updates,
      incompatible,
      labels,
      skipped,
      elapsedMs: performance.now() - t,
    };
    epochs.push(row);
    console.log(JSON.stringify({ mode, ...row, skipped: undefined }));
  }
  learners[mode] = {
    weights: Object.fromEntries(
      Object.entries(sum)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v / count]),
    ),
    averageExamples: count,
    epochs,
  };
}
const files = [
  "../../src/piano-phrase-fingering.ts",
  "../../src/piano-hand-model.ts",
  "../../src/piano-ergonomics.ts",
  "../../test-fixtures/piano-structured-ranking.ts",
  "./structured-train.ts",
  "../../test-fixtures/piano-benchmark.json",
  "../../test-fixtures/piano-beringer.json",
  "../../test-fixtures/piano-beringer-scales.json",
];
writeFileSync(
  output,
  JSON.stringify(
    {
      schema: 1,
      study: protocol.study,
      protocolSha256: hash(bytes),
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      hashes: Object.fromEntries(
        files.map((f) => [f, hash(readFileSync(new URL(f, import.meta.url)))]),
      ),
      trainingIds: cases.map((c) => c.id),
      elapsedMs: performance.now() - started,
      learners,
    },
    null,
    2,
  ) + "\n",
);
console.log("Frozen weights written: " + output);
