"""Our data-only importer. Never imports or executes upstream programs."""
import argparse
import hashlib
import json
import pathlib
import re
import xml.etree.ElementTree as ET
from fractions import Fraction

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'test-fixtures/external/dacapo'
DEST = ROOT / 'test-fixtures/piano-benchmark.json'


def pitch(name):
    match = re.fullmatch(r'([A-G])([#bx]*)(-?\d+)', name)
    if not match:
        raise ValueError(f'Invalid pitch: {name}')
    step, accidental, octave = match.groups()
    value = (int(octave)+1)*12 + {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step] + accidental.count('#')+2*accidental.count('x')-accidental.count('b')
    if not 0 <= value <= 127:
        raise ValueError('MIDI out of range')
    return value


def new_case(id, family, source, reserved=False):
    return dict(id=id, family=family, source=source, partition='validation' if reserved else 'development', bpm=60, notes=[], labels=[])


def add(case, hand, midi, start, duration, digit=None, kind='printed', reason=None, tie_from=None):
    id = f'{hand}:{len(case["notes"])}'
    note = dict(id=id, hand=hand, midi=midi, start=float(start), duration=float(duration))
    if duration <= 0:
        raise ValueError('Nonpositive duration')
    if tie_from:
        note['tieFrom'] = tie_from
    case['notes'].append(note)
    if digit is not None and str(digit) != '.':
        if not re.fullmatch('[1-5]',str(digit)):
            case['labels'].append(dict(id=id,kind='flagged',raw=str(digit),reason='compound editorial indication; substitution timing is unspecified'))
            return id
        digit = int(digit)
        if digit not in range(1,6):
            raise ValueError('Invalid digit')
        case['labels'].append(dict(id=id, finger=digit, kind=kind, **({'reason':reason} if reason else {})))
    return id


def scale_cases(data, path):
    result=[]
    for i, row in enumerate(data):
        # Partition related keys across scales/arpeggios together, before measurement.
        reserved=row['key'] in ['Ab','Db','Gb','Bb','G#','C#','F#']
        if row['number']==40:
            reserved=i in [38,41,43]
        c=new_case(f'hanon-{row["number"]}-{i}', 'chromatic' if row['number']==40 else 'scales' if row['number']==39 else 'arpeggios',path,reserved)
        c['description']=row['header']+' '+row['mode']
        c['timing']='standardized sixteenth-note traversal at quarter=60; inferred closing tonic retained from upstream'
        for hand, prefix, up, down in [('right','right','notes','notesDown'),('left','left','notesLeft','notesLeftDown')]:
            names=row[up]+row[down][1:]
            fingers=row[prefix+'Up']+row[prefix+'Down'][1:]
            marks=row.get('printed')
            if marks is None and row['number']!=40:raise ValueError('Missing printed provenance')
            printed=marks[prefix+'Up']+marks[prefix+'Down'][1:] if marks else [True]*len(names)
            if len(names)!=len(fingers) or len(names)!=len(printed):raise ValueError('Scale length mismatch')
            # Both runs refer to the same turning note. Either explicit reading is evidence.
            if marks:printed[len(row[up])-1] |= marks[prefix+'Down'][0]
            if fingers[len(row[up])-1]!=row[prefix+'Down'][0]:raise ValueError('Conflicting top digit')
            # The source's arrays are ascending/descending templates; contrary motion
            # begins with RH descending, LH ascending. Preserve each label's identity.
            order=list(range(len(names)))
            if row.get(prefix+'First')=='down':
                order=list(range(len(row[up])-1,len(names)))+list(range(1,len(row[up])))
            uncertain=row.get('uncertain',{}).get('RH' if hand=='right' else 'LH',{})
            for t,j in enumerate(order):
                reason=None
                if uncertain and (not all(str(k).isdigit() for k in uncertain) or str(j) in uncertain):
                    # Numeric source indices locate individual doubtful digits. A prose
                    # location still conservatively flags the hand; never guess its index.
                    reason='source flags this reading: '+json.dumps(uncertain,sort_keys=True)
                if row['number']==39 and row['key']=='D' and row['mode']=='major' and hand=='left' and j==55:
                    reason='documented suspected engraving slip: printed 1, commonly corrected to 4'
                add(c,hand,pitch(names[j]),Fraction(t,4),Fraction(1,4),fingers[j], 'flagged' if reason and printed[j] else 'printed' if printed[j] else 'inferred',reason)
        result.append(c)
    return result


