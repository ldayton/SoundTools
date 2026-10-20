"""Offline SwiftF0 adapter. Output is not a streaming latency measurement."""
import argparse, hashlib, importlib.metadata, json, time
from pathlib import Path
import numpy as np
from swift_f0 import SwiftF0
p=argparse.ArgumentParser();p.add_argument('pcm');p.add_argument('output');p.add_argument('--rate',type=int,default=48000);a=p.parse_args()
b=Path(a.pcm).read_bytes();audio=np.frombuffer(b,dtype='<f4')
model=SwiftF0(threads=1,spin=False);start=time.perf_counter();r=model.detect(audio,a.rate);elapsed=time.perf_counter()-start
rows=[dict(time=float(t),hz=float(h) if c>=.5 else 0,confidence=float(c)) for t,h,c in zip(r.timestamps,r.pitch_hz,r.confidence)]
package=Path(__import__('swift_f0').__file__).parent
models={str(f.relative_to(package)):hashlib.sha256(f.read_bytes()).hexdigest() for f in package.rglob('*.onnx')}
Path(a.output).parent.mkdir(parents=True,exist_ok=True)
Path(a.output).write_text(json.dumps(dict(algorithm='swift-f0',version=importlib.metadata.version('swift-f0'),modelHashes=models,pcmSha256=hashlib.sha256(b).hexdigest(),sampleRate=a.rate,confidenceThreshold=.5,lookaheadMs=176,mode='offline',elapsedSeconds=elapsed,trainingOverlap=['PTDB','MOCHA','CMU Arctic'],rows=rows),indent=2))
print(f'{len(rows)}frames;{elapsed:.3f}s computation; offline only')
