"""Local plots and playable excerpts for the matched WASM streaming experiment."""
import html,json,hashlib
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft,resample_poly
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-comparison/filtered-stream';data=json.loads((OUT/'results.json').read_text());scores=json.loads((OUT/'paired-scores.json').read_text());audit=json.loads((OUT/'continuity.json').read_text());clips={c['id']:c for c in data['clips']};methods=['raw','filteredMatched','filteredDefaults'];labels={'raw':'Raw AC (current app)','filteredMatched':'Filtered AC, same path settings','filteredDefaults':'Filtered AC, stricter path settings'}
selected=['clean','0011','0085','IS1009a-090-far','TS3003a-180-far']
for ident in selected:
 c=clips[ident]
 if ident=='clean':file=ROOT/'outputs/pitch-comparison/audit-v2/case-00.wav'
 elif 'wav' in c:file=ROOT/c['wav']
 else:file=ROOT/c['file']
 sr,x=wavfile.read(file);x=x.astype(float)/32768;x=resample_poly(x,16000,sr) if sr!=16000 else x;sr=16000
 f,t,z=stft(x,sr,nperseg=640,noverlap=560,nfft=4096,boundary=None);db=20*np.log10(np.maximum(np.abs(z),1e-10));fig,axes=plt.subplots(3,1,figsize=(14,9),sharex=True)
 fig.subplots_adjust(left=.07,right=.99,top=.91,bottom=.07,hspace=.3)
 for ax,method in zip(axes,methods):
  ax.pcolormesh(t,f,db,vmin=db.max()-60,vmax=db.max(),shading='auto',cmap='magma',rasterized=True);ax.set_ylim(50,1200);ax.set_ylabel('Hz');ax.set_title(labels[method]);rows=[r for r in c['variants'][method]['rows'] if 50<=r['pitch']<1200 and r['strength']>=.45];ax.scatter([r['time'] for r in rows],[r['pitch'] for r in rows],s=5,c='cyan',edgecolors='black',linewidths=.15)
  if ident=='clean':
   for start,end in [(.9,1.05),(2.1,2.2),(2.6,2.75),(3.9,4.05)]:ax.axvspan(start,end,facecolor='none',edgecolor='white',linewidth=1,linestyle='--')
 axes[-1].set_xlabel('Seconds within unchanged excerpt');axes[-1].set_xlim(0,c['seconds']);fig.suptitle(ident+'\nIdentical 200 ms analysis inputs, 100 ms advance, 50 ms margins',fontsize=14);fig.savefig(OUT/(ident+'-comparison.png'),dpi=130);plt.close(fig)
text='''<!doctype html><meta charset="utf-8"><title>Matched streaming pitch comparison</title><style>body{background:#101620;color:#e7edf5;font:17px system-ui;margin:24px;max-width:1300px}a{color:#ffae7b}img{width:100%}td,th{padding:8px;border:1px solid #56697d}table{border-collapse:collapse}p{line-height:1.5}.warning{padding:16px;background:#402830}article{margin:40px 0}</style><h1>Filtered AC under matched streaming conditions</h1><p class="warning">No clear improvement: the two original clean-speech spikes disappear, but two high excursions appear elsewhere. Paired headset agreement is lower with filtered AC. Production app unchanged.</p><p>Research WASM through production processor and PraatStream: identical PCM, frame times, 200 ms inputs with 50 ms margins and 100 ms advance. Raw-mode parity with the shipped WASM is asserted for every observation in all 27 inputs. All arms use a 50–1200 Hz range and identical display grouping, without the hybrid filter.</p><p>New material: nine fixed, continuous 30-second meeting passages (270 seconds) from three AMI meetings; distant microphone and simultaneous headset mix retained separately. No artificial noise, padding or looping. The bounded exact-repeat test finds none in these excerpts. <a href="https://groups.inf.ed.ac.uk/ami/download/">AMI Consortium / University of Edinburgh, CC BY 4.0</a>.</p><p>Headset comparison uses only strong raw/filtered headset consensus, acoustic alignment independent of pitch, and an eight-pair subset with stable alignment. It is a proxy, not ground-truth accuracy. The headset mix can contain multiple speakers. One unstable pair remains in detector comparisons but is excluded below.</p><table><tr><th>Method<th>Agreement within 50 cents<th>Unvoiced at reference frames</tr>'''
for name,v in scores['aggregate']['0'].items():text+=f'<tr><td>{labels[name]}<td>{v["agrees50c"]} / {v["referenceFrames"]} ({100*v["agrees50c"]/v["referenceFrames"]:.1f}%)<td>{v["unvoiced"]} ({100*v["unvoiced"]/v["referenceFrames"]:.1f}%)</tr>'
text+='</table><h2>All nine distant/headset pairs</h2><table><tr><th>Passage<th>Raw agreement<th>Filtered, same settings<th>Filtered, stricter settings</tr>'
for p in scores['pairs']:
 text+=f'<tr><td>{p["far"]}'
 if 'excluded' in p:text+='<td colspan="3">Excluded: unstable acoustic alignment</tr>';continue
 for n in methods:
  v=p['sensitivity']['0'][n];text+=f'<td>{100*v["agrees50c"]/v["referenceFrames"]:.1f}%'
 text+='</tr>'
text+='</table>'
for ident in selected:
 c=clips[ident];src='/outputs/pitch-comparison/audit-v2/case-00.wav' if ident=='clean' else '/'+(c.get('wav') or c['file']);description={'clean':'Original excursions around 0.95 and 2.15 s disappear; new ones arise near 2.65 and 3.95 s.','0011':'Filtered AC recovers weak low-pitch estimates lost by the hybrid. More voiced estimates are not automatically more correct.','0085':'Filtered AC avoids the raw high track near 1.1 kHz in this looped legacy case. This is a regression example, not new continuous evidence.','IS1009a-090-far':'A relatively strong paired-channel agreement passage; filtered AC does not improve the aggregate agreement.','TS3003a-180-far':'A difficult distant-microphone passage; stricter settings leave much more unvoiced time.'}[ident]
 text+=f'<article><h2>{ident}</h2><p>{description}</p><audio controls preload="metadata" src="{html.escape(src)}"></audio><img loading="lazy" src="{ident}-comparison.png" alt="Raw and filtered pitch against the same spectrogram"></article>'
text+='<h2>All new continuous distant-microphone recordings</h2><p>Times refer to the original full session. These selections were fixed before detector results.</p>'
for c in data['clips']:
 if c.get('channel')!='Array1-01':continue
 text+=f'<p>{c["meeting"]}, {c["sourceStart"]}–{c["sourceStart"]+30} s: <audio controls preload="none" src="/{c["wav"]}"></audio> <a href="{html.escape(c["source"]["url"])}">Original source</a></p>'
(OUT/'report.html').write_text(text);print(OUT/'report.html')
