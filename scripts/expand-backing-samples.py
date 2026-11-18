# SPDX-License-Identifier: MIT
"""Expand the existing CC0 pack with native pitches and recorded staccato articulations.
Uses the existing local renderer and its pinned source repositories; installs nothing.
"""
from pathlib import Path
import argparse,sys,json
import numpy as np
import soundfile as sf
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--renderer',type=Path,required=True)
a=p.parse_args();sys.path.insert(0,str(a.renderer.resolve().parent))
import render_realistic as r
out=Path(__file__).resolve().parents[1]/'packages/music-practice/src/assets/backing-v1'
m=json.loads((out/'manifest.json').read_text());samples=m['samples']
def save(id,x,part,n,v,rr,release=False,art='normal'):
    peak=float(np.max(abs(x)));restore=max(1,peak/.95)
    x=x.copy()/restore
    fade=min(len(x),round(.045*r.SR));x[-fade:]*=np.linspace(1,0,fade)[:,None]
    sf.write(out/(id+'.flac'),x,r.SR,format='FLAC',subtype='PCM_16')
    samples[id]=dict(file=id+'.flac',part=part,note=n,velocity=v,rr=rr,gain=restore,release=release,articulation=art)
for part,lo,hi in [('bass',23,60),('guitar',40,82)]:
  for n in range(lo,hi+1):
    for art in ['normal','muted']:
      for v in ([48,66,80] if part=='bass' else [28,40,56]) if art=='normal' else [40]:
        for rr in range(3):
          id=f'{part}-{n}-{v}-{rr}' if art=='normal' else f'{part}-muted-{n}-{v}-{rr}'
          if id in samples:continue
          if part=='bass':
            x=r.bass_audio(n,v,3.8,rr,staccato=art=='muted')
            x=r.filt(r.filt(x,32),4500,'lowpass')
          else:
            reg,x=r.select(r.GU,f'modules/maps_black/{"ord" if art=="normal" else "stac"}.sfz',n,v,sequence=rr)
            x=r.gate(r.stereo(x,pan=-.22),10 if art=='normal' else .22,.14 if art=='normal' else .055,.0015)*(v/int(reg.get('hivel',127)))**.8
            x=r.filt(r.filt(x,145),6000,'lowpass');x=np.tanh(x*1.6)/1.6
          save(id,x,part,n,v,rr,art=art)
    for rr in range(2):
      id=f'{part}-release-{n}-{rr}'
      if id in samples:continue
      repo,path,key=(r.BA,'maps/darkblack_rel_map.sfz',n+12) if part=='bass' else (r.GU,'modules/maps_black/rel_tp.sfz',n)
      reg,x=r.select(repo,path,key,60,sequence=rr)
      x=r.gate(r.stereo(x,pan=0 if part=='bass' else -.22),.08,.09)
      save(id,x*(.045 if part=='bass' else .025),part,n,60,rr,True)
    print(part,n,flush=True)
# Preserve the recorded open-hat decay; the browser now chokes it on closing.
for id,sample in list(samples.items()):
 if sample['part']=='drums' and sample['note']==46:
  x=r.filt(r.drum_audio(46,sample['velocity'],'blues',sample['rr'])[:round(1.8*r.SR)],32)
  save(id,x,'drums',46,sample['velocity'],sample['rr'])
# Audit the source blobs even when an existing packaged recording was reused.
for sample in samples.values():
 part=sample['part']
 if part not in ['bass','guitar']:continue
 n,v,rr=sample['note'],sample['velocity'],sample['rr']
 if sample['release']:
  repo,path,key=(r.BA,'maps/darkblack_rel_map.sfz',n+12) if part=='bass' else (r.GU,'modules/maps_black/rel_tp.sfz',n)
 elif part=='bass':
  layer='p' if v<32 else 'mp' if v<64 else 'mf' if v<96 else 'f'
  repo,path,key=r.BA,('maps/darkblack_stac_map.sfz' if sample.get('articulation')=='muted' else f'maps/darkblack_reg_{layer}_map.sfz'),n+12
 else:repo,path,key=r.GU,('modules/maps_black/stac.sfz' if sample.get('articulation')=='muted' else 'modules/maps_black/ord.sfz'),n
 r.select(repo,path,key,v,sequence=rr)
m['version']=3
(out/'manifest.json').write_text(json.dumps(m,separators=(',',':'))+'\n')
(out/'sample-library-sha256-realism.json').write_text(json.dumps(r.USED,indent=2)+'\n')
if 'Realism revision:' not in (out/'NOTICE.txt').read_text():
 with (out/'NOTICE.txt').open('a') as f:
  f.write('\nRealism revision: additional native-pitch recordings and recorded staccato articulations from the same CC0 libraries; native dynamics, alternate takes, note-off noises. Original procedural room response and harmony/ensemble code: MIT.\n')
print('Samples',len(samples),'MiB',round(sum(f.stat().st_size for f in out.glob('*.flac'))/1024/1024,2))
