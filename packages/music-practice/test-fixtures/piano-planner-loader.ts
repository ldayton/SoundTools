/** Compile only our own source for mutation/ablation tests. Never upstream code. */
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import type { planPianoPhrase } from "../src/piano-phrase-fingering";
const text = (name: string) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
export const pianoPlannerSources = {
  core: text("piano-phrase-fingering"),
  model: text("piano-hand-model"),
  ergonomics: text("piano-ergonomics"),
};
const uri = (s: string) =>
  "data:text/javascript;base64," +
  Buffer.from(
    transformSync(s, { loader: "ts", format: "esm", target: "es2022" }).code,
  ).toString("base64");
export async function loadPianoPlanner(
  sources = pianoPlannerSources,
): Promise<typeof planPianoPhrase> {
  const model = uri(sources.model),
    ergonomics = uri(
      sources.ergonomics.replaceAll(
        '"./piano-hand-model"',
        JSON.stringify(model),
      ),
    );
  const code = sources.core
    .replaceAll('"./piano-hand-model"', JSON.stringify(model))
    .replaceAll('"./piano-ergonomics"', JSON.stringify(ergonomics));
  return (await import(uri(code))).planPianoPhrase;
}
