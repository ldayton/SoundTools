"""Export independent cross-runtime inputs/logits for the browser probe."""
import argparse
import json
from pathlib import Path

import torch
from infer import Transformer,tokens

parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args()
root=Path(args.directory)
notes=[{'midi':v,'time':i*250,'duration':250} for i,v in enumerate([60,62,64,65,67,69,71,72,71,69,67,65,64,62,60])]
rows=[]
with torch.inference_mode():
    for hand in ('left','right'):
        model=Transformer(root/f'upstream/lumikey/checkpoints/fingering_transformer_{hand}.pt')
        previous=[(-1,float('inf')) for _ in range(5)]
        for i,note in enumerate(notes):
            t=tokens(note,previous,notes[i+1:]);logits=model.logits(t[None])[0]
            rows.append({'hand':hand,'tokens':t.flatten().tolist(),'logits':logits.tolist()})
            finger=int(logits.argmax());previous[finger]=(note['midi'],-note['duration']/1000)
            previous=[(midi,age+.25) for midi,age in previous]
(root/'onnx-probe.json').write_text(json.dumps(rows)+'\n')
print(len(rows),'cross-runtime probes')