def exercise_cases(data,path):
    result=[]
    for i,row in enumerate(data):
        # Reserve whole exercises; related sections are never split across partitions.
        reserved=row['number'] in [4,8,12,16,20,43,46,51]
        c=new_case(f'hanon-study-{row["number"]}-{i}', 'five-finger' if row['number']<=20 else 'technical',path,reserved)
        c['description']=f'Hanon {row["number"]} '+row.get('part','')
        for hand in ['right','left']:
            at=Fraction(0)
            for bar,steps in enumerate(row[hand]):
                digits=row[hand+'Fingers'][bar]
                if len(steps)!=len(digits):raise ValueError('Study label mismatch')
                for j,step in enumerate(steps):
                    # A one-step bar is the closing held note. Other notes use
                    # source perBeat (including triplets), not equal division of a bar.
                    duration=Fraction(row['beats'])-Fraction(row.get('rest',0),row.get('perBeat',4)) if len(steps)==1 else Fraction(1,row.get('perBeat',4))
                    pitches=step.split('+');label=digits[j]
                    ds=[None]*len(pitches) if label is None else list(str(label))
                    if len(ds)!=len(pitches):raise ValueError('Chord label mismatch')
                    for name,d in zip(pitches,ds):add(c,hand,pitch(name),at,duration,d)
                    at+=duration
        c['trailingRestSteps']=row.get('rest',0)
        result.append(c)
    return result


def musicxml_case(text,id,source,reserved=False):
    root=ET.fromstring(text)
    c=new_case(id,'repertoire',source,reserved)
    if len(root.findall('part'))!=1:raise ValueError('Expected single piano part')
    divisions=1;origin=Fraction(0);ties={};part=root.find('part')
    for mi,measure in enumerate(part.findall('measure')):
        at=origin;end=origin;last_onset=None
        for item in measure:
            if item.tag=='attributes':divisions=int(item.findtext('divisions',divisions));continue
            if item.tag not in ['note','backup','forward']:continue
            raw=item.findtext('duration')
            if raw is None:raise ValueError('Unsupported grace/unmeasured note')
            duration=Fraction(int(raw),divisions)
            if item.tag=='backup':at-=duration;continue
            if item.tag=='forward':at+=duration;end=max(end,at);continue
            chord=item.find('chord') is not None
            if chord and last_onset is None:raise ValueError('Orphan chord')
            start=last_onset if chord else at
            if item.find('rest') is None:
                p=item.find('pitch')
                if p is None:raise ValueError('Unsupported unpitched note')
                midi=pitch(p.findtext('step')+('#'*max(0,int(p.findtext('alter','0'))))+('b'*max(0,-int(p.findtext('alter','0'))))+p.findtext('octave'))
                staff=int(item.findtext('staff','1'))
                if staff not in [1,2]:raise ValueError('Unsupported piano staff')
                hand='right' if staff==1 else 'left'
                key=(staff,item.findtext('voice','1'),midi)
                tie_types={t.get('type') for t in item.findall('tie')}
                previous=ties.get(key)
                if 'stop' in tie_types and (previous is None or previous[1]!=start):raise ValueError('Missing tie predecessor')
                fs=item.findall('./notations/technical/fingering')
                if len(fs)>1:raise ValueError('Ambiguous fingering')
                digit=fs[0].text if fs else None
                nid=add(c,hand,midi,start,duration,digit,tie_from=previous[0] if 'stop' in tie_types else None)
                if 'start' in tie_types:ties[key]=(nid,start+duration)
                elif 'stop' in tie_types:ties.pop(key,None)
            if not chord:at+=duration;last_onset=start
            end=max(end,start+duration)
        origin=end
    if ties:raise ValueError('Unclosed ties')
    return c


def build():
    manifest=json.loads((BASE/'manifest.json').read_text())
    for entry in manifest['files']:
        if hashlib.sha256((BASE/entry['path']).read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Changed upstream data')
    cases=[]
    for name in ['hanon.json','hanon41.json']:
        path='scripts/scales/hanon/'+name
        cases+=scale_cases(json.loads((BASE/path).read_text()),path)
    for name in ['part1/part1.json','s7/s7.json']:
        path='scripts/scales/hanon/'+name
        cases+=exercise_cases(json.loads((BASE/path).read_text()),path)
    for p in sorted((BASE/'src/pieces/library').glob('*.musicxml')):
        reserved=p.stem in ['schumann-melodie','turk-hans-ohne-sorgen','turk-bey-der-wiege','beyer-op101-no66']
        cases.append(musicxml_case(p.read_text(),p.stem,str(p.relative_to(BASE)),reserved))
    return dict(schema=1,sourceRevision=manifest['revision'],cases=cases)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    text=json.dumps(build(),ensure_ascii=False,separators=(',',':'))+'\n'
    if args.check:
        if DEST.read_text()!=text:raise SystemExit('Benchmark data is stale; run our importer')
    else:DEST.write_text(text)
