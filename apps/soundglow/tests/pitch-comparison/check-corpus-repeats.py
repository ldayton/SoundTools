"""Detect exact repeated PCM within local source files; no claim about original CHiME sessions."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'outputs/pitch-comparison/worst-cases'
inputs=json.loads((ROOT/'outputs/voice-gating/inputs.json').read_text());results=[]
for c in inputs:
 if c['category']!='far-field-speech':continue
 file=ROOT/c['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==c['sha256'];sr,raw=wavfile.read(file);z=raw.astype(float);z-=z.mean();ac=correlate(z,z,method='fft')[len(z)-1:];sq=np.r_[0,np.cumsum(z*z)];lags=np.arange(round(sr*.25),min(round(sr*2),len(z)-1));den=np.sqrt(sq[len(z)-lags]*(sq[-1]-sq[lags]));n=ac[lags]/np.maximum(den,1e-20);candidates=lags[n>1-1e-10];lag=next((int(k) for k in candidates if np.array_equal(raw[:-k],raw[k:])),int(lags[np.argmax(n)]));exact=bool(np.array_equal(raw[:-lag],raw[lag:]));results.append({'file':c['file'],'sourceSha256':c['sha256'],'lagSeconds':lag/sr,'exactRepeat':exact,'equalFraction':float(np.mean(raw[:-lag]==raw[lag:]))})
(out/'source-repeats.json').write_text(json.dumps(results,indent=2));print('Exact repeats at 0.25–2 s offsets:',sum(r['exactRepeat'] for r in results),'/',len(results))
