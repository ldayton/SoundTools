# SPDX-License-Identifier: MIT
"""Prepare additional CC0 Virtuosity strokes; uses existing local tools only."""
from pathlib import Path
import json,sys,hashlib
import numpy as np
import soundfile as sf
sys.path.insert(0,'/Users/lily/Documents/Codex/2026-11-18/fi/outputs/composed-backing-tracks')
import render_realistic as r
out=Path(__file__).resolve().parents[1]/'packages/music-practice/src/assets/backing-drum-v3';out.mkdir(exist_ok=True)
samples={}
for name,art,note in [('hat-half','hh_half',42),('hat-loose','hh_34',42),('rimshot','snare_rimshot',38),('offcenter','snare_offcenter',38),('normal','snare_center',38)]:
 regs=r.mapping(r.DR,f'mappings/mid/{art}_map.sfz')
 zones=sorted(set((int(g.get('lovel',0)),int(g.get('hivel',127))) for g in regs))
 for lo,hi in zones:
  v=round((max(1,lo)+hi)/2)
  candidates=[g for g in regs if int(g.get('lovel',0))<=v<=int(g.get('hivel',127))]
  for rr in range(len(candidates)):
   mix=[('snaremic',.5),('mid',.7),('oh',.16),('room',.08)] if note==38 else [('mid',.78),('oh',.2),('room',.045)]
   chunks=[]
   for mic,gain in mix:
    reg,x=r.select(r.DR,f'mappings/{mic}/{art}_map.sfz',60,v,sequence=rr)
    scale=(v/int(reg.get('hivel',127)))**.8 if 'seq_length' in reg else 1
    chunks.append((r.stereo(x),gain*scale))
   x=np.zeros((max(len(x) for x,g in chunks),2),dtype='float32')
   for a,g in chunks:x[:len(a)]+=a*g
   x=r.filt(x[:round((1.3 if note==38 else 1.8)*r.SR)],32)
   fade=min(len(x),round(.045*r.SR));x[-fade:]*=np.linspace(1,0,fade)[:,None]
   restore=max(1,float(np.max(abs(x)))/.95);x/=restore
   digest=hashlib.sha256(x.tobytes()).hexdigest()[:20];file=f'd3-{digest}.flac'
   sf.write(out/file,x,r.SR,subtype='PCM_16')
   samples[f'd3-{name}-{v}-{rr}']=dict(file=file,part='drums',note=note,velocity=v,rr=rr,gain=restore,release=False,articulation=name,velocityLow=lo,velocityHigh=hi)
(out/'manifest.json').write_text(json.dumps({'samples':samples},separators=(',',':'))+'\n')
(out/'source-sha256.json').write_text(json.dumps(r.USED,indent=2)+'\n')
(out/'NOTICE.txt').write_text((out.parent/'backing-v2/NOTICE.txt').read_text()+'\nDrum articulation revision:\n'+'Virtuosity Drums — Versilian Studios / Karoryfer Samples / Austin McMahon.\nCC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\nSource: https://github.com/sfzinstruments/virtuosity_drums\nAdditional half-open/three-quarter-open hi-hat, rimshot, off-centre and centre snare recordings.\nModified: phase-aligned microphone mixes, high-pass filter, tail fades, peak-safe packaging.\nOriginal source Git blobs are audited in source-sha256.json.\n')
print(json.dumps(dict(entries=len(samples),bytes=sum(p.stat().st_size for p in out.glob('*.flac')))))
