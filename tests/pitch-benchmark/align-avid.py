"""Locate released snippets in synchronous raw microphone/EGG by waveform matching.
Reject ambiguous/inexact matches instead of assuming the two repositories share timestamps.
"""
import json,hashlib,math,subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly,correlate
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-benchmark/avid';doc=json.loads((OUT/'acquired.json').read_text());clips=[]
for sp in doc['speakers']:
 sr,raw=wavfile.read(ROOT/sp['rawPrefix']);assert raw.shape[1]==2
 low=[resample_poly(raw[:,i].astype(float),80,441) for i in [0,1]]
 for c in sp['clips']:
  rate,y=wavfile.read(ROOT/c['file']);assert y.ndim==1;g=math.gcd(rate,8000);yl=resample_poly(y.astype(float),8000//g,rate//g);yl-=yl.mean();matches=[]
  for channel in [0,1]:
   x=low[channel];corr=correlate(x,yl,mode='valid',method='fft');sums=np.r_[0,np.cumsum(x)];sq=np.r_[0,np.cumsum(x*x)];n=len(yl);energy=np.maximum(sq[n:]-sq[:-n]-(sums[n:]-sums[:-n])**2/n,1e-12);norm=corr/np.sqrt(energy*np.sum(yl*yl));k=int(np.argmax(norm));matches.append((float(norm[k]),k/8000,channel))
  quality,start,channel=max(matches)
  if quality<.4:raise ValueError(f'Poor match{c["id"]}: {matches}')
  # Refine at original rate around the decimated estimate to sub-sample-grid accuracy.
  yr=resample_poly(y.astype(float),sr//math.gcd(sr,rate),rate//math.gcd(sr,rate));yr-=yr.mean();a=max(0,round(start*sr)-20);end=min(len(raw),round(start*sr)+len(yr)+20);cross=correlate(raw[a:end,channel].astype(float),yr,mode='valid',method='fft');sample=a+int(np.argmax(cross));n=len(yr)
  pairedMic=raw[sample:sample+n,channel].astype(float);matched=[]
  for t in np.arange(0,n/sr,.01):
   left=round((t-.03)*sr);right=left+round(.06*sr)
   if left<0 or right>n:matched.append(False);continue
   xx=pairedMic[left:right];yy=yr[left:right];q=float(np.corrcoef(xx,yy)[0,1]) if np.std(xx)>0 and np.std(yy)>0 else 0;matched.append(bool(q>=.95))
  if sum(matched)<10:print('Insufficient verified alignment; frames remain unknown:',c['id'],flush=True)
  target=OUT/'paired'/(c['id']+'.wav');target.parent.mkdir(exist_ok=True);wavfile.write(target,sr,raw[sample:sample+n]);pcm=target.with_suffix('.f32');data=resample_poly(raw[sample:sample+n,channel].astype(float)/32768,160,147).astype('<f4').tobytes();pcm.write_bytes(data)
  mic=target.with_name(target.stem+'-mic.wav');wavfile.write(mic,sr,raw[sample:sample+n,channel])
  clips.append(dict(id=c['id'],corpus='avid',speaker=sp['speaker'],condition=c['condition'],split='external-evaluation',sampleRate=48000,pcm=str(pcm.relative_to(ROOT)),pcmSha256=hashlib.sha256(data).hexdigest(),paired=str(target.relative_to(ROOT)),speechChannel=channel,eggChannel=1-channel,rawStartSample=sample,rawRate=sr,match=quality,matchedFrames=matched,matchedFraction=sum(matched)/len(matched),channelMatches=matches,files={'mic':{'file':str(mic.relative_to(ROOT))}}))
  print(c['id'],round(quality,6),round(sample/sr,3),'mic channel',channel,flush=True)
(OUT/'decoded.json').write_text(json.dumps(dict(clips=clips,referenceNote='Only paired waveforms prepared; EGG-derived references need quality audit'),indent=2))
