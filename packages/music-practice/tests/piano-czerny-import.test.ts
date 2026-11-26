import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
