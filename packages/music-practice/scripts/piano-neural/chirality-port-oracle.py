"""Generate synthetic-only rule/path goldens from pinned external modules.

No PIG-trained weights are read, emitted, or needed for these CI fixtures.
"""
import hashlib,itertools,json,pathlib,sys
import numpy as np
source,output=map(pathlib.Path,sys.argv[1:])
sys.path.insert(0,str(source.resolve()))
from chirality.rules import parncutt97 as p
from chirality.rules.weight_learning import piece_features,solve_weighted,path_features

def lattice(m):
    return ((m//12-1)*7+[0,0,1,1,2,3,3,4,4,5,5,6][m%12],m%12 in [1,3,6,8,10])

spans=list(range(-24,25))
pair=[]
for d,a,b,x,y in itertools.product(spans,range(1,6),range(1,6),[False,True],[False,True]):
    pair.append([p.rule1_stretch(a,b,d),p.rule2_small_span(a,b,d),p.rule3_large_span(a,b,d),p.rule8_three_to_four(a,b),p.rule9_four_on_black(a,x,b,y),p.rule12_thumb_passing(a,x,b,y,d)])
steps=[-12,-2,0,2,12]
triple=[]
for d,e,a,b,c in itertools.product(steps,steps,range(1,6),range(1,6),range(1,6)):
    triple.append([p.rule4_position_change_count(a,60,b,60+d,c,60+d+e),p.rule5_position_change_size(a,60,c,60+d+e),p.rule7_three_four_five([a,b,c])])
note=[]
for f,x,prev,nxt in itertools.product(range(1,6),[False,True],[None,False,True],[None,False,True]):
    note.append([p.rule6_weak_finger(f),p.rule10_thumb_on_black(None,prev,f,x,None,nxt),p.rule11_five_on_black(None,prev,f,x,None,nxt)])

phrases=[[60],[61],[60,60],[60,64],[61,60],[60,62,64],[60,64,60],[60,62,64,65,67],[61,63,64,66,68],[72,71,69,67],[60,84,36],[60,61,62,63,64],[67,65,64,62,60]]
models={'uniform':[1]*12,'synthetic':[1,.3,2,4,.5,0,2,3,1,3,1.5,4]}
paths=[]
for midis,hand,(model,weights) in itertools.product(phrases,[1,2],models.items()):
    features=piece_features([lattice(m) for m in midis],hand=hand)
    digits=solve_weighted(features,np.array(weights))
    phi=path_features(features,digits)
    gates=sum(float(features.gate[i,digits[i-1]-1,digits[i]-1])>0 for i in range(1,len(digits)))
    paths.append(dict(midis=midis,hand='right' if hand==1 else 'left',model=model,fingers=digits,features=dict(zip(p.RULE_KEYS,map(float,phi))),gates=int(gates),cost=float(phi@np.array(weights))+gates*100_000_000))

manifest=json.loads(pathlib.Path('docs/piano-chirality-artifacts.json').read_text())
for file,digest in manifest['sourceSha256'].items():
    assert hashlib.sha256((source/file).read_bytes()).hexdigest()==digest
result=dict(schema=1,upstreamRevision=manifest['githubRevision'],sourceSha256=manifest['sourceSha256'],scope='Synthetic rule grids and invented weights only; no published learned weights or PIG labels',pairSpans=spans,pairFeatures=pair,tripleSteps=steps,tripleFeatures=triple,noteFeatures=note,models=models,paths=paths)
# Compact numeric grids keep the fixture small and deterministic.
output.write_text(json.dumps(result,separators=(',',':'))+'\n')
print('Synthetic reference grids:',len(pair),'pairs,',len(triple),'triples,',len(note),'note contexts,',len(paths),'paths')
