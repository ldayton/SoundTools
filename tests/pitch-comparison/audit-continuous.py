"""Check source continuity/repetition and estimate acoustic far/headset alignment."""
import hashlib,json
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate,butter,sosfilt
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-comparison/filtered-stream';manifest=json.loads((OUT/'continuous.json').read_text());records=[]
for far in [c for c in manifest['clips'] if c['channel']=='Array1-01']:
 head=next(c for c in manifest['clips'] if c['meeting']==far['meeting'] and c['sourceStart']==far['sourceStart'] and c['channel']=='Mix-Headset');data=[]
 for c in [far,head]:
  file=ROOT/c['wav'];assert hashlib.sha256(file.read_bytes()).hexdigest()==c['wavSha256'];sr,raw=wavfile.read(file);assert sr==48000 and len(raw)==30*sr;x=raw[::3].astype(float)/32768;z=x-x.mean();n=len(z);ac=correlate(z,z,method='fft')[n-1:];sq=np.r_[0,np.cumsum(z*z)];lags=np.arange(4000,32001);den=np.sqrt(sq[n-lags]*(sq[-1]-sq[lags]));corr=ac[lags]/np.maximum(den,1e-20);best=int(lags[np.argmax(corr)]);exact=any(np.array_equal(raw[:-int(k*3)],raw[int(k*3):]) for k in lags[corr>1-1e-10]);data.append((x,{'id':c['id'],'peakLongDelayCorrelation':float(np.max(corr)),'peakLongDelaySeconds':best/16000,'exactRepeatAtQuarterToTwoSeconds':bool(exact),'seconds':len(raw)/sr,'rms':float(np.sqrt(np.mean(x*x)))}))
 # Time alignment is acoustic, not optimized for pitch agreement.
 signals=[sosfilt(butter(4,[100,3000],fs=16000,btype='band',output='sos'),d[0]) for d in data];windows=[]
 for start in range(0,27,3):
  a,b=[s[start*16000:(start+3)*16000] for s in signals];v=correlate(a,b,method='fft');lags=np.arange(-800,801);v=v[len(a)-1+lags];norm=np.sqrt(np.sum(a*a)*np.sum(b*b));v=v/max(norm,1e-20);i=int(np.argmax(v));windows.append({'start':start,'lagSeconds':float(lags[i]/16000),'correlation':float(v[i])})
 usable=[w['lagSeconds'] for w in windows if w['correlation']>=.15];lag=float(np.median(usable)) if usable else None;mad=float(np.median(np.abs(np.array(usable)-lag))) if usable else None
 records.append({'far':far['id'],'headset':head['id'],'channels':[d[1] for d in data],'alignment':{'windows':windows,'lagSeconds':lag,'madSeconds':mad,'usableWindows':len(usable),'stable':len(usable)>=3 and mad<=.003 if usable else False}})
 print(far['id'],'long-delay',data[0][1]['peakLongDelayCorrelation'],'alignment',lag,mad,len(usable),flush=True)
(OUT/'continuity.json').write_text(json.dumps({'description':'Unedited source excerpts, acoustic alignment estimated independently of pitch; no exact repeats found is bounded evidence, not proof of every possible nonperiodicity.','pairs':records},indent=2))
