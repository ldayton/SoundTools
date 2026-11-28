import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
import {
  loadPianoBenchmark,
  evaluatePianoBenchmark,
} from "../test-fixtures/piano-benchmark";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
const partition = process.argv[2];
if (!["development", "validation", "all"].includes(partition))
  throw Error("Specify development, validation or all");
const corpusSource = process.argv[5] === "beringer" ? "beringer" : "hanon";
const cases = loadPianoBenchmark(corpusSource).filter(
  (c) => partition === "all" || c.partition === partition,
);
let planner = planPianoPhrase;
const revision = process.argv[4];
if (revision && revision !== "working") {
  if (!/^[a-f0-9]{7,40}$/.test(revision))
    throw Error("Expected baseline commit hash");
  // Compile only OUR historical committed source. No upstream program executes.
  const source = (name: string) =>
    execFileSync(
      "git",
      ["show", `${revision}:packages/music-practice/src/${name}.ts`],
      { encoding: "utf8" },
    );
  const uri = (s: string) =>
    "data:text/javascript;base64," +
    Buffer.from(
      transformSync(s, { loader: "ts", format: "esm", target: "es2022" }).code,
    ).toString("base64");
  const model = uri(source("piano-hand-model"));
  let core = source("piano-phrase-fingering").replaceAll(
    '"./piano-hand-model"',
    JSON.stringify(model),
  );
  if (core.includes('"./piano-ergonomics"')) {
    const preferences = uri(
      source("piano-ergonomics").replaceAll(
        '"./piano-hand-model"',
        JSON.stringify(model),
      ),
    );
    core = core.replaceAll('"./piano-ergonomics"', JSON.stringify(preferences));
  }
  planner = (await import(uri(core))).planPianoPhrase;
}
const result = {
  sourceRevision:
    corpusSource === "hanon"
      ? "25754560a496c2beea3c81d72a389fb33fd7e930"
      : "0ad656db9b778508453a7275dc698b9129ca765e",
  datasetSha256: createHash("sha256")
    .update(
      readFileSync(
        new URL(
          corpusSource === "hanon"
            ? "../test-fixtures/piano-benchmark.json"
            : "../test-fixtures/piano-beringer.json",
          import.meta.url,
        ),
      ),
    )
    .digest("hex"),
  plannerRevision: revision ?? "working-tree",
  partition,
  ...evaluatePianoBenchmark(cases, (notes, profile) =>
    planner(notes, {
      ...profile,
      ...(process.env.PIANO_MODEL
        ? { model: process.env.PIANO_MODEL as "classic" | "ergonomic" }
        : {}),
    }),
  ),
};
if (process.argv[3])
  writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    { partition, summary: result.summary, families: result.families },
    null,
    2,
  ),
);
