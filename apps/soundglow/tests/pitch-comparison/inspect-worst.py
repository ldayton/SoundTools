"""Local acoustic audit. Alternative trackers are corroboration, never ground truth."""
import csv,hashlib,json,subprocess
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft,correlate,find_peaks
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/pitch-comparison/worst-cases'; OUT.mkdir(exist_ok=True,parents=True)
r=json.loads((ROOT/'outputs/pitch-comparison/voicing-comparison/results.json').read_text())
clips=sorted([c for c in r['clips'] if c['category']=='far-field-speech' and c['variants']['baseline']['retained']],key=lambda c:c['variants']['hybrid6-0.35']['retained']/c['variants']['baseline']['retained'])[:8]
summary=[]
for c in clips:
 file=ROOT/c['file']; assert hashlib.sha256(file.read_bytes()).hexdigest()==c['sourceSha256']
 sr,raw=wavfile.read(file); x=raw.astype(float)/(32768 if raw.dtype==np.int16 else 1)
 assert x.ndim==1
 ident=file.stem[:4]
 text=subprocess.check_output(['/Applications/Praat.app/Contents/MacOS/Praat','--run',str(ROOT/'tests/pitch-comparison/reference-pitch.praat'),str(file)],text=True)
 (OUT/(ident+'.tsv')).write_text(text)
 refs={i:[] for i in range(1,5)}
 for row in csv.DictReader(text.splitlines(),delimiter='\t'):
  refs[int(row['method'])].append([float(row['time']),0 if row['hz']=='--undefined--' else float(row['hz'])])
 reject=c['variants']['hybrid6-0.35']['rejected']; rejected=[row for row in c['rows'] if row['time'] in reject]
 concordance={}
 for method,points in refs.items():
  counts={'same50c':0,'octaveRelated50c':0,'otherVoiced':0,'unvoiced':0,'outside':0}
  for p in rejected:
   q=min(points,key=lambda q:abs(q[0]-p['time']))
   if abs(q[0]-p['time'])>.00501: counts['outside']+=1;continue
   if q[1]<=0: counts['unvoiced']+=1;continue
   cents=1200*np.log2(q[1]/p['pitch'])
   key='same50c' if abs(cents)<=50 else 'octaveRelated50c' if min(abs(cents-1200),abs(cents+1200))<=50 else 'otherVoiced'
   counts[key]+=1
  concordance[method]=counts
 # Normalized autocorrelation at long delays, to detect repeated audio fragments.
 z=x-x.mean(); ac=correlate(z,z,method='fft')[len(z)-1:];sq=np.concatenate([[0],np.cumsum(z*z)]);lags=np.arange(round(sr*.25),min(round(sr*2),len(z)-1));den=np.sqrt(sq[len(z)-lags]*(sq[-1]-sq[lags]));norm=ac[lags]/np.maximum(den,1e-20);best=int(lags[np.argmax(norm)]);repeat={'lagSeconds':best/sr,'normalizedCorrelation':float(np.max(norm)),'equalSampleFraction':float(np.mean(raw[:-best]==raw[best:]))}
 fig,ax=plt.subplots(2,1,figsize=(14,7),gridspec_kw={'height_ratios':[3,1]},layout='constrained')
 f,t,Z=stft(x,sr,nperseg=round(sr*.04),noverlap=round(sr*.035),nfft=4096,boundary=None);db=20*np.log10(np.maximum(np.abs(Z),1e-10));ax[0].pcolormesh(t,f,db,vmin=db.max()-60,vmax=db.max(),cmap='magma',shading='auto',rasterized=True)
 ax[0].set_ylim(50,1200);ax[0].set_ylabel('Hz');ax[0].set_title(f'{ident}: original recording; cyan retained / red rejected; green filtered AC / white raw CC')
 for method,col in [(2,'white'),(3,'lime')]:
  a=np.array(refs[method]);valid=a[:,1]>0;ax[0].scatter(a[valid,0],a[valid,1],s=4,c=col,alpha=.6,label={2:'whole-clip raw CC',3:'whole-clip filtered AC (top1200)'}[method])
 accepted=[p for p in c['rows'] if p['pitch']>0 and p['strength']>=.45 and p['time'] not in reject]
 for points,color,label in [(accepted,'cyan','retained streaming estimates'),(rejected,'red','hybrid-rejected estimates')]:
  ax[0].scatter([p['time'] for p in points],[p['pitch'] for p in points],s=18,c=color,label=label,edgecolors='black',linewidths=.3)
 ax[0].legend(loc='upper right',fontsize=8);ax[1].plot(np.arange(len(x))/sr,x,lw=.4,color='#35475b');ax[1].set_xlabel('Seconds');ax[1].set_ylabel('Amplitude')
 for p in rejected:ax[1].axvspan(p['time']-.005,p['time']+.005,color='red',alpha=.1)
 for a in ax:a.set_xlim(0,len(x)/sr)
 fig.savefig(OUT/(ident+'-overview.png'),dpi=140);plt.close(fig)
 summary.append({'id':c['id'],'file':c['file'],'sha256':c['sourceSha256'],'baseline':c['variants']['baseline']['retained'],'retained':c['variants']['hybrid6-0.35']['retained'],'rejected':rejected,'referenceAgreement':concordance,'repeat':repeat,'references':refs})
 print(ident,'rejected',len(rejected),'repeat',repeat,'agreements',concordance,flush=True)
(OUT/'audit.json').write_text(json.dumps({'warning':'Acoustic corroboration, not ground truth; whole-clip reference analysis has more context than streaming.','praatVersion':subprocess.check_output(['/Applications/Praat.app/Contents/MacOS/Praat','--version'],text=True).strip(),'praatBinarySha256':hashlib.sha256(Path('/Applications/Praat.app/Contents/MacOS/Praat').read_bytes()).hexdigest(),'clips':summary},indent=2))
