"""All ten reserved multi-file studies; controlled RH/LH parsing only."""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'test-fixtures/external/mutopia-czerny840'
spec = importlib.util.spec_from_file_location('schumann_import', HERE/'import-schumann.py')
sch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sch)


def music_assignments(source):
    # Inspected defn.ily macro families adjust engraving only. None of those
    # definitions, upstream includes, headers, layout or Scheme are executed.
    source = re.sub(r'\\(?:shp[A-Za-z]+|pos[A-Za-z]+|omitDynamic|omitHairpin|noFingPad|doubleSlurOn|doubleSlurOff)\b', ' ', source)
    source = re.sub(r"\\set\s+(?:Timing.beamExceptions|Staff.beatStructure)\s*=\s*#'\([\d\s]*\)", ' ', source)
    source = re.sub(r"\\set\s+Timing.baseMoment\s*=\s*#\(ly:make-moment\s+[\d/\s]+\)", ' ', source)
    source = re.sub(r"\\set\s+Staff.printKeyCancellation\s*=\s*##[tf]", ' ', source)
    names = tuple(name for name in ['RH','LHI','LHII','Struktur','LH'] if re.search(r'^\s*'+name+r'\s*=', source, re.M))
    if not {'RH','LH'} <= set(names):
        raise ValueError('Missing reserved hands')
    return sch.music_assignments(source, names)


def main():
    output = pathlib.Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest_bytes = (SOURCE/'reservation.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    for f in manifest['files']:
        assert hashlib.sha256((SOURCE/f['file']).read_bytes()).hexdigest() == f['sha256']
    cases, inventory = [], []
    for piece in range(1,11):
        path = SOURCE/str(piece)/f'etude-{piece:02d}.ily'
        source = path.read_text()
        music = music_assignments(source)
        ident = f'czerny-op840-{piece}'
        scaffold = '\\version "2.26.0"\n\\language "deutsch"\n'
        scaffold += '\n'.join(name+' = '+body for name,body in music.items())+'\n'
        for helper in ['dump-music.scm','dump-written-music.scm']:
            scaffold += '#(load '+json.dumps(str(HERE/helper))+')\n'
        # q is expanded by LilyPond at score interpretation, not by its parser.
        # Ask the same native normalizer for complete event-chord leaves before
        # our AST traversal; otherwise repeated attacks and their clock vanish.
        for hand in ['RH','LH']:
            scaffold += f"#(expand-repeat-chords! (cons 'rhythmic-event (ly:parser-lookup '$chord-repeat-events)) {hand})\n"
        scaffold += '#(dump-music RH 0 "upperStaff-RH" #f)\n#(dump-music LH 0 "lowerStaff-LH" #f)\n'
        ly = output/(ident+'.ly')
        ly.write_text(scaffold)
        run = subprocess.run(['lilypond','-dno-print-pages','-o',str(output/ident),str(ly)],capture_output=True,text=True)
        (output/(ident+'.log')).write_text(run.stdout+run.stderr)
        if run.returncode:
            raise ValueError('LilyPond parsing failed: '+str(output/(ident+'.log')))
        notes,labels,events,tie_problem = sch.reserved_rows(run.stdout+run.stderr,ident)
        reasons = []
        if any(e['grace'] for e in events): reasons.append('grace')
        if tie_problem: reasons.append('unresolved-written-tie: '+tie_problem)
        if re.search(r'\\(?:change|crossStaff)\b','\n'.join(music.values())): reasons.append('cross-staff')
        entry = next(f for f in manifest['files'] if f['file']==f'{piece}/etude-{piece:02d}.ily')
        cases.append(dict(id=ident,family='czerny-op840',partition='validation',source=entry['url'],bpm=120,notes=notes,labels=labels,evidence='printed'))
        inventory.append(dict(id=ident,notes=len(notes),eligible=sum(l['kind']=='printed'for l in labels),flagged=sum(l['kind']=='flagged'for l in labels),unsupportedNotation=bool(reasons),reasons=reasons,events=events))
    result = dict(schema=1,reservationSha256=hashlib.sha256(manifest_bytes).hexdigest(),semantics='Controlled RH/LH with musical helper definitions, German pitch names, written pass. No upstream includes or Scheme executed. Every unsupported piece and original event row retained.',cases=cases,inventory=inventory)
    (output/'corpus.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='events'}for r in inventory],indent=2))


if __name__ == '__main__': main()
