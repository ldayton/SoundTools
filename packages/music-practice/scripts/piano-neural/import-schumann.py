"""Reserved Schumann sources: controlled written-pass parsing, never inference."""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / 'test-fixtures/external/mutopia-schumann'
spec = importlib.util.spec_from_file_location('czerny_import', HERE / 'import-czerny.py')
cz = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cz)


def balanced(source, start, opening='{', closing='}'):
    depth, i = 1, start
    while i < len(source) and depth:
        depth += (source[i] == opening) - (source[i] == closing)
        i += 1
    if depth:
        raise ValueError('Unbalanced reserved music')
    return i


def music_assignments(source, names=('upper', 'lower')):
    source = re.sub(r'%[^\n]*', '', source)
    result = {}
    for match in re.finditer(r"^\s*("+'|'.join(re.escape(n) for n in names)+r")\s*=\s*(\\relative\s+[a-g][a-z]*[,']*\s*)?\{", source, re.M):
        body = source[match.end():balanced(source, match.end())-1]
        # Only visual markup is discarded, before validating the remaining
        # music. Never execute upstream headers, layout, MIDI blocks or Scheme.
        pattern = r'(?:\\mark\s+|[_^\-]?\s*)\\markup\s*(?:\\(?:column|center-column|line|italic|bold|small|large|whiteout)\s*|\\fontsize\s+#-?[\d.]+\s*)*\{'
        while (markup := re.search(pattern, body)):
            end = balanced(body, markup.end())
            body = body[:markup.start()] + ' ' + body[end:]
        override = r"(?:\\once\s*)?\\override\s+[\w.-]+(?:\s+#'[\w.-]+)?\s*=\s*"
        numeric_list = override + r"#'\("
        while (directive := re.search(numeric_list, body)):
            end = balanced(body, directive.end(), '(', ')')
            value = body[directive.end():end-1]
            # Text-spanner labels in this reservation are quoted literal data.
            literal_label = re.fullmatch(r'"[A-Za-z. ]*"', value.strip())
            if re.search(r'[^\d\s().+\-]', value) and not literal_label:
                raise ValueError('Non-numeric visual list rejected: '+repr(value))
            body = body[:directive.start()] + ' ' + body[end:]
        visual = override + r"(?:#'[\w-]+|##[tf]|#-?[\d.]+|#(?:UP|DOWN|LEFT|RIGHT))"
        body = re.sub(visual, ' ', body)
        body = re.sub(r"\\set\s+fingeringOrientations\s*=\s*#'\([^)]*\)", ' ', body)
        body = re.sub(r"\\set\s+followVoice\s*=\s*##[tf]", ' ', body)
        body = re.sub(r'\\ottava\s+#(-?[01])', r'\\ottava \1', body)
        body = body.replace('-|', r'-\staccatissimo')
        body = re.sub(r"\b([a-g](?:is|es)*)(\d+)([,']+)", r'\1\3\2', body)
        if '#' in body or '$' in body or re.search(r'\\(?:include|applyMusic|applyContext|scheme|book|score|layout|midi)\b', body):
            details = [line.strip() for line in body.splitlines() if '#' in line or '$' in line]
            raise ValueError('Executable/non-music source rejected: ' + match[1] + ' ' + repr(details))
        result[match[1]] = (match[2] or '') + '{' + body + '}'
    if set(result) != set(names):
        raise ValueError('Expected exactly reserved music names')
    return result


def reserved_rows(text, piece):
    rows = [line[line.index('ROW|'):] for line in text.splitlines() if 'ROW|' in line]
    unresolved_tie = None
    try:
        notes, labels, events = cz.parse_rows('\n'.join(rows), piece)
    except ValueError as error:
        if str(error) not in ['Noncontiguous source tie', 'Unclosed source tie']:
            raise
        # Unsupported notation only: preserve every original row and digit,
        # without inventing contact continuity. Never infer on these pieces.
        unresolved_tie = str(error)
        untied = []
        for row in rows:
            fields = row.split('|')
            fields[6] = '0'
            untied.append('|'.join(fields))
        notes, labels, events = cz.parse_rows('\n'.join(untied), piece)
    for note, event, row in zip(notes, events, rows):
        note['notatedDuration'] = event['notatedDuration']
        event['sourceRow'] = row
    return notes, labels, events, unresolved_tie


def main():
    output = pathlib.Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest_bytes = (SOURCE / 'reservation.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    cases, inventory = [], []
    for entry in manifest['files']:
        path = SOURCE / entry['file']
        raw = path.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == entry['sha256']
        music = music_assignments(raw.decode())
        scaffold = '\\version "2.26.0"\n\\language "nederlands"\n'
        scaffold += '\n'.join(name+' = '+body for name, body in music.items())+'\n'
        for helper in ['dump-music.scm', 'dump-written-music.scm']:
            scaffold += '#(load '+json.dumps(str(HERE/helper))+')\n'
        for name in music:
            voice = ('upperStaff-' if name == 'upper' else 'lowerStaff-')+name
            scaffold += f'#(dump-music {name} 0 "{voice}" #f)\n'
        ly = output / path.name
        ly.write_text(scaffold)
        run = subprocess.run(['lilypond', '-dno-print-pages', '-o', str(output/path.stem), str(ly)], capture_output=True, text=True)
        (output/(path.stem+'.log')).write_text(run.stdout+run.stderr)
        if run.returncode:
            raise ValueError('LilyPond parsing failed: '+str(output/(path.stem+'.log')))
        notes, labels, events, unresolved_tie = reserved_rows(run.stdout+run.stderr,path.stem)
        reasons = []
        if any(e['grace'] for e in events):
            reasons.append('grace')
        if unresolved_tie:
            reasons.append('unresolved-written-tie: '+unresolved_tie)
        if re.search(r'\\(?:change|crossStaff)\b', '\n'.join(music.values())):
            reasons.append('cross-staff')
        # Common 120 BPM profile is fixed for comparison, as in prior corpora.
        cases.append(dict(id=path.stem, family='schumann-op68', partition='validation', source=entry['url'], bpm=120, notes=notes, labels=labels, evidence='printed'))
        inventory.append(dict(id=path.stem, notes=len(notes), eligible=sum(l['kind']=='printed' for l in labels), flagged=sum(l['kind']=='flagged' for l in labels), unsupportedNotation=bool(reasons), reasons=reasons, events=events))
    result = dict(schema=1, reservationSha256=hashlib.sha256(manifest_bytes).hexdigest(), semantics='Written pass; each printed alternative once; conservative half-notated staccato holds; ambiguous digit attachments flagged. All sources retained. Per-case event records inherit the source license in reservation.json.', cases=cases, inventory=inventory)
    (output/'corpus.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='events'} for r in inventory], indent=2))


if __name__ == '__main__':
    main()
