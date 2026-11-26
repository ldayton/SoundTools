"""Reproducible fresh-test import. Never used by the training command.

Reads pinned source, extracts only music assignments and rejects executable
Scheme. LilyPond parses a controlled scaffold, not upstream headers/layout/code.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
from fractions import Fraction

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SOURCE = HERE.parents[1] / 'test-fixtures/external/mutopia-czerny'


def assignments(source):
    # Comments/strings cannot introduce braces in this reserved subset.
    source = re.sub(r'%[^\n]*', '', source)
    result = {}
    for match in re.finditer(r'^([a-zA-Z][a-zA-Z_]*)\s*=\s*\{', source, re.M):
        depth, i = 1, match.end()
        while i < len(source) and depth:
            depth += (source[i] == '{') - (source[i] == '}')
            i += 1
        if depth:
            raise ValueError('Unbalanced source music')
        body = source[match.end():i-1]
        if match[1] in ['dynamics', 'pedal']:
            continue
        # These two visual-only directives are the only Scheme in music.
        body = re.sub(r"\\set\s+fingeringOrientations\s*=\s*#'\([^)]*\)", '', body)
        body = re.sub(r"\\override\s+TupletNumber\s+#'stencil\s*=\s*##f", '', body)
        body = re.sub(r'\\ottava\s+#([01])', r'\\ottava \1', body)
        if '#' in body or '$' in body or re.search(r'\\(include|applyMusic|applyContext|scheme|book|score|layout|midi)\b', body):
            raise ValueError('Executable or non-music source rejected: ' + match[1])
        result[match[1]] = body
    return result


def parse_rows(text, piece):
    notes, labels, raw, pending = [], [], [], {}
    for line in text.splitlines():
        if 'ROW|' not in line:
            continue
        fields = line[line.index('ROW|'):].split('|')
        if len(fields) != 9:
            raise ValueError('Malformed LilyPond event row')
        _, voice, at, duration, midi, digits, tied, grace, notated = fields
        start, duration = float(Fraction(at)), float(Fraction(duration))
        midi, tied, grace = int(midi), tied == '1', grace == '1'
        hand = 'right' if voice.startswith(('upperStaff', 'pianoUpper')) else 'left'
        ident = f'{piece}:{len(notes)}'
        n = dict(id=ident, hand=hand, midi=midi, start=start, duration=duration, voice=voice)
        key = (voice, midi)
        prior = pending.pop(key, None)
        if prior:
            if abs(prior['start'] + prior['duration'] - start) > 1e-8:
                raise ValueError('Noncontiguous source tie')
            n['tieFrom'] = prior['id']
        if tied:
            pending[key] = n
        notes.append(n)
        ds = [int(x) for x in digits.split(',') if x]
        if ds:
            if len(ds) == 1 and 1 <= ds[0] <= 5:
                labels.append(dict(id=ident, kind='printed', finger=ds[0]))
            else:
                labels.append(dict(id=ident, kind='flagged', raw=digits, reason='ambiguous chord-level/compound fingering'))
        raw.append(dict(id=ident, grace=grace, notatedDuration=float(Fraction(notated)), digits=ds))
    if pending:
        raise ValueError('Unclosed source tie')
    if not notes:
        raise ValueError('No note events imported')
    return notes, labels, raw


def main():
    output = pathlib.Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    reservation = json.loads((SOURCE / 'reservation.json').read_text())
    cases, inventory = [], []
    for entry in reservation['files']:
        path = SOURCE / entry['file']
        source_bytes = path.read_bytes()
        assert hashlib.sha256(source_bytes).hexdigest() == entry['sha256']
        piece = path.stem
        music = assignments(source_bytes.decode())
        voices = [k for k in music if k in ['upperStaff', 'lowerStaff', 'pianoUpper', 'tenorPiano', 'bassPiano']]
        assert any(k in voices for k in ['upperStaff', 'pianoUpper'])
        assert any(k in voices for k in ['lowerStaff', 'tenorPiano', 'bassPiano'])
        language = re.search(r'\\language\s+"([a-z]+)"', source_bytes.decode())
        scaffold = '\\version "2.26.0"\n\\language ' + json.dumps(language[1] if language else 'nederlands') + '\n'
        scaffold += '\n'.join(k + ' = {' + v + '}' for k, v in music.items())
        scaffold += '\n#(load ' + json.dumps(str(HERE / 'dump-music.scm')) + ')\n'
        scaffold += '\n'.join(f'#(dump-music {k} 0 "{k}" #f)' for k in voices) + '\n'
        ly = output / (piece + '.ly')
        ly.write_text(scaffold)
        run = subprocess.run(['lilypond', '-dno-print-pages', '-o', str(output / piece), str(ly)], capture_output=True, text=True)
        (output / (piece + '.log')).write_text(run.stdout + run.stderr)
        if run.returncode:
            raise ValueError('LilyPond parsing failed; see ' + str(output / (piece + '.log')))
        notes, labels, raw = parse_rows(run.stdout + run.stderr, piece)
        graces = [x for x in raw if x['grace']]
        # No invented performance timing for ornamental notes. Keep every note
        # and label; evaluation marks the entire piece unsupported for all models.
        cases.append(dict(id=piece, family='czerny-op821', partition='validation', source=entry['source'], bpm=120, notes=notes, labels=labels, evidence='printed'))
        inventory.append(dict(id=piece, notes=len(notes), eligible=sum(x['kind']=='printed' for x in labels), flagged=sum(x['kind']=='flagged' for x in labels), graceNotes=len(graces), unsupportedNotation=bool(graces), raw=raw))
    (output / 'corpus.json').write_text(json.dumps(dict(schema=1, reservationSha256=hashlib.sha256((SOURCE / 'reservation.json').read_bytes()).hexdigest(), importer='LilyPond 2.26.0, written pass, unexpanded ornaments diagnosed; pitch-attached printed labels only', cases=cases, inventory=inventory), indent=2)+'\n')
    print(json.dumps([{k:v for k,v in i.items() if k!='raw'} for i in inventory], indent=2))


if __name__ == '__main__':
    main()
