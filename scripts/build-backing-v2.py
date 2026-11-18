# SPDX-License-Identifier: MIT
"""Build the experimental, pre-resampled CC0 pack. No software installation."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from math import gcd
root=Path(__file__).resolve().parents[1];src=root/'packages/music-practice/src/assets/backing-v1';out=src.with_name('backing-v2');out.mkdir(exist_ok=True)
m=json.loads((src/'manifest.json').read_text()); samples={};saved={}
for id,s in m['samples'].items():
 # These are the same recorded p layer; choose it once rather than a second
 # baked-in gain curve masquerading as a separate dynamic recording.
 if s['part']=='guitar' and not s['release'] and s.get('articulation','normal')=='normal' and s['velocity']==28:continue
 x,sr=sf.read(src/s['file'],always_2d=True,dtype='float32'); target=16000 if s['part']=='bass' else 24000 if s['part']=='guitar' else sr
 if target!=sr:x=resample_poly(x,target//gcd(target,sr),sr//gcd(target,sr))
 digest=hashlib.sha256(x.tobytes()).hexdigest()[:20];file='v2-'+digest+'.flac'
 if file not in saved:sf.write(out/file,x,target,subtype='PCM_16');saved[file]=True
 samples[id]={**s,'file':file}
# Genuine fingerboard ghost-note articulation, rather than shortened pitched notes.
sys.path.insert(0,'/Users/lily/Documents/Codex/2026-11-18/fi/outputs/composed-backing-tracks')
import render_realistic as r
for note in range(23,61):
 for rr in range(3):
  reg,x=r.select(r.BA,'maps/darkblack_ghost_p_map.sfz',note+12,40,sequence=rr)
  x=r.gate(r.stereo(x),.2,.055)*.18
  x=r.filt(r.filt(x,32),4500,'lowpass');x=resample_poly(x,1,3)
  digest=hashlib.sha256(x.tobytes()).hexdigest()[:20];file='v2-'+digest+'.flac'
  if file not in saved:sf.write(out/file,x,16000,subtype='PCM_16');saved[file]=True
  samples[f'bass-ghost-{note}-{rr}']=dict(file=file,part='bass',note=note,velocity=40,rr=rr,gain=1,release=False,articulation='ghost')
m['samples']=samples;m['version']=4
(out/'manifest.json').write_text(json.dumps(m,separators=(',',':'))+'\n')
(out/'NOTICE.txt').write_text((src/'NOTICE.txt').read_text().replace('Trimmed 48kHz/16-bit FLAC samples','Trimmed 16kHz bass / 24kHz guitar / source-rate drums, 16-bit FLAC samples')+'\nExperimental v2: pre-resampled native recordings, redundant p layer removed, recorded Black and Blue Bass ghost articulation. Existing CC0 provenance applies. No generated or proprietary audio.\n')
(out/'ghost-source-sha256.json').write_text(json.dumps(r.USED,indent=2)+'\n')
print(json.dumps(dict(entries=len(samples),files=len(saved),bytes=sum(f.stat().st_size for f in out.glob('*.flac')))))
