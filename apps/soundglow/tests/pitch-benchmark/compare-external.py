"""Pinned offline candidates on identical acquired PCM. Never tunes thresholds on scores."""
import argparse,hashlib,importlib.metadata,json,subprocess,tempfile,time,concurrent.futures
from pathlib import Path
import numpy as np
from swift_f0 import SwiftF0
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('output');p.add_argument('--limit',type=int,default=0);a=p.parse_args()
m=json.loads(Path(a.manifest).read_text());out=Path(a.output);out.mkdir(parents=True,exist_ok=True);model=SwiftF0(threads=1,spin=False)
package=Path(__import__('swift_f0').__file__).parent;models={str(f.relative_to(package)):hashlib.sha256(f.read_bytes()).hexdigest() for f in package.rglob('*.onnx')}
def compare(c):
 b=(ROOT/c['pcm']).read_bytes();assert hashlib.sha256(b).hexdigest()==c['pcmSha256'];pcm=np.frombuffer(b,dtype='<f4');start=time.perf_counter();r=model.detect(pcm,c['sampleRate'])
 rows=[dict(time=float(t),hz=float(h) if q>=.5 else 0,confidence=float(q)) for t,h,q in zip(r.timestamps,r.pitch_hz,r.confidence)]
 (out/(c['id']+'-swift-f0.json')).write_text(json.dumps(dict(algorithm='swift-f0',version=importlib.metadata.version('swift-f0'),modelHashes=models,pcmSha256=c['pcmSha256'],confidenceThreshold=.5,lookaheadMs=176,mode='offline-whole-file',elapsedMs=(time.perf_counter()-start)*1000,rows=rows)))
 wav=str(ROOT/c['files']['mic']['file'])
 for method in ['praat','reaper']:
  cached=out/(c['id']+'-'+method+'.json')
  if cached.exists():
   prior=json.loads(cached.read_text());binary=ROOT/('outputs/pitch-benchmark/REAPER/build/reaper' if method=='reaper' else '/Applications/Praat.app/Contents/MacOS/Praat')
   if prior.get('binarySha256')==hashlib.sha256(binary.read_bytes()).hexdigest() and prior.get('wavSha256')==hashlib.sha256(Path(wav).read_bytes()).hexdigest():continue
  subprocess.run([__import__('sys').executable,str(ROOT/f'tests/pitch-benchmark/{method}-adapter.py'),wav,str(out/(c['id']+'-'+method+'.json'))],check=True,capture_output=True,cwd=ROOT)
 print(c['id'],flush=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 list(pool.map(compare,m['clips'][:a.limit or None]))
