/** Runs our own planner only. Calibration never reads reserved evaluation cases. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { planPianoPhrase } from "../src/piano-phrase-fingering";
import {
  loadPianoBenchmark,
  evaluatePianoBenchmark,
} from "../test-fixtures/piano-benchmark";
const stage = process.argv[2],
  path = process.argv[3];
if (!["development", "validation"].includes(stage) || !path)
  throw Error(
    "Specify development|validation and output file; validation also requires frozen development report",
  );
const hash = (name: string) =>
  createHash("sha256")
    .update(readFileSync(new URL(name, import.meta.url)))
    .digest("hex");
const sources = {
  core: hash("../src/piano-phrase-fingering.ts"),
  preferences: hash("../src/piano-ergonomics.ts"),
  hand: hash("../src/piano-hand-model.ts"),
};
const run = (
  corpus: "hanon" | "beringer" | "beringer-scales",
  partition: "development" | "validation",
  weight: number,
) =>
  evaluatePianoBenchmark(
    loadPianoBenchmark(corpus).filter((c) => c.partition === partition),
    (ns, p) =>
      planPianoPhrase(ns, {
        ...p,
        model: "ergonomic",
        weights: { gesture: weight },
      }),
  );
if (stage === "development") {
  const trials = [0, 0.25, 0.5, 1].map((weight) => ({
    weight,
    corpora: {
      hanon: run("hanon", "development", weight),
      beringer: run("beringer", "development", weight),
    },
  }));
  const base = trials[0];
  const assessments = trials.map((t) => ({
    ...t,
    losses: Object.entries(t.corpora).flatMap(([s, r]) =>
      Object.entries(r.families)
        .filter(
          ([f, v]) =>
            v.matches <
              base.corpora[s as "hanon" | "beringer"].families[f].matches ||
            v.covered <
              base.corpora[s as "hanon" | "beringer"].families[f].covered ||
            v.predictedNotes <
              base.corpora[s as "hanon" | "beringer"].families[f]
                .predictedNotes,
        )
        .map(([f]) => s + ":" + f),
    ),
    matches: Object.values(t.corpora).reduce(
      (a, b) => a + b.summary.matches,
      0,
    ),
  }));
  const rank = (
    a: (typeof assessments)[number],
    b: (typeof assessments)[number],
  ) => b.matches - a.matches || a.weight - b.weight;
  const best = assessments.filter((t) => t.weight > 0).sort(rank)[0],
    eligible = assessments.filter((t) => !t.losses.length).sort(rank)[0];
  writeFileSync(
    path,
    JSON.stringify(
      {
        schema: 1,
        stage,
        sources,
        weights: [0, 0.25, 0.5, 1],
        selectedWeight: eligible.weight,
        diagnosticWeight: best.weight,
        promoted: false,
        trials: assessments,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      selectedWeight: eligible.weight,
      diagnosticWeight: best.weight,
      trials: assessments.map((t) => ({
        weight: t.weight,
        matches: t.matches,
        losses: t.losses,
      })),
    }),
  );
} else {
  if (!process.argv[4]) throw Error("Need frozen development report");
  const frozen = JSON.parse(readFileSync(process.argv[4], "utf8"));
  if (
    frozen.stage !== "development" ||
    JSON.stringify(frozen.sources) !== JSON.stringify(sources)
  )
    throw Error(
      "Candidate changed after calibration; freeze development again before evaluation",
    );
  const weights = [
    ...new Set([0, frozen.selectedWeight, frozen.diagnosticWeight, 1]),
  ];
  const trials = weights.map((weight) => ({
    weight,
    corpora: {
      hanon: run("hanon", "validation", weight),
      beringer: run("beringer", "validation", weight),
      scales: run("beringer-scales", "validation", weight),
    },
  }));
  writeFileSync(
    path,
    JSON.stringify(
      {
        schema: 1,
        stage,
        sources,
        selectedWeight: frozen.selectedWeight,
        diagnosticWeight: frozen.diagnosticWeight,
        promoted: false,
        scaleStatus:
          "New technique group from the same publication, including unlabelled coverage cases; not independent-source validation. Consumed after this evaluation.",
        trials,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      trials.map((t) => ({
        weight: t.weight,
        corpora: Object.fromEntries(
          Object.entries(t.corpora).map(([k, v]) => [k, v.summary]),
        ),
      })),
    ),
  );
}
