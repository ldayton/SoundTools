# SPDX-License-Identifier: MIT
"""Package the approved performances and CC0 recordings for NoteWise."""
from pathlib import Path
import sys,json,shutil,argparse
import numpy as np
import soundfile as sf
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--renderer',type=Path,required=True)
parser.add_argument('--stories',type=Path,required=True)
args=parser.parse_args()
BASE=args.renderer.resolve().parent
sys.path.insert(0,str(BASE))
import render_realistic as r
DEST=Path(__file__).resolve().parents[1]/'packages/music-practice/src/assets/backing-v1'
SOURCE=args.stories.resolve()
DEST.mkdir(parents=True,exist_ok=True)
samples={};patterns={}
def save(id,x,part,n,v,rr,release=False):
    peak=float(np.max(abs(x)));restore=max(1,peak/.95)
    x=x.copy()/restore
    fade=min(len(x),round(.045*r.SR))
    x[-fade:]*=np.linspace(1,0,fade)[:,None]
    sf.write(DEST/(id+'.flac'),x,r.SR,format='FLAC',subtype='PCM_16')
    samples[id]=dict(file=id+'.flac',part=part,note=n,velocity=v,rr=rr,gain=restore,release=release)
for style,bpm in [('blues',90),('rock',104)]:
  patterns[style]={}
  for mode in ['steady','active']:
    story=json.loads((SOURCE/f'{style}-{mode}-story.events.json').read_text())
    beats=len(story['bars'])*4
    bars=story['bars']
    def dynamic(beat,part):
        # Periodic envelope: return over the final eight bars without fading out.
        points=[(b['index']*4,b['db']) for b in bars]
        closing=beats-32
        points=[p for p in points if p[0]<closing]+[(closing,bars[-8]['db']),(beats,bars[0]['db'])]
        db=float(np.interp(beat,[p[0] for p in points],[p[1] for p in points]))
        return round(10**(db/20*(.8 if part=='bass' else .85 if part=='guitar' else 1)),6)
    events=[]
    for part in ['drums','percussion','bass','guitar']:
        notes=[(max(0,t-4),n,min(d,beats-max(0,t-4)-.04) if part in ['bass','guitar'] else d,v) for t,n,d,v in story['parts'][part] if 4<=t<4+beats]
        events.extend(dict(part=part,beat=round(t,5),note=n,duration=round(d,5),velocity=v,level=dynamic(t,part)) for t,n,d,v in notes)
        pitches=sorted({n for t,n,d,v in notes})
        levels=([28,48,68,86] if part=='drums' else [28,40] if part=='percussion' else [48,66,80] if part=='bass' else [40,56])
        for n in pitches:
            for v in levels:
                for rr in range(3 if part in ['drums','percussion'] else 2):
                    id=f'{part}-{n}-{v}-{rr}'
                    if id in samples:continue
                    if part=='drums':
                        x=r.drum_audio(n,v,style,rr)
                        limit=4 if n in [49,51] else 1.2 if n in [37,38,43,45,47] else .65
                        x=r.filt(x[:round(limit*r.SR)],32)
                    elif part=='percussion':
                        art='tambourine' if n==54 else ('shaker_up' if rr%2 else 'shaker_down')
                        reg,x=r.select(r.DR,f'mappings/perc/mid/{art}_map.sfz',60,v,sequence=rr)
                        x=r.filt(r.stereo(x[:round(.8*r.SR)])*(v/127)**.9*.7,200)
                    elif part=='bass':
                        x=r.bass_audio(n,v,2.8,rr)
                        x=r.filt(r.filt(x,32),4500,'lowpass')
                    else:
                        reg,x=r.select(r.GU,'modules/maps_black/ord.sfz',n,v,sequence=rr)
                        x=r.gate(r.stereo(x,pan=-.22),10,.14,.0015)*(v/int(reg.get('hivel',127)))**.8
                        x=r.filt(r.filt(x,145),6000,'lowpass')
                        x=np.tanh(x*1.6)/1.6
                    save(id,x,part,n,v,rr)
            if part in ['bass','guitar']:
                for rr in range(2):
                    id=f'{part}-release-{n}-{rr}'
                    if id in samples:continue
                    repo,path,key=(r.BA,'maps/darkblack_rel_map.sfz',n+12) if part=='bass' else (r.GU,'modules/maps_black/rel_tp.sfz',n)
                    reg,x=r.select(repo,path,key,60,sequence=rr)
                    x=r.gate(r.stereo(x,pan=0 if part=='bass' else -.22),.08,.09)
                    save(id,x*(.045 if part=='bass' else .025),part,n,60,rr,True)
    patterns[style][mode]=dict(nativeTempo=bpm,beats=beats,sourceKey=9,events=sorted(events,key=lambda e:e['beat']))
manifest=dict(version=2,sampleRate=r.SR,samples=samples,patterns=patterns,
    levels=dict(drums=1,percussion=1.2,bass=.39*10**(-12/20),guitar=1.5*10**(-12/20)))
for stale in DEST.glob('*.flac'):
    if stale.stem not in samples: stale.unlink()
(DEST/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
licenses=DEST/'licenses';licenses.mkdir(exist_ok=True)
for f in (BASE/'realistic/licenses').iterdir():shutil.copy(f,licenses/f.name)
shutil.copy(BASE/'realistic/sample-library-versions.json',DEST/'sample-library-versions.json')
(DEST/'NOTICE.txt').write_text('Backing track sample pack v2\nAll recordings CC0 1.0.\n'
    'Drums/percussion: Virtuosity Drums, Versilian Studios and Karoryfer Samples, Austin McMahon.\n'
    'Bass: Black And Blue Basses, Karoryfer Samples.\nGuitar: Black And Green Guitars, Karoryfer Samples.\n'
    'https://github.com/sfzinstruments/virtuosity_drums\n'
    'https://github.com/sfzinstruments/karoryfer.black-and-blue-basses\n'
    'https://github.com/sfzinstruments/karoryfer.black-and-green-guitars\n'
    'Original bass/guitar sequences and packaging code: MIT, Copyright 2026 Lily Dayton.\n'
    'Trimmed 48kHz/16-bit FLAC samples include recorded dynamic layers and alternate hits.\n'
    'Bass/guitar use the approved -12dB balance. The player transposes only pitched instruments.\n')
print(len(samples),'samples;',round(sum(f.stat().st_size for f in DEST.rglob('*') if f.is_file())/1024/1024,2),'MiB')

with (DEST/'NOTICE.txt').open('a') as f:
    f.write('\nCC0 recording license: https://creativecommons.org/publicdomain/zero/1.0/\nDrum performance adaptation: Groove MIDI Dataset, Copyright Google LLC, CC BY 4.0.\nhttps://magenta.tensorflow.org/datasets/groove\nhttps://creativecommons.org/licenses/by/4.0/\nSource performances: drummer5/session1/17_blues-shuffle_72_beat_4-4.mid and drummer3/session1/1_rock_105_beat_4-4.mid.\nModifications: curated/combined bars and fills, remapped notes, adjusted velocities, section textures and periodic dynamics.\n')
