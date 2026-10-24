"""Corpus-clock audit using laryngograph waveforms only, never a competing mic tracker.
This is a diagnostic; it does not silently bless whichever offset improves a detector.
"""
import json,hashlib
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly, butter, sosfiltfilt, find_peaks, correlate
ROOT=Path(__file__).resolve().parents[2];folder=ROOT/'outputs/pitch-benchmark/ptdb';doc=json.loads((folder/'acquired.json').read_text());out=[]
for c in [x for x in doc['clips'] if x['split']=='development'][::4]:
    item=c['files']['lar'];b=(ROOT/item['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==item['sha256']
    sr,x=wavfile.read(ROOT/item['file']);x=resample_poly(x.astype(float),1,6);sr/=6;x=sosfiltfilt(butter(4,25,fs=sr,btype='highpass',output='sos'),x)
    ref=np.loadtxt(ROOT/c['files']['ref']['file']);hop=.002;times=np.arange(.04,len(x)/sr-.04,hop);hz=[];quality=[]
    for t in times:
        a=round((t-.03)*sr);y=x[a:a+round(.06*sr)];y=y-y.mean();ac=correlate(y,y,method='fft')[len(y)-1:];lags=np.arange(round(sr/600),round(sr/50));den=np.sqrt(np.cumsum(y*y)[len(y)-lags-1]*(np.cumsum(y[::-1]**2)[len(y)-lags-1]));v=ac[lags]/np.maximum(den,1e-20);peaks=find_peaks(v)[0]
        if not len(peaks):hz.append(0);quality.append(0);continue
        # Pick the first strong peak, avoiding double-period attraction; ambiguous pulses are excluded.
        strong=peaks[v[peaks]>=max(.8,float(v[peaks].max())*.95)];k=int(strong[0]) if len(strong) else int(peaks[np.argmax(v[peaks])]);lag=float(lags[k]);delta=0
        if 0<k<len(v)-1:
            d=v[k-1]-2*v[k]+v[k+1];delta=.5*(v[k-1]-v[k+1])/d if d else 0
        hz.append(sr/(lag+delta));quality.append(v[k])
    hz=np.array(hz);quality=np.array(quality);scores=[]
    for offset in np.arange(0,.066,.002):
        rt=np.arange(len(ref))*.01+offset;indices=np.rint((rt-times[0])/hop).astype(int);valid=(indices>=0)&(indices<len(times))&(ref[:,0]>0);ii=indices[valid];rr=ref[valid,0];good=quality[ii]>.9;err=np.abs(1200*np.log2(np.maximum(hz[ii],1)/rr));scores.append(dict(offsetMs=round(offset*1000),frames=int(good.sum()),medianCents=float(np.median(err[good])),meanClippedCents=float(np.minimum(err[good],200).mean())))
    out.append(dict(id=c['id'],scores=scores));print(c['id'],min(scores,key=lambda s:s['meanClippedCents']),flush=True)
(folder/'timing-audit.json').write_text(json.dumps(dict(method='Independent60msEGG NCC; first strong pulse-period peak; quality>.9; offset sweep is corpus-clock diagnostic, not per-detector fitting',clips=out),indent=2))
