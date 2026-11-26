"""Offline runner for unmodified, pinned Chirality rule/decoder source.

Upstream source/weights live outside product source in an ignored directory.
Input contains no reference labels. No training or native audio output.
"""
import hashlib
import itertools
import json
import pathlib
import sys
import time

import numpy as np

source, weight_path, requests_path, output = map(pathlib.Path, sys.argv[1:])
if output.exists():
    raise ValueError('Do not overwrite a retained prediction run')
sys.path.insert(0, str(source.resolve()))
from chirality.rules.parncutt97 import RULE_KEYS, lattice_to_semitone, evaluate_fragment, UNPLAYABLE_COST
from chirality.rules.weight_learning import piece_features, path_features, solve_weighted

digest = lambda b: hashlib.sha256(b).hexdigest()
weights_bytes = weight_path.read_bytes()
published = json.loads(weights_bytes)
assert set(published) == set(RULE_KEYS)
weights = np.array([published[k] for k in RULE_KEYS], dtype=np.float64)
assert np.isfinite(weights).all() and (weights >= 0).all()


def lattice(midi):
    # Chirality's lattice convention is C0 = MIDI12; all rule intervals remain
    # unchanged by this constant. Assert all 128 MIDI pitches round trip.
    column = (midi // 12 - 1) * 7 + [0,0,1,1,2,3,3,4,4,5,5,6][midi % 12]
    black = midi % 12 in [1,3,6,8,10]
    return column, black


for midi in range(128):
    assert lattice_to_semitone(*lattice(midi)) + 12 == midi

# Validate the downloaded modules before any corpus score. The small independent
# enumeration checks both hands and the actual published weights, with the same
# finite native gate that upstream deliberately uses.
validation = []
for hand in [1,2]:
    fragment = [lattice(x) for x in [60,61,63,62]]
    feats = piece_features(fragment, hand=hand)
    for w in [np.ones(len(RULE_KEYS)),weights]:
        brute = float('inf')
        for digits in itertools.product(range(1,6),repeat=len(fragment)):
            phi = path_features(feats,digits)
            total, per_rule = evaluate_fragment(fragment,digits,hand=hand)
            if total < UNPLAYABLE_COST:
                assert np.allclose(phi,[per_rule[k] for k in RULE_KEYS],atol=1e-5)
            gate = sum(float(feats.gate[t,digits[t-1]-1,digits[t]-1]) for t in range(1,len(digits)))
            brute = min(brute,float(phi@w)+gate)
        decoded=solve_weighted(feats,w)
        value=float(path_features(feats,decoded)@w)+sum(float(feats.gate[t,decoded[t-1]-1,decoded[t]-1]) for t in range(1,len(decoded)))
        assert abs(value-brute)<1e-4
        validation.append(dict(hand=hand,weights='uniform' if np.all(w==1) else 'published',enumerated=5**len(fragment),cost=value))

request_bytes=requests_path.read_bytes()
requests=json.loads(request_bytes)
rows=[]
started=time.perf_counter()
for case in requests['cases']:
    row=dict(id=case['id'],notesSha256=case['notesSha256'],hands={})
    if not case['unsupportedNotation']:
        for hand, contacts in case['hands'].items():
            if not contacts:
                continue
            tick=time.perf_counter()
            feats=piece_features([lattice(n['midi']) for n in contacts],hand=1 if hand=='right' else 2)
            feature_ms=(time.perf_counter()-tick)*1000
            result={}
            for mode,w in [('uniform',np.ones(len(RULE_KEYS))),('published',weights)]:
                tick=time.perf_counter()
                fingers=solve_weighted(feats,w)
                decode_ms=(time.perf_counter()-tick)*1000
                gate_edges=sum(feats.gate[t,fingers[t-1]-1,fingers[t]-1]>0 for t in range(1,len(fingers)))
                result[mode]=dict(fingers=fingers,featureMs=feature_ms,decodeMs=decode_ms,nativeGateViolations=int(gate_edges),ruleFeatures=dict(zip(RULE_KEYS,map(float,path_features(feats,fingers)))))
            row['hands'][hand]=dict(contacts=[n['id'] for n in contacts],predictions=result)
    rows.append(row)
    if len(rows)%25==0:
        print(json.dumps(dict(done=len(rows),total=len(requests['cases']),elapsedMs=(time.perf_counter()-started)*1000)),flush=True)

hashes={str(p.relative_to(source)):digest(p.read_bytes()) for p in source.rglob('*.py')}
output.write_text(json.dumps(dict(schema=1,requestSha256=digest(request_bytes),weightsSha256=digest(weights_bytes),upstreamSourceSha256=hashes,versions=dict(python=sys.version,numpy=np.__version__),validation=validation,elapsedMs=(time.perf_counter()-started)*1000,cases=rows),indent=2)+'\n')
print('Wrote native predictions: '+str(output),flush=True)
