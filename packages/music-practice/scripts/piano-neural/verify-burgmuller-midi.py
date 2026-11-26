"""Independent written-pass pitch/onset validation via actual MIDI interpreters."""
import concurrent.futures,hashlib,json,math,pathlib,subprocess,sys
import mido
def check(case,root):
    source=(root/(case['id']+'.ly')).read_text()
    transform='''
#(define (written-pass m)
  (let* ((copy (ly:music-deep-copy m)) (name (ly:music-property copy 'name))
         (one (ly:music-property copy 'element)) (many (ly:music-property copy 'elements)))
    (cond
      ((eq? name 'VoltaRepeatedMusic) (make-music 'SequentialMusic 'elements
        (cons (written-pass one) (map written-pass many))))
      ((eq? name 'VoltaSpeccedMusic) (written-pass one))
      (else (if (ly:music? one) (ly:music-set-property! copy 'element (written-pass one)))
        (if (pair? many) (ly:music-set-property! copy 'elements (map written-pass many))) copy))))
'''
    voices=sorted({n['voice'].split('-',1)[1].split('/')[0] for n in case['notes']})
    source+=transform+'\n'
    for i,name in enumerate(voices):source+=f'part{chr(65+i)} = #(written-pass {name})\n'
    source+='\\score { << '+' '.join('\\new Staff { \\part'+chr(65+i)+' }' for i in range(len(voices)))+' >> \\midi {} }\n'
    ly=root/(case['id']+'-reference.ly');ly.write_text(source);stem=root/(case['id']+'-reference')
    r=subprocess.run(['lilypond','-dno-print-pages','-o',str(stem),str(ly)],capture_output=True,text=True)
    (root/(case['id']+'-reference.log')).write_text(r.stdout+r.stderr)
    if r.returncode:raise ValueError('Reference failed '+case['id'])
    midi=mido.MidiFile(str(stem)+'.midi');actual=set()
    for track in midi.tracks:
        at=0
        for event in track:
            at+=event.time
            if event.type=='note_on' and event.velocity:actual.add((at,event.note))
    expected={(math.floor(n['start']*midi.ticks_per_beat+1e-7),n['midi']) for n in case['notes'] if not n.get('tieFrom')}
    if actual!=expected:raise ValueError(f"Reference differs {case['id']}: missing {sorted(expected-actual)[:8]}, extra {sorted(actual-expected)[:8]}")
    return {'id':case['id'],'uniqueAttacks':len(actual),'matched':True}
root=pathlib.Path(sys.argv[1]).resolve();b=(root/'corpus.json').read_bytes();corpus=json.loads(b)
unsupported={i['id'] for i in corpus['inventory'] if i['unsupportedNotation']}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(lambda c:check(c,root),[c for c in corpus['cases'] if c['id'] not in unsupported]))
result={'corpusSha256':hashlib.sha256(b).hexdigest(),'semantics':'Written repeat bodies/all printed alternatives once; compare unique attack pitch and truncated MIDI ticks. Does not validate gold digits or hold articulation approximation.','rows':rows,'unsupported':sorted(unsupported)}
(root/'midi-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
