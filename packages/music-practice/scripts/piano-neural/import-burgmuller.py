"""Pinned fresh source import, written repeat pass; no prediction/model inputs."""
import hashlib,importlib.util,json,pathlib,re,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('czerny_import',HERE/'import-czerny.py')
cz=importlib.util.module_from_spec(spec);spec.loader.exec_module(cz)
SOURCE=HERE.parents[1]/'test-fixtures/external/mutopia-burgmuller'

def music_assignments(source):
    source=re.sub(r'%[^\n]*','',source)
    result={}
    for match in re.finditer(r"^(\w+)\s*=\s*(\\relative\s+[a-g][a-z]*[,']*\s*)?\{",source,re.M):
        name,prefix=match[1],match[2] or ''
        if name not in ['Global','vOne','vTwo','vThree','MD','MS','MSI','MSII','VoiceI','VoiceII','VoiceIII','TOP','BOT']:
            continue
        depth,i=1,match.end()
        while i<len(source) and depth:
            depth+=(source[i]=='{')-(source[i]=='}');i+=1
        if depth:raise ValueError('Unbalanced music '+name)
        body=source[match.end():i-1]
        # LilyPond 2.16 accepted octave marks after the duration (f8'). Modern
        # LilyPond requires f'8; this is a syntax-only pitch-preserving rewrite.
        body=re.sub(r"\b([a-g](?:is|es)*)(\d+)([,']+)",r'\1\3\2',body)
        body=body.replace('-|',r'-\staccatissimo')
        body=re.sub(r"\\override\s+(?:TupletBracket|TupletNumber)\s+#'(?:bracket-visibility|stencil)\s*=\s*##f",'',body)
        body=re.sub(r"\\set\s+(?:tupletSpannerDuration|Timing.measurePosition)\s*=\s*#\(ly:make-moment\s+[01]\s+[48]\)",'',body)
        body=re.sub(r"\\revert\s+(?:TextScript|Script)\s+#'direction",'',body)
        body=re.sub(r'\\ottava\s+#(-?[01])',r'\\ottava \1',body)
        body=body.replace('\\Treble','\\clef treble').replace('\\Bass','\\clef bass')
        body=re.sub(r'[_^\-]?\s*\\(?:cr|decr|cresc|crescendo|dim|dimrit|dimpoc|delicato|leggiermente|atempo|staffUp|staffDown|phraseUp|phraseDown|phraseNeutral)\b',' ',body)
        if '#' in body or '$' in body or re.search(r'\\(?:include|applyMusic|applyContext|scheme|score|layout|midi)\b',body):
            raise ValueError('Executable/non-music source rejected '+name)
        result[name]=prefix+'{'+body+'}'
    return result

def main():
    output=pathlib.Path(sys.argv[1]).resolve();output.mkdir(parents=True,exist_ok=True)
    manifest_bytes=(SOURCE/'reservation.json').read_bytes();manifest=json.loads(manifest_bytes)
    cases=[];inventory=[]
    for entry in manifest['files']:
        path=SOURCE/entry['file'];raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
        source=raw.decode();music=music_assignments(source);voices=[n for n in music if n!='Global'];assert voices
        def hand(name):
            if name in ['vOne','vTwo','MD','TOP','VoiceI']:return 'right'
            if name=='VoiceII' and 'VoiceIII' in music:return 'right'
            return 'left'
        scaffold='\\version "2.26.0"\n\\language "nederlands"\n'
        scaffold+='\n'.join(name+' = '+body for name,body in music.items())+'\n'
        scaffold+='#(load '+json.dumps(str(HERE/'dump-music.scm'))+')\n'
        scaffold+='#(load '+json.dumps(str(HERE/'dump-written-music.scm'))+')\n'
        scaffold+='\n'.join(f'#(dump-music {name} 0 "'+('upperStaff-' if hand(name)=='right' else 'lowerStaff-')+name+'" #f)' for name in voices)+'\n'
        ly=output/(path.stem+'.ly');ly.write_text(scaffold)
        run=subprocess.run(['lilypond','-dno-print-pages','-o',str(output/path.stem),str(ly)],capture_output=True,text=True)
        (output/(path.stem+'.log')).write_text(run.stdout+run.stderr)
        if run.returncode:raise ValueError('LilyPond parsing failed: '+str(output/(path.stem+'.log')))
        notes,labels,events=cz.parse_rows(run.stdout+run.stderr,path.stem)
        for note,event in zip(notes,events):note['notatedDuration']=event['notatedDuration']
        reasons=[]
        if any(e['grace'] for e in events):reasons.append('grace')
        if re.search(r'\\(?:staffUp|staffDown)\b', '\n'.join(music.values())) or re.search(r'\\staff(?:Up|Down)\b',source[source.index('Global'):source.index('\\score')]):reasons.append('cross-staff')
        cases.append(dict(id=path.stem,family='burgmuller-op100',partition='validation',source=entry['url'],bpm=120,notes=notes,labels=labels,evidence='printed'))
        inventory.append(dict(id=path.stem,notes=len(notes),eligible=sum(l['kind']=='printed' for l in labels),flagged=sum(l['kind']=='flagged' for l in labels),unsupportedNotation=bool(reasons),reasons=reasons,events=events))
    result=dict(schema=1,reservationSha256=hashlib.sha256(manifest_bytes).hexdigest(),semantics='Written-pass notes, each printed volta alternative once. Relative pitch resolved by LilyPond. Ambiguous chord digits flagged. Grace/cross-staff pieces retained but unsupported for all models.',cases=cases,inventory=inventory)
    (output/'corpus.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='events'} for r in inventory],indent=2))
if __name__=='__main__':main()
