import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { planPianoPhrase } from "../../src/piano-phrase-fingering";
import {
  rawNeuralPlan,
  constrainedNeuralPlan,
} from "../../test-fixtures/piano-neural-comparison";
import { blindReviewOrder } from "../../test-fixtures/piano-teacher-review";
const directory = process.argv[2];
if (!directory) throw Error("Specify packet work directory");
const frozen = JSON.parse(
    readFileSync(directory + "/frozen-passages.json", "utf8"),
  ),
  neural = JSON.parse(readFileSync(directory + "/lumikey.json", "utf8"));
if (
  neural.model !== "lumikey" ||
  neural.beamWidth !== 6 ||
  neural.cases.length !== frozen.cases.length
)
  throw Error("Incomplete frozen inference");
const frozenSha256 = createHash("sha256")
  .update(JSON.stringify(frozen))
  .digest("hex");
const previous = existsSync(directory + "/organizer.json")
  ? JSON.parse(readFileSync(directory + "/organizer.json", "utf8"))
  : undefined;
if (previous && previous.frozenSha256 !== frozenSha256)
  throw Error("Frozen study changed; use a new study ID and directory");
const seed = previous?.seed ?? randomBytes(32).toString("hex");
const key: {
  study: string;
  seed: string;
  frozenSha256: string;
  assignments: unknown[];
} = { study: frozen.study, seed, frozenSha256, assignments: [] };
const cases = frozen.cases.map((c: any, index: number) => {
  const predictions = neural.cases.find((p: any) => p.id === c.id)?.hands;
  if (!predictions) throw Error("Missing passage");
  const plans = {
    classic: planPianoPhrase(c.notes, { bpm: c.bpm }),
    "lumikey-beam6": rawNeuralPlan(c.notes, predictions, c.bpm),
    "lumikey-constrained6": constrainedNeuralPlan(c.notes, predictions, c.bpm)
      .plan,
  };
  const order = blindReviewOrder(index, seed),
    variants = order.map((method, i) => ({
      label: "ABC"[i],
      digits: Object.fromEntries(
        plans[method].notes.map((n) => [n.id, n.finger]),
      ),
    }));
  const signature = (digits: Record<string, number>) =>
    JSON.stringify(c.notes.map((n: any) => digits[n.id] ?? null));
  key.assignments.push({
    id: c.id,
    title: c.title,
    from: c.from,
    to: c.to,
    methods: Object.fromEntries(order.map((m, i) => ["ABC"[i], m])),
    equalPairs: variants.flatMap((a, i) =>
      variants
        .slice(i + 1)
        .filter((b) => signature(a.digits) === signature(b.digits))
        .map((b) => a.label + "=" + b.label),
    ),
    coverage: Object.fromEntries(
      Object.entries(plans).map(([name, p]) => [
        name,
        { notes: p.notes.length, total: c.notes.length, status: p.status },
      ]),
    ),
  });
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    key: c.key,
    meter: c.meter,
    bpm: c.bpm,
    abc: c.abc,
    notes: c.notes,
    variants,
  };
});
writeFileSync(
  directory + "/teacher-payload.json",
  JSON.stringify({ study: frozen.study, cases }),
);
writeFileSync(
  directory + "/organizer.json",
  JSON.stringify(key, null, 2) + "\n",
);
console.log(
  "Generated",
  cases.length,
  "anonymous comparisons; seed reused if present. Review pending.",
);
