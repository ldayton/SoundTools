"""True sequence likelihoods for the frozen hybrid experiment; no labels."""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import torch
from infer import Transformer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('requests')
    ap.add_argument('artifacts')
    ap.add_argument('output')
    args = ap.parse_args()
    raw = Path(args.requests).read_bytes()
    request = json.loads(raw)
    root = Path(args.artifacts)
    # Verify pinned weights again; the app never loads these files.
    artifacts = json.loads(Path(__file__).with_name('artifacts.json').read_text())
    models, hashes = {}, {}
    for hand in ('left', 'right'):
        relative = f'checkpoints/fingering_transformer_{hand}.pt'
        spec = next(a for a in artifacts if a['model'] == 'lumikey' and a['path'] == relative)
        path = root/'lumikey'/relative
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != spec['sha256']:
            raise ValueError('Weight hash mismatch')
        models[hand] = Transformer(path)
        hashes[hand] = digest
    result = {'study':request['study'], 'model':'lumikey', 'torch':torch.__version__,
              'requestSha256':hashlib.sha256(raw).hexdigest(), 'weightHashes':hashes, 'cases':[]}
    started = time.perf_counter()
    with torch.inference_mode():
        for index, case in enumerate(request['cases']):
            row = {'id':case['id'], 'hands':{}}
            for hand, prediction in case['hands'].items():
                notes = [n for n in case['contacts'] if n['hand'] == hand]
                if [n['id'] for n in notes] != prediction['contacts']:
                    raise ValueError('Contact identity mismatch')
                begin = time.perf_counter()
                candidates = prediction['candidates']
                scores = models[hand].score_sequences(notes, [c['fingers'] for c in candidates])
                if not all(math.isfinite(s) and s <= 0 for s in scores):
                    raise ValueError('Invalid sequence likelihood')
                # Existing beam scores must agree; classic has no prior score.
                for candidate, score in zip(candidates, scores):
                    if candidate['source'] == 'neural' and abs(candidate['logProbability']-score) > 0.001:
                        raise ValueError('Rescoring disagrees with frozen beam')
                row['hands'][hand] = {**prediction, 'candidates':[
                    {**c, 'logProbability':s} for c, s in zip(candidates, scores)],
                    'elapsedMs':(time.perf_counter()-begin)*1000}
            result['cases'].append(row)
            if index % 40 == 0:
                print('Scored likelihoods', index+1, '/', len(request['cases']), flush=True)
    result['elapsedMs'] = (time.perf_counter()-started)*1000
    Path(args.output).write_text(json.dumps(result, separators=(',', ':'))+'\n')
    print('Completed true sequence scores in', round(result['elapsedMs']/1000, 2), 'seconds')


if __name__ == '__main__':
    main()
