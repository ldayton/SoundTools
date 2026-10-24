"""Fixed secondary stress test:20originals/20speakers,2SNRs,3known negatives.
Variants share speakers/originals and are not additional independent observations.
"""
import hashlib,json,math
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-benchmark/moderate-noise';OUT.mkdir(exist_ok=True);doc=json.loads((OUT.parent/'stream-manifest.json').read_text());sources=json.loads((ROOT/'tests/pitch-comparison/practice-noise-sources.json').read_text());noises=[]
for s in sources:
 b=(ROOT/s['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==s['sha256'];rate,x=wavfile.read(ROOT/s['file']);g=math.gcd(rate,48000);noises.append(resample_poly(x.astype(float)/32768,48000//g,rate//g))
clips=[]
def save(c,x,ref):
 target=OUT/(c['id']+'.f32');b=x.astype('<f4').tobytes();target.write_bytes(b);rpath=OUT/(c['id']+'-ref.json');rb=json.dumps(ref).encode();rpath.write_bytes(rb);return dict(c,pcm=str(target.relative_to(ROOT)),pcmSha256=hashlib.sha256(b).hexdigest(),reference=str(rpath.relative_to(ROOT)),referenceSha256=hashlib.sha256(rb).hexdigest())
for index,c in enumerate(doc['clips']):
 b=(ROOT/c['pcm']).read_bytes();assert hashlib.sha256(b).hexdigest()==c['pcmSha256'];x=np.frombuffer(b,dtype='<f4').astype(float);ref=json.loads((ROOT/c['reference']).read_text());mask=np.zeros(len(x),bool)
 for r in ref:
  if r['hz']>0:mask[max(0,round((r['time']-.005)*48000)):min(len(x),round((r['time']+.005)*48000))]=True
 speechRms=np.sqrt(np.mean(x[mask]**2));bed=np.concatenate([noises[(index+j)%3] for j in range(3)])[:len(x)];assert len(bed)==len(x);noiseRms=np.sqrt(np.mean(bed*bed))
 for snr in [20,10]:
  mixed=x+bed*(speechRms/noiseRms)*10**(-snr/20);assert max(abs(mixed))<1;clips.append(save(dict(c,id=c['id']+f'-snr{snr}',original=c['id'],condition=f'noise{snr}',snr=snr),mixed,ref))
for s,x in zip(sources,noises):
 c=dict(id='negative-'+s['category'],corpus='esc50',speaker=s['category'],split='negative',condition='noise-only',sampleRate=48000);clips.append(save(c,x,[dict(time=i*.01,hz=0) for i in range(math.floor(len(x)/480))]))
doc.update(clips=clips,noiseSources=sources,mixing='Noise bed concatenates3distinct5second noises, order rotates by speaker. No looping.20/10dB relative to original reference-voiced speech RMS; noise RMS over entire excerpt. No clipping/normalization. CC BY-NC research inputs not shipped.');(OUT/'manifest.json').write_text(json.dumps(doc,indent=2));print(len(clips),'secondary cases;20independent speech originals and3noise sources')
