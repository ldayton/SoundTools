#!/usr/bin/env python3
"""Explicit maintainer action, after prepare.py ran native Praat. Never run in CI."""
from pathlib import Path
import argparse, gzip, hashlib, json, re, struct, subprocess
parser=argparse.ArgumentParser();parser.add_argument('--praat',required=True,type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[2];generated=root/'tests/visual/generated';target=root/'tests/visual/fixtures';target.mkdir(exist_ok=True)
text=(generated/'matched-native-matrix.txt').read_text()
number=lambda key:float(re.search(r'^'+key+r' = ([^ \n]+)',text,re.M)[1])
frames=2000;bins=int(number('ny'));power=[None]*(frames*bins)
for m in re.finditer(r'z \[(\d+)\] \[(\d+)\] = ([^ \n]+)',text):
 f,t=int(m[1])-1,int(m[2])-1
 if t<frames:power[t*bins+f]=float(m[3])
assert all(v is not None and v>=0 for v in power)
assets={}
for name,data in [('english.f32.gz',(generated/'matched.f32').read_bytes()),('native-power.f64.gz',struct.pack('<'+'d'*len(power),*power))]:
 compressed=gzip.compress(data,mtime=0);(target/name).write_bytes(compressed)
 assets[name]={'sha256':hashlib.sha256(compressed).hexdigest(),'decodedSha256':hashlib.sha256(data).hexdigest(),'decodedBytes':len(data)}
version=subprocess.check_output([str(args.praat.resolve()),'--version'],text=True).strip()
metadata={'schema':1,'description':'English speech 12–22 s, with right context; native Praat reference, not WASM-derived','native':{'version':version,'executableSha256':hashlib.sha256(args.praat.read_bytes()).hexdigest(),'script':(generated/'reference.praat').read_text().replace(str(root),'$REPO')},'settings':{'sampleRate':24000,'windowSeconds':.005,'maximumFrequency':5000,'timeStep':.005,'frequencyStep':10},'expected':{'frames':frames,'bins':bins,'firstTime':number('x1'),'timeStep':number('dx'),'firstFrequency':number('y1'),'frequencyStep':number('dy')},'tolerance':{'relativeRMSE':1e-6,'peakRelativeMaxError':1e-6,'absoluteErrorFloor':1e-12},'assets':assets}
(target/'reference.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Frozen native reference. Review changes; this does not approve screenshots.')
