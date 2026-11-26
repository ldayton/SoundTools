import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import abcjs from "abcjs";
import hymns from "../../src/hymns.json";
import {
  arrangeHymn,
  type Arrangement,
  type HymnHands,
} from "../../src/hymn-arrangements";
import { collectPianoScore } from "../../src/piano-score-fingering";
import { neuralContacts } from "../../test-fixtures/piano-neural-comparison";
import { loadPianoBenchmark } from "../../test-fixtures/piano-benchmark";
import {
  removeReviewVoice,
  reviewAbc,
  passageFingerprint,
} from "../../test-fixtures/piano-teacher-review";
const directory = process.argv[2];
if (!directory) throw Error("Specify output directory");
mkdirSync(directory, { recursive: true });
if (existsSync(directory + "/frozen-passages.json"))
  throw Error("Frozen passages already exist; use a new study directory");
const protocol = JSON.parse(
  readFileSync(new URL("./teacher-protocol.json", import.meta.url), "utf8"),
);
// PFR1 fixes both the music and the planner contract at the recorded baseline.
execFileSync(
  "git",
  [
    "diff",
    "--exit-code",
    protocol.sourceRevision,
    "--",
    "packages/music-practice/src",
    "packages/music-practice/test-fixtures/piano-neural-comparison.ts",
  ],
  { stdio: "pipe" },
);
const benchmark = new Set(
  (["hanon", "beringer", "beringer-scales"] as const)
    .flatMap((source) => loadPianoBenchmark(source))
    .map((c) => passageFingerprint(c.notes)),
);
const cases = protocol.selection.map(
  (selection: {
    id: string;
    slug: string;
    arrangement: Arrangement;
    hands: HymnHands;
    section: number;
    category: string;
    pianoOnly?: boolean;
  }) => {
    const hymn = hymns.find((h) => h.slug === selection.slug);
    if (!hymn) throw Error("Unknown song");
    const score = arrangeHymn(
      hymn,
      selection.arrangement,
      4,
      selection.section,
      selection.hands,
    );
    const source = selection.pianoOnly
      ? removeReviewVoice(score.abc, score.abc.match(/^V:\s*([^\s]+)/m)![1])
      : score.abc;
    const abc = reviewAbc(source),
      tune = abcjs.parseOnly(abc)[0];
    tune.setUpAudio({ chordsOff: true });
    const collected = collectPianoScore(tune);
    if (collected.diagnostics.length || !collected.notes.length)
      throw Error(
        JSON.stringify({
          id: selection.id,
          diagnostics: collected.diagnostics,
        }),
      );
    if (collected.notes.some((n) => n.finger !== undefined))
      throw Error("Independent packet contains an authored digit");
    const fingerprint = passageFingerprint(collected.notes);
    if (benchmark.has(fingerprint))
      throw Error("Exact old-benchmark passage reused");
    return {
      ...selection,
      title: hymn.title,
      key: hymn.key,
      meter: hymn.meter,
      bpm: 60,
      from: score.from,
      to: score.to,
      abc,
      notes: collected.notes,
      fingerprint,
      sourceSha256: createHash("sha256").update(score.abc).digest("hex"),
      sourceAbc: score.abc,
    };
  },
);
const frozen = {
  study: protocol.study,
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  protocol,
  protocolSha256: createHash("sha256")
    .update(JSON.stringify(protocol))
    .digest("hex"),
  cases,
};
writeFileSync(
  directory + "/frozen-passages.json",
  JSON.stringify(frozen, null, 2) + "\n",
);
const requests = cases.map((c: (typeof cases)[number]) => ({
  id: c.id,
  bpm: c.bpm,
  contacts: neuralContacts(c.notes).map((n) => ({
    ...n,
    time: (n.start * 60000) / c.bpm,
    duration: (n.duration * 60000) / c.bpm,
  })),
}));
writeFileSync(directory + "/requests.json", JSON.stringify(requests));
console.log(
  cases.map((c: (typeof cases)[number]) => ({
    id: c.id,
    title: c.title,
    from: c.from,
    to: c.to,
    notes: c.notes.length,
    fingerprint: c.fingerprint,
  })),
);
