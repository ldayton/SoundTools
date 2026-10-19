"""Single prominent-speaker pilot, plus explicitly synthetic variable-noise stress cases."""
from pathlib import Path
import concurrent.futures,hashlib,json,subprocess,urllib.request,tempfile
from staged_corpus import publish
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt,resample_poly
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-comparison/near-mic';OUT.mkdir(parents=True,exist_ok=True);stage=tempfile.TemporaryDirectory(prefix='prepare-',dir=OUT);STAGE=Path(stage.name);sources=OUT/'sources';sources.mkdir(exist_ok=True)
def fetch(i):
 name=f'ES2004a.Headset-{i}.wav';url=f'https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/ES2004a/audio/{name}';p=sources/name
 if not p.exists():
  with urllib.request.urlopen(url,timeout=90) as response,open(str(p)+'.part','wb') as f:
   while True:
    b=response.read(1024*1024)
    if not b:break
    f.write(b)
  Path(str(p)+'.part').replace(p)
 sr,x=wavfile.read(p);assert sr==16000 and x.ndim==1
 return x.astype(float)/32768,{'url':url,'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'license':'CC BY 4.0','licenseSource':'https://groups.inf.ed.ac.uk/ami/download/','attribution':'AMI Consortium / University of Edinburgh'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:loaded=list(pool.map(fetch,range(4)))
length=min(len(x) for x,_ in loaded);signals=np.stack([x[:length] for x,_ in loaded]);hop=320;frames=length//hop;energy=np.sqrt(np.mean(signals[:,:frames*hop].reshape(4,frames,hop)**2,axis=2));clips=[]
noise_meta=json.loads((ROOT/'outputs/voice-gating/manifest.json').read_text());noise_categories=['rain','vacuum_cleaner','keyboard_typing'];noise=[];noise_sources=[]
for category in noise_categories:
 info=next(c for c in noise_meta if c['category']==category);p=ROOT/info['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==info['sha256'];sr,x=wavfile.read(p);x=x.astype(float)/32768;x=resample_poly(x,16000,sr);assert len(x)>=64000;noise.append(x[:64000]);noise_sources.append(info)
noise=np.concatenate(noise);noise=sosfilt(butter(3,[80,5000],fs=16000,btype='band',output='sos'),noise)
def save(ident,x,meta):
 assert len(x)==192000 and np.max(np.abs(x))<1,'No clipping/padding allowed';p=STAGE/(ident+'.wav');wavfile.write(p,16000,np.round(x*32767).astype(np.int16));pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-ar','48000','-ac','1','-f','f32le','pipe:1']);(STAGE/(ident+'.f32')).write_bytes(pcm);clips.append({'id':ident,'wav':str((OUT/p.name).relative_to(ROOT)),'seconds':12,'wavSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'pcmSha256':hashlib.sha256(pcm).hexdigest(),**meta})
for i,(signal,source) in enumerate(loaded):
 own=energy[i];other=np.max(np.delete(energy,i,axis=0),axis=0);active=own>np.quantile(own,.9)*.15;dominant=active&(own>2*other);competing=(other>own/2)&(other>np.quantile(other,.9)*.15)
 width=600;dominance=np.convolve(dominant,np.ones(width),mode='valid')/width;comp=np.convolve(competing,np.ones(width),mode='valid')/width;score=dominance-.5*comp;start=int(np.argmax(score));fraction=float(dominance[start]);assert fraction>=.55,'No sufficiently prominent continuous passage';x=signal[start*hop:start*hop+192000];meta={'source':source,'sourceStart':start*.02,'dominantFrameFraction':fraction,'competingFrameFraction':float(comp[start]),'selection':'Best 12-second target-dominance energy window, before pitch evaluation; no claim of frame-level speaker labels.'}
 ident=f'voice-{i}';save(ident+'-original',x,{**meta,'condition':'Original headset recording, other voices distant'})
 voice_rms=np.sqrt(np.mean(x*x));mixed=x.copy();snrs=[24,14,20]
 for k,snr in enumerate(snrs):
  segment=noise[k*64000:(k+1)*64000];scale=voice_rms/max(np.sqrt(np.mean(segment*segment)),1e-12)*10**(-snr/20);mixed[k*64000:(k+1)*64000]+=segment*scale
 # A 20 ms blend at transitions prevents an artificial step transient, without repeating noise.
 for boundary in [64000,128000]:
  n=160;ramp=np.linspace(0,1,2*n);added=mixed-x;left=added[boundary-n];right=added[boundary+n];added[boundary-n:boundary+n]=(1-ramp)*left+ramp*right;mixed=x+added
 save(ident+'-variable-noise',mixed,{**meta,'condition':'Controlled synthetic addition of three nonvoice noises, 24/14/20 dB global-RMS SNR; not a real phone recording','noiseSources':noise_sources,'noiseIntervals':[[0,4,'rain',24],[4,8,'vacuum_cleaner',14],[8,12,'keyboard_typing',20]],'snrNote':'Relative to whole-excerpt speech RMS; not per-frame speech SNR. Source speech and its original background are unchanged.'})
 print(ident,meta['sourceStart'],fraction,meta['competingFrameFraction'],flush=True)
manifest={'target':'One prominent voice, ordinary microphone imperfections; original recordings primary, labelled controlled-noise variants secondary. Four speakers from one meeting, not a representative phone benchmark.','clips':clips}
pin=ROOT/'tests/pitch-comparison/near-mic-manifest.json'
publish(STAGE,OUT,manifest,json.loads(pin.read_text()))
stage.cleanup()
