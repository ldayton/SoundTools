"""Evidence panels for specific rejected events; no inferred accuracy labels."""
import json
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft,find_peaks
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'outputs/pitch-comparison/worst-cases'
r=json.loads((OUT/'audit.json').read_text());cases=[('0011',2.84),('0014',.255),('0095',.08),('0041',3.115),('0032',.255),('0065',.37),('0071',.45),('0085',.49)]
for ident,center in cases:
 c=next(c for c in r['clips'] if Path(c['file']).name.startswith(ident));sr,raw=wavfile.read(ROOT/c['file']);x=raw.astype(float)/32768
 fig,axs=plt.subplots(2,2,figsize=(12,7),layout='constrained');lo=max(0,center-.12);hi=min(len(x)/sr,center+.15)
 f,t,z=stft(x,sr,nperseg=round(sr*.04),noverlap=round(sr*.038),nfft=4096,boundary=None);db=20*np.log10(np.maximum(np.abs(z),1e-10));axs[0,0].pcolormesh(t,f,db,vmin=db.max()-55,vmax=db.max(),shading='auto',cmap='magma');axs[0,0].set(xlim=(lo,hi),ylim=(50,1300),ylabel='Hz',xlabel='Seconds',title='Harmonic structure and rejected estimates')
 red=[p for p in c['rejected'] if lo<=p['time']<=hi];axs[0,0].scatter([p['time'] for p in red],[p['pitch'] for p in red],s=24,c='red',edgecolor='white',linewidth=.5)
 for method,col in [('2','white'),('3','lime')]:
  q=np.array(c['references'][method]);q=q[(q[:,0]>=lo)&(q[:,0]<=hi)&(q[:,1]>0)];axs[0,0].scatter(q[:,0],q[:,1],s=7,c=col)
 p=min(c['rejected'],key=lambda p:abs(p['time']-center));period=1/p['pitch']
 a=round((center-.025)*sr);b=round((center+.025)*sr);a=max(0,a);b=min(len(x),b);tt=np.arange(a,b)/sr;axs[0,1].plot(tt,x[a:b],lw=.8);axs[0,1].set(xlabel='Seconds',ylabel='Amplitude',title=f'Waveform; rejected pitch {p["pitch"]:.1f} Hz')
 for i in range(-4,5):axs[0,1].axvline(center+i*period,color='red',alpha=.2)
 a=max(0,round((center-.04)*sr));b=min(len(x),round((center+.04)*sr));v=x[a:b]-np.mean(x[a:b]);spec=np.abs(np.fft.rfft(v*np.hanning(len(v)),16384));freq=np.fft.rfftfreq(16384,1/sr);axs[1,0].plot(freq,20*np.log10(np.maximum(spec,1e-10)/max(spec)),lw=.8);axs[1,0].set(xlim=(50,1600),ylim=(-50,1),xlabel='Hz',ylabel='Relative dB',title='80 ms spectrum; red lines = candidate harmonics')
 for hz in np.arange(p['pitch'],1600,p['pitch']):axs[1,0].axvline(hz,color='red',alpha=.2)
 ac=np.correlate(v,v,mode='full')[len(v)-1:];ac=ac/(ac[0] or 1);lag=np.arange(len(ac))/sr;axs[1,1].plot(lag*1000,ac,lw=1);axs[1,1].axvline(period*1000,c='red',label='Proposed period');axs[1,1].set(xlim=(0,25),ylim=(-.7,1),xlabel='Lag, ms',ylabel='Normalized correlation',title='80 ms autocorrelation (diagnostic, not ground truth)');axs[1,1].legend()
 fig.suptitle(f'{ident} at {center:.3f} s — red rejected, green filtered AC, white raw CC',fontsize=13);fig.savefig(OUT/(ident+'-focus.png'),dpi=140);plt.close(fig)
