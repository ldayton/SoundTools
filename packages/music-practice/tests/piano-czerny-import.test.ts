import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

test("reserved source importer preserves rational rhythm, hand, ties and annotation uncertainty", () => {
  execFileSync(
    "python3",
    [
      "-c",
      String.raw`
import importlib.util,sys
s=importlib.util.spec_from_file_location('czerny',sys.argv[1])
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
music=m.assignments('upperStaff = { c4 } % comment\nBF_low_dup = { <bf bf\'>16 }\nlowerStaff = { d4 }')
assert music['upperStaff'].strip()=='c4'
assert 'BF_low_dup' in music
for source in ['upperStaff = { #(system "bad") c4 }','upperStaff = { \\include "bad" }','upperStaff = { c4']:
 try: m.assignments(source)
 except ValueError: pass
 else: raise AssertionError('Executable/malformed source accepted')
rows='ROW|upperStaff|0|1/3|60|1|1|0|1/3\nROW|upperStaff|1/3|1/3|60||0|0|1/3\nROW|lowerStaff|0|1|48|0|0|0|1\nROW|upperStaff|2/3|0|62|2,4|0|1|1/8'
n,l,r=m.parse_rows(rows,'synthetic')
assert n[0]['duration']==1/3 and n[1]['start']==1/3
assert n[1]['tieFrom']==n[0]['id'] and n[2]['hand']=='left'
assert l[0]['finger']==1 and l[1]['kind']=='flagged' and l[2]['kind']=='flagged'
assert n[3]['duration']==0 and r[3]['grace'] and r[3]['notatedDuration']==1/8
assert all('finger' not in note for note in n)
for rows in ['ROW|bad','ROW|upperStaff|0|1|60|1|1|0|1','ROW|upperStaff|0|1|60|1|1|0|1\nROW|upperStaff|2|1|60||0|0|1']:
 try: m.parse_rows(rows,'bad')
 except ValueError: pass
 else: raise AssertionError('Malformed/open/noncontiguous tie accepted')
`,
      fileURLToPath(
        new URL("../scripts/piano-neural/import-czerny.py", import.meta.url),
      ),
    ],
    { encoding: "utf8" },
  );
});

test("fresh importer preserves relative prefixes and rejects executable or malformed music", () => {
  execFileSync(
    "python3",
    [
      "-c",
      String.raw`
import importlib.util,sys
s=importlib.util.spec_from_file_location('burgmuller',sys.argv[1])
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
music=m.music_assignments("Global = { \\key c \\major }\nTOP = \\relative c'' { f8' c-1 }\nBOT = { c,4-| }\nignored = { #(system bad) }")
assert music['TOP']=="\\relative c'' { f'8 c-1 }"
assert music['BOT']=='{ c,4-\\staccatissimo }'
assert set(music)=={'Global','TOP','BOT'}
for source in ['TOP = { #(system "bad") c4 }','TOP = { \\include "bad" }','TOP = { c4']:
 try:m.music_assignments(source)
 except ValueError:pass
 else:raise AssertionError('Executable/malformed source accepted')
`,
      fileURLToPath(
        new URL(
          "../scripts/piano-neural/import-burgmuller.py",
          import.meta.url,
        ),
      ),
    ],
    { encoding: "utf8" },
  );
});

test("fresh reservation retains all pieces, source hashes, independent MIDI evidence and separate labels", () => {
  const root = new URL(
    "../test-fixtures/external/mutopia-burgmuller/",
    import.meta.url,
  );
  const read = (name: string) => readFileSync(new URL(name, root));
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const manifestBytes = read("reservation.json"),
    corpusBytes = read("corpus.json");
  const manifest = JSON.parse(manifestBytes.toString()),
    corpus = JSON.parse(corpusBytes.toString()),
    midi = JSON.parse(read("midi-verification.json").toString());
  assert.equal(corpus.reservationSha256, hash(manifestBytes));
  assert.equal(midi.corpusSha256, hash(corpusBytes));
  assert.equal(manifest.files.length, 18);
  assert.deepEqual(
    corpus.cases.map((c: any) => c.id).sort(),
    manifest.files.map((f: any) => f.file.replace(/\.ly$/, "")).sort(),
  );
  for (const file of manifest.files)
    assert.equal(hash(read(file.file)), file.sha256, file.file);
  assert.ok(
    corpus.cases.every((c: any) =>
      c.notes.every((n: any) => n.finger === undefined),
    ),
  );
  const unsupported = corpus.inventory
    .filter((i: any) => i.unsupportedNotation)
    .map((i: any) => i.id)
    .sort();
  assert.deepEqual(unsupported, midi.unsupported);
  assert.equal(unsupported.length, 5);
  assert.deepEqual(
    midi.rows.map((r: any) => r.id).sort(),
    corpus.cases
      .map((c: any) => c.id)
      .filter((id: string) => !unsupported.includes(id))
      .sort(),
  );
  assert.ok(midi.rows.every((r: any) => r.matched));
});
