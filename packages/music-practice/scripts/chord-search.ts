import { parseArgs } from "node:util";
import {
  parseChordSymbols,
  searchGuitarChords,
  type GuitarChordOptions,
} from "../src/guitar-chord-search";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "max-fret": { type: "string" },
      "min-fret": { type: "string" },
      span: { type: "string" },
      fingers: { type: "string" },
      "min-strings": { type: "string" },
      "max-strings": { type: "string" },
      gaps: { type: "string" },
      limit: { type: "string" },
      offset: { type: "string" },
      tuning: { type: "string" },
      "no-barres": { type: "boolean" },
      "no-open": { type: "boolean" },
      "require-open": { type: "boolean" },
      "any-bass": { type: "boolean" },
      complete: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !positionals.length) {
    console.log(
      'Usage: npm run chords --workspace=@ldayton/music-practice -- "C, Am7, D/F#" [--json] [--no-barres] [--fingers 3] [--span 3] [--max-fret 7] [--limit 10] [--complete] [--any-bass]',
    );
  } else {
    const options: GuitarChordOptions = {};
    for (const [arg, key] of [
      ["max-fret", "maxFret"],
      ["min-fret", "minFret"],
      ["span", "maxFretSpan"],
      ["fingers", "maxFingers"],
      ["min-strings", "minStrings"],
      ["max-strings", "maxStrings"],
      ["gaps", "maxMutedGaps"],
      ["limit", "limit"],
      ["offset", "offset"],
    ] as const)
      if (values[arg] !== undefined) options[key] = Number(values[arg]);
    if (values.tuning) options.tuning = values.tuning.split(",").map(Number);
    if (values["no-barres"]) options.allowBarres = false;
    if (values["no-open"]) options.allowOpenStrings = false;
    if (values["require-open"]) options.requireOpenString = true;
    if (values["any-bass"]) options.bass = "any";
    if (values.complete) options.voicingPolicy = "complete";
    const results = parseChordSymbols(positionals.join(",")).map((chord) =>
      searchGuitarChords(chord.symbol, options),
    );
    if (values.json) console.log(JSON.stringify(results, null, 2));
    else
      for (const result of results) {
        console.log(
          "\n" +
            result.chord.symbol +
            " — " +
            result.total +
            " matching shapes; frets run low E to high E",
        );
        result.voicings.forEach((v, i) =>
          console.log(
            String(result.offset + i + 1).padStart(3) +
              ". " +
              v.frets
                .map((f) => (f === null ? "x" : f))
                .join(" ")
                .padEnd(18) +
              " | " +
              v.fingering.fingerCount +
              " fingers | " +
              v.rank.reasons.join("; ") +
              (v.omittedDegrees.length
                ? " | omits " + v.omittedDegrees.join(", ")
                : ""),
          ),
        );
      }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
