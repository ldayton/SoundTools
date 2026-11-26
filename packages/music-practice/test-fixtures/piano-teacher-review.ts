/** Research packet contracts; never imported by the application. */
import { createHash } from "node:crypto";
export const reviewMethods = [
  "classic",
  "lumikey-beam6",
  "lumikey-constrained6",
] as const;
export type ReviewMethod = (typeof reviewMethods)[number];
const permutations: ReviewMethod[][] = [
  [reviewMethods[0], reviewMethods[1], reviewMethods[2]],
  [reviewMethods[0], reviewMethods[2], reviewMethods[1]],
  [reviewMethods[1], reviewMethods[0], reviewMethods[2]],
  [reviewMethods[1], reviewMethods[2], reviewMethods[0]],
  [reviewMethods[2], reviewMethods[0], reviewMethods[1]],
  [reviewMethods[2], reviewMethods[1], reviewMethods[0]],
];
/** Shuffle the six permutations once, then cycle for balanced A/B/C exposure. */
export function blindReviewOrder(index: number, seed: string): ReviewMethod[] {
  if (!Number.isInteger(index) || index < 0 || !seed)
    throw Error("Invalid blind assignment input");
  const ordered = permutations
    .map((order, i) => ({
      order,
      hash: createHash("sha256")
        .update(seed + ":" + i)
        .digest("hex"),
    }))
    .sort((a, b) => a.hash.localeCompare(b.hash));
  return [...ordered[index % ordered.length].order];
}
/** A sliced vocal edition can share one staff with piano voices. Remove only
 * the explicit singer voice; do not remove a staff or rewrite music tokens. */
export function removeReviewVoice(abc: string, voiceId: string) {
  const ids = [...abc.matchAll(/^V:\s*([^\s]+).*$/gm)].map((m) => m[1]);
  if (!ids.includes(voiceId) || ids.length < 2)
    throw Error("Unknown or only review voice");
  const escaped = voiceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let current = "";
  return abc
    .split("\n")
    .filter((line) => {
      const declaration = line.match(/^V:\s*([^\s]+)/);
      if (declaration) return declaration[1] !== voiceId;
      const music = line.match(/^\[V:\s*([^\]\s]+)\]/);
      if (music) current = music[1];
      if (music || /^w:/.test(line)) return current !== voiceId;
      return true;
    })
    .map((line) =>
      /^%%(?:score|staves)\b/.test(line)
        ? line
            .replace(
              new RegExp("(?<=^|[\\s({|])" + escaped + "(?=$|[\\s)}|])", "g"),
              "",
            )
            .replace(/\(\s*\)/g, "")
            .replace(/\{\s*\}/g, "")
        : line,
    )
    .join("\n");
}
export function reviewAbc(abc: string) {
  return abc
    .split("\n")
    .filter((line) => !/^w:|^T:|^C:|^Z:|^%%(?:text|center|subtitle)/.test(line))
    .join("\n")
    .replace(/![1-5]!/g, "");
}
export function passageFingerprint(
  notes: readonly {
    hand: string;
    midi: number;
    start: number;
    duration: number;
  }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        notes
          .map((n) => [n.hand, n.midi, n.start, n.duration])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    )
    .digest("hex");
}
