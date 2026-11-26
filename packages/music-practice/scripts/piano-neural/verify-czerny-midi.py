"""Independent AST-import check against LilyPond's actual MIDI interpreter.

Optional research tool: LilyPond 2.26 and mido. No hardware audio output.
Never reads predictions, chooses models, or edits the reserved source.
"""
import collections
import concurrent.futures
import hashlib
import json
import math
import pathlib
import subprocess
import sys
import mido


def verify(case, directory):
    path = directory / (case['id'] + '.ly')
    scaffold = path.read_text()
    # Reuse only the already sanitized scaffold. Run real score interpreters
    # in addition to the AST dumper, with all declared source voices present.
    variables = [k for k in ['upperStaff','lowerStaff','pianoUpper','tenorPiano','bassPiano'] if k + ' = {' in scaffold]
    score = '\n\\score { << ' + ' '.join('\\new Staff { \\' + k + ' }' for k in variables) + ' >> \\midi {} }\n'
    path = directory / (case['id'] + '-midi.ly')
    path.write_text(scaffold + score)
    stem = directory / (case['id'] + '-midi')
    run = subprocess.run(['lilypond','-dno-print-pages','-o',str(stem),str(path)],capture_output=True,text=True)
    (directory / (case['id']+'-midi.log')).write_text(run.stdout+run.stderr)
    if run.returncode:
        raise ValueError('MIDI reference failed: ' + case['id'])
    midi = mido.MidiFile(str(stem)+'.midi')
    actual = set()
    for track in midi.tracks:
        tick = 0
        for event in track:
            tick += event.time
            if event.type=='note_on' and event.velocity:
                actual.add((tick,event.note))
    # LilyPond writes integer ticks by truncating fractional tuplet ticks, not
    # rounding to nearest. E.g. 1/5 beat at PPQ384 is tick76, not tick77.
    expected = {(math.floor(n['start']*midi.ticks_per_beat+1e-7),n['midi']) for n in case['notes'] if not n.get('tieFrom')}
    if actual != expected:
        raise ValueError(f"MIDI note/onset mismatch {case['id']}: missing {sorted(expected-actual)[:8]}, extra {sorted(actual-expected)[:8]}")
    return dict(id=case['id'],uniqueAttacks=len(actual),matched=True)


def main():
    directory=pathlib.Path(sys.argv[1]).resolve()
    corpus_bytes=(directory/'corpus.json').read_bytes()
    corpus=json.loads(corpus_bytes)
    unsupported={x['id'] for x in corpus['inventory'] if x['unsupportedNotation']}
    cases=[c for c in corpus['cases'] if c['id'] not in unsupported]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows=list(pool.map(lambda c:verify(c,directory),cases))
    report=dict(corpusSha256=hashlib.sha256(corpus_bytes).hexdigest(),checked=len(rows),unsupportedOrnaments=sorted(unsupported),semantics='Exact unique attack pitch and quantized onset agreement with actual LilyPond MIDI. Repeated source unisons may share one MIDI attack. Does not independently validate editorial digits or articulation-dependent hold durations.',rows=rows)
    (directory/'midi-verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
