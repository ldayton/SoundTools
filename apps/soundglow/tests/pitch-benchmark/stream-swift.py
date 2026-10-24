"""Committed streaming outputs and actual audio availability; CPU time is separate."""
import argparse,hashlib,json,time
from pathlib import Path
import numpy as np
from swift_f0 import SwiftF0,concat
p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('output');p.add_argument('--pad',type=float,default=0);a=p.parse_args();m=json.loads(Path(a.manifest).read_text());out=Path(a.output);out.mkdir(parents=True,exist_ok=True);detector=SwiftF0(threads=1,spin=False)
for c in m['clips']:
 b=Path(c['pcm']).read_bytes();assert hashlib.sha256(b).hexdigest()==c['pcmSha256'];x=np.frombuffer(b,dtype='<f4');rate=c['sampleRate'];originalLength=len(x);padding=round(a.pad*rate);x=np.pad(x,(padding,padding));rows=[];calls=[];stream=detector.stream()
 for first in range(0,len(x),round(rate*.1)):
  chunk=x[first:first+round(rate*.1)];available=(first+len(chunk))/rate;start=time.perf_counter();r=stream.push(chunk,rate);calls.append((time.perf_counter()-start)*1000);rows.extend(dict(time=float(t),hz=float(h) if q>=.5 else 0,confidence=float(q),availableAt=available,flush=False) for t,h,q in zip(r.timestamps,r.pitch_hz,r.confidence))
 r=stream.flush();rows.extend(dict(time=float(t),hz=float(h) if q>=.5 else 0,confidence=float(q),availableAt=len(x)/rate,flush=True) for t,h,q in zip(r.timestamps,r.pitch_hz,r.confidence))
 # Assert committed online output agrees with whole-file inference; no retrospective smoothing.
 offline=detector.detect(x,rate);assert len(rows)==len(offline.timestamps);assert np.max(np.abs(np.array([r['time'] for r in rows])-offline.timestamps))<1e-8
 voiced=offline.confidence>=.5;accepted=np.array([r['hz'] for r in rows]);assert np.array_equal(accepted>0,voiced);error=np.abs(1200*np.log2(accepted[voiced]/offline.pitch_hz[voiced]));assert not len(error) or np.max(error)<1
 rows=[dict(r,time=r['time']-a.pad,availableAt=r['availableAt']-a.pad) for r in rows if r['time']>=a.pad-1e-8 and r['time']<a.pad+originalLength/rate-1e-8]
 delays=[(r['availableAt']-r['time'])*1000 for r in rows if not r['flush']];(out/(c['id']+'-swift-stream.json')).write_text(json.dumps(dict(algorithm='swift-f0',mode='streaming100msPackets',paddingSeconds=a.pad,pcmSha256=c['pcmSha256'],p95ProcessingMs=float(np.percentile(calls,95)),availabilityP50Ms=float(np.percentile(delays,50)),availabilityP95Ms=float(np.percentile(delays,95)),rows=rows)))
 print(c['id'],round(np.percentile(delays,95),1),'ms audio availability',flush=True)
