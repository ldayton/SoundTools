# SPDX-License-Identifier: MIT
"""Build optional open Soul/Folk banks with existing tools; installs nothing."""
from pathlib import Path
import json,hashlib,re,urllib.request,concurrent.futures,subprocess,shutil
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly,butter,sosfilt
import mido
root=Path(__file__).resolve().parents[1];work=root/'work/soul-folk-assets';work.mkdir(exist_ok=True,parents=True)
out=root/'packages/music-practice/src/assets/backing-soul-folk';out.mkdir(exist_ok=True)
base='https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/main/systems/instruments/meta-steel-guitar/'
sfz=urllib.request.urlopen(base+'meta-steel-guitar.sfz').read().decode();(work/'steel.sfz').write_text(sfz)
files=sorted(set(re.findall(r'sample=(\S+\.ogg)',sfz)));tuning={2:('D',50),3:('G',55),4:('B',59),5:('HighE',64)}
pcs={'C':0,'Cs':1,'D':2,'Ds':3,'E':4,'F':5,'Fs':6,'G':7,'Gs':8,'A':9,'As':10,'B':11}
samples={};audit={}
def download(file):
 p=work/file
 if not p.exists():p.write_bytes(urllib.request.urlopen(base+'ogg/'+file).read())
 return p
selected=[]
for f in files:
 match=re.search(r'String(\w+)_Vel01_([A-G]s?)(\d)_',f)
 if not match:continue
 string,note,octave=match.groups();n=(int(octave)+1)*12+pcs[note]
 for index,(label,openNote) in tuning.items():
  if label==string and openNote<=n<=openNote+12:selected.append((f,index,n))
assert len(selected)==52,(len(selected),selected[:2])
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(download,[x[0] for x in selected]))
for f,string,n in selected:
 p=work/f;data=p.read_bytes();audit[f]=hashlib.sha256(data).hexdigest();x,sr=sf.read(p,always_2d=True,dtype='float32');x=resample_poly(x,1,2) if sr==48000 else resample_poly(x,24000,sr);x=x[:8*24000]
 if x.shape[1]==1:x=np.repeat(x,2,axis=1)*np.array([.80,.60])
 fade=min(len(x),1200);x[-fade:]*=np.linspace(1,0,fade)[:,None]
 name=f'folk-steel-s{string}-{n}.flac';sf.write(out/name,x,24000,subtype='PCM_16')
 samples[f'folk-steel-{string}-{n}']=dict(file=name,part='guitar',note=n,velocity=40,rr=0,gain=1,release=False,articulation='normal',string=string)
# Render clean, isolated FluidR3 EP1 notes using the existing FluidSynth binary.
font=Path('/Users/lily/Documents/Codex/2026-11-18/fi/work/FluidR3_GM.sf2');audit['FluidR3_GM.sf2']=hashlib.sha256(font.read_bytes()).hexdigest()
mid=mido.MidiFile(ticks_per_beat=480);track=mido.MidiTrack();mid.tracks.append(track);track.append(mido.MetaMessage('set_tempo',tempo=500000));track.append(mido.Message('program_change',program=4));track.append(mido.Message('control_change',control=91,value=0));track.append(mido.Message('control_change',control=93,value=0))
entries=[];position=0
for n in range(48,80):
 for v in [40,72]:
  track.append(mido.Message('note_on',note=n,velocity=v,time=0 if not entries else 960));entries.append((n,v,position));track.append(mido.Message('note_off',note=n,velocity=0,time=5760));position+=7
mid.save(work/'ep-notes.mid')
subprocess.run(['/opt/homebrew/bin/fluidsynth','-ni','-q','-R','0','-C','0','-g','.7','-r','48000','-F',str(work/'ep-notes.wav'),str(font),str(work/'ep-notes.mid')],check=True,stdout=subprocess.DEVNULL)
x,sr=sf.read(work/'ep-notes.wav',always_2d=True,dtype='float32')
for n,v,start in entries:
 a=x[round(start*sr):round((start+6)*sr)].copy();a=resample_poly(a,1,2);a=sosfilt(butter(2,120,btype='highpass',fs=24000,output='sos'),a,axis=0);a=sosfilt(butter(2,4200,btype='lowpass',fs=24000,output='sos'),a,axis=0);a[-2400:]*=np.linspace(1,0,2400)[:,None]
 name=f'soul-ep-{n}-{v}.flac';sf.write(out/name,a,24000,subtype='PCM_16');samples[f'soul-ep-{n}-{v}']=dict(file=name,part='keys',note=n,velocity=v,rr=0,gain=4,release=False,articulation='normal')
(out/'manifest.json').write_text(json.dumps({'samples':samples},separators=(',',':'))+'\n');(out/'source-sha256.json').write_text(json.dumps(audit,indent=2)+'\n')
license=Path('/Users/lily/Documents/Codex/2026-11-18/fi/work/fluid-soundfont/LICENSE').read_text();(out/'FLUIDR3-LICENSE.txt').write_text(license)
(out/'NOTICE.txt').write_text((out.parent/'backing-drum-v3/NOTICE.txt').read_text().replace('All recordings CC0 1.0.','Base Virtuosity / Black and Blue / Black and Green recordings: CC0 1.0. Soul/Folk additions have their individual licenses below.')+'\nSoul/Folk sound palette:\nFolk: Meta Steel Guitar, Meta Platforms Inc., CC0 1.0.\nhttps://github.com/facebookincubator/Meta-open-sound/tree/main/systems/instruments/meta-steel-guitar\nSoft picked recordings on actual D/G/B/High-E strings; trimmed/resampled to 24 kHz.\nSoul: FluidR3 GM electric piano 1, Frank Wen, MIT; full license follows.\nRendered through the existing FluidSynth installation with chorus/reverb disabled, isolated notes, gentle HP/LP and tail fades.\n'+license)
print(json.dumps({'samples':len(samples),'bytes':sum(p.stat().st_size for p in out.glob('*.flac'))}))
