import os
"""Conservative EGG voiced anchors; unknown frames are excluded, never silent truth."""
import hashlib,json
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfiltfilt,resample_poly,correlate,find_peaks

def derive(egg,sr=8000):
 if sr!=8000 or np.asarray(egg).ndim!=1 or not np.all(np.isfinite(egg)):raise ValueError('Expected finite mono8kHz EGG')
 energies=[];rows=[];details=[]
 times=np.arange(0,len(egg)/sr,.01)
 for t in times:
  a=round((t-.03)*sr);z=a+480
  if a<0 or z>len(egg):rows.append(dict(time=float(t),hz=0,exclude=True));continue
  y=egg[a:z];y=y-y.mean();energy=float(np.sqrt(np.mean(y*y)));energies.append(energy);ac=correlate(y,y,method='fft')[len(y)-1:];lags=np.arange(8,161);sq=np.cumsum(y*y);den=np.sqrt(sq[len(y)-lags-1]*np.cumsum(y[::-1]**2)[len(y)-lags-1]);v=ac[lags]/np.maximum(den,1e-20);peaks=find_peaks(v)[0];strong=peaks[v[peaks]>.9];hz=0;quality=0;pulseError=None
  if len(strong):
   k=int(strong[0]);lag=float(lags[k]);d=v[k-1]-2*v[k]+v[k+1] if 0<k<len(v)-1 else 0;delta=.5*(v[k-1]-v[k+1])/d if d else 0;candidate=sr/(lag+delta);dx=np.diff(y);agreement=[]
   for sign in [1,-1]:
    p,_=find_peaks(sign*dx,distance=max(2,round(lag*.65)),prominence=max(abs(dx))*.2);intervals=np.diff(p)
    if len(intervals)>=2:
     period=float(np.median(intervals));variation=float(np.median(abs(intervals-period))/period);err=abs(1200*np.log2((sr/period)/candidate));agreement.append((err,variation))
   if agreement:
    pulseError,variation=min(agreement)
    if pulseError<=50 and variation<=.1:hz=candidate;quality=float(v[k])
  rows.append(dict(time=float(t),hz=float(hz),exclude=not hz));details.append(dict(time=float(t),rms=energy,quality=quality,pulseErrorCents=pulseError))
 # Reject electrical residue with negligible amplitude; never turn it into reference unvoicing.
 amplitudeFloor=np.percentile(energies,95)*.01 if energies else float('inf');lookup={round(d['time'],6):d for d in details}
 for r in rows:
  if lookup.get(round(r['time'],6),{}).get('rms',0)<amplitudeFloor:r.update(hz=0,exclude=True)
 return rows

def main():
 ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('AVID_OUTPUT',str(ROOT/'outputs/pitch-benchmark/avid')));doc=json.loads((OUT/'decoded.json').read_text());summary=[]
 for c in doc['clips']:
  sr,w=wavfile.read(ROOT/c['paired']);assert sr==44100;egg=resample_poly(w[:,c['eggChannel']].astype(float),80,441);sr=8000;egg=sosfiltfilt(butter(3,20,btype='highpass',fs=sr,output='sos'),egg);rows=derive(egg,sr)
  # Both analysis input and EGG are cropped from the same raw stereo samples.
  # Repository2 waveform agreement locates/labels the excerpt; its processing
  # differences must not censor otherwise valid synchronous EGG anchors.
  target=OUT/'reference'/(c['id']+'.json');target.parent.mkdir(exist_ok=True);b=json.dumps(rows).encode();target.write_bytes(b);c.update(reference=str(target.relative_to(ROOT)),referenceSha256=hashlib.sha256(b).hexdigest());accepted=[r for r in rows if not r['exclude']];summary.append(dict(id=c['id'],condition=c['condition'],frames=len(rows),verifiedVoiced=len(accepted),above400=sum(r['hz']>400 for r in accepted),medianHz=float(np.median([r['hz'] for r in accepted])) if accepted else None));print(summary[-1],flush=True)
 doc.update(timingVerified=True,referenceOrigin=0,timing=dict(hop=.01,tolerance=.0081,transitionMask=0),referenceNote='EGG anchor reference only; incomplete voicing ground truth. NCC>.9 plus derivative-pulse agreement<=50c and interval variation<=10%; excluded frames are unknown, not unvoiced.60ms support, zero-phase highpass, native paired clock.');(OUT/'scoring-manifest.json').write_text(json.dumps(doc,indent=2));(OUT/'egg-quality.json').write_text(json.dumps(summary,indent=2))

if __name__=='__main__':main()
