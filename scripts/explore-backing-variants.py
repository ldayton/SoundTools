# SPDX-License-Identifier: MIT
"""Seeded listening experiment: curated GMD drums + coordinated original backing.

Requires the existing Python audio environment, the CC0 sample renderer, and the
official CC BY 4.0 Groove MIDI archive. Does not install or invoke a sampler app.
"""
from pathlib import Path
from collections import defaultdict, Counter
import argparse, sys, io, zipfile, json, random, hashlib, shutil
import mido
import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve

parser=argparse.ArgumentParser()
parser.add_argument('--renderer',type=Path,required=True)
parser.add_argument('--groove-zip',type=Path,default=Path('work/backing-research/groove-v1.0.0-midionly.zip'))
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--seed',type=int,default=20261118)
args=parser.parse_args()
sys.path.insert(0,str(args.renderer.resolve().parent))
import render_realistic as r
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
r.OUT=OUT
r.WORK=Path('work/backing-comparison-renders').resolve();r.WORK.mkdir(parents=True,exist_ok=True)
VERSION='phrase-vocabulary-v1'
SR=r.SR
BEATS=96
MODES=['steady','evolving','active']
SOURCES={
    'blues':'drummer5/session1/17_blues-shuffle_72_beat_4-4.mid',
    'rock':'drummer3/session1/1_rock_105_beat_4-4.mid',
}
BASE_BARS={'blues':[4,17], 'rock':[3,4]}
ALT_BARS={'blues':[8,12,14,17,20,24], 'rock':[2,3,4,5,6,7,10,11,14]}
FILL_BARS={'blues':[5,13,15,19], 'rock':[12,16]}
MAPPING={36:36,38:38,40:38,37:37,48:47,50:47,45:45,47:45,43:43,58:43,
         22:42,42:42,26:46,46:46,44:44,49:49,55:49,57:49,52:49,51:51,59:51,53:51}
archive=zipfile.ZipFile(args.groove_zip)
assert hashlib.sha256(args.groove_zip.read_bytes()).hexdigest()=='651cbc524ffb891be1a3e46d89dc82a1cecb09a57c748c7b45b844c4841dcc1e'

def read_performance(file):
    midi=mido.MidiFile(file=io.BytesIO(archive.read('groove/'+file)))
    tick=0;bars=defaultdict(list)
    for msg in mido.merge_tracks(midi.tracks):
        tick+=msg.time
        if msg.type!='note_on' or not msg.velocity or msg.note not in MAPPING:continue
        beat=tick/midi.ticks_per_beat
        bar=int(beat//4);pos=beat-bar*4
        bars[bar].append((pos,MAPPING[msg.note],msg.velocity))
    return bars

PERFORMANCES={style:read_performance(source) for style,source in SOURCES.items()}

def velocity(note,v):
    # E-drum pad sensitivities differ from acoustic sample banks. Preserve accents
    # within each instrument while adapting its usable dynamic range.
    if note==36:return round(np.clip(48+v*.43,48,88))
    if note in [38,37]:
        return round(np.clip(17+v*.65,19,99))
    if note in [42,44,46,51]:return round(np.clip(19+v*.43,25,75))
    if note==49:return round(np.clip(v*.53,38,70))
    return round(np.clip(28+v*.50,38,90))

def curated_bar(style,index,fill_start=4,mode='steady'):
    result=[]
    for pos,n,v in PERFORMANCES[style][index]:
        if pos>=fill_start:continue
        # Avoid incidental very quiet e-pad triggers; steady keeps a clear backbone.
        if v<10:continue
        if mode=='steady' and n in [43,45,47,49]:continue
        if n in [38,37] and v<35 and mode=='steady':continue
        if n in [38,37] and v<20 and mode=='evolving':continue
        result.append((pos,n,.09,velocity(n,v)))
    # Preserve a dependable first-beat anchor when slicing bars from a performance.
    if not any(n==36 and pos<.15 for pos,n,d,v in result):
        result.append((0,36,.09,65))
    # Both backbeats remain audible even when a sliced bar used an extremely soft hit.
    for beat in [1,3]:
        if beat<fill_start and not any(n in [37,38] and abs(pos-beat)<.17 for pos,n,d,v in result):
            result.append((beat+.013,38,.09,70))
    return sorted(result)

def fill(style,index,start,mode):
    result=[]
    for pos,n,v in PERFORMANCES[style][index]:
        if pos<start or v<18:continue
        # Hands move to snare/toms; pedal hat may continue underneath.
        if n in [42,46,49,51]:continue
        if mode=='evolving' and n in [38,37] and v<38:continue
        result.append((pos,n,.09,velocity(n,v)))
    if not result:
        # Restrained authored response when the selected source window is empty.
        result=[(3,38,.09,67),(3+2/3 if style=='blues' else 3.5,45,.09,60)]
    return result

def parts_for(style,mode):
    seed=int.from_bytes(hashlib.sha256(f'{args.seed}:{style}:{mode}:{VERSION}'.encode()).digest()[:8],'big')
    rng=random.Random(seed)
    parts={p:[] for p in ['drums','percussion','bass','guitar']}
    plan=[]
    phrase=12 if style=='blues' else 8
    for bar in range(24):
        phrase_pos=bar%phrase
        base=BASE_BARS[style][bar%2]
        if mode!='steady' and phrase_pos>=2 and rng.random() < (.48 if mode=='evolving' else .8):
            base=rng.choice(ALT_BARS[style])
        transition=mode!='steady' and phrase_pos==phrase-1
        answer=mode=='active' and phrase_pos in ([3,7] if style=='blues' else [3])
        # Evolving adds one small mid-phrase answer in the second blues phrase.
        if mode=='evolving' and style=='blues' and bar==17:answer=True
        fill_start=(3 if mode=='evolving' or answer else 2) if transition or answer else 4
        local=curated_bar(style,base,fill_start,mode)
        fill_source=None
        if fill_start<4:
            fill_source=rng.choice(FILL_BARS[style])
            local+=fill(style,fill_source,fill_start,mode)
        # Remove duplicates produced by collapsing Roland head/rim articulations.
        cleaned=[]
        for hit in sorted(local):
            if any(n==hit[1] and abs(p-hit[0])<.045 for p,n,d,v in cleaned):continue
            cleaned.append(hit)
        if mode=='active' and phrase_pos not in [phrase-1] and bar>=phrase:
            # A coherent second-section cymbal texture, rather than a new texture each bar.
            cleaned=[(p,51 if n==42 else n,d,v) for p,n,d,v in cleaned]
        for pos,n,d,v in cleaned:
            parts['drums'].append((4+bar*4+pos,n,d,v))
        if transition and bar<23:
            parts['drums'].append((4+(bar+1)*4,49,.09,51 if mode=='evolving' else 61))
        # Low tambourine backbeats; extra light subdivision only in active rock.
        for pos in [1,3]:parts['percussion'].append((4+bar*4+pos,54,.09,29))
        if mode=='active' and style=='rock' and bar%8 in [4,5]:
            for pos in [.5,2.5]:parts['percussion'].append((4+bar*4+pos,70,.09,25))
        # Bass is chosen after the kit. Main accents follow strong kicks, with a
        # small phrase vocabulary and only roots/fifths/octaves (no forced mode).
        if fill_start<4:
            bass=[(0,33,1.2,72),(2,40,min(.55,max(.2,fill_start-2-.08)),57)]
        elif mode=='steady':
            bass=[(0,33,1.2,72),(2,40,.9,62)]
        else:
            strong_kicks=[p for p,n,d,v in cleaned if n==36 and v>=58 and .4<p<3.6]
            anchor=min(strong_kicks,key=lambda p:abs(p-2)) if strong_kicks else 2
            bass=[(0,33,1.05,72),(anchor,40 if bar%4 in [1,3] else 33,.7,62)]
            if mode=='active' or (bar%4==2 and rng.random()<.65):
                # Short answer, followed by space before the next downbeat.
                pos=3+2/3 if style=='blues' else 3.5
                bass.append((pos,45 if bar%8 in [2,6] else 40,.20,52))
            if mode=='active' and bar%4==1:
                extra=2/3 if style=='blues' else 1.5
                if all(abs(extra-p)>.2 for p,n,d,v in bass):bass.append((extra,33,.23,53))
        bass.sort()
        for i,(pos,n,d,v) in enumerate(bass):
            if i+1<len(bass):d=min(d,max(.08,bass[i+1][0]-pos-.07))
            parts['bass'].append((4+bar*4+pos+.006,n,d,v))
        # Chord-only open harmony; silence during fills. More active never means
        # a melodic guitar part, or a louder one.
        if fill_start==4:
            hit=(bar%2==0) if mode=='steady' else (bar%4 in [0,2] if mode=='evolving' else bar%4 in [0,1,2])
            if hit:
                pos=1 if style=='blues' else (0 if bar%2==0 else 1.5)
                dur=.4 if style=='blues' else .95
                chord=[57,64,69] if mode=='steady' or bar%8 not in [2,6] else [57,62,64]
                for j,n in enumerate(chord):
                    parts['guitar'].append((4+bar*4+pos+j*.026,n,dur,46+j))
        plan.append(dict(bar=bar+1,role='transition' if transition else 'answer' if answer else 'continue',
                         source_bar=base,fill_source_bar=fill_source,fill_start=fill_start))
    # Identical count-in and final hit in all versions; neither interrupts the groove.
    for beat in range(4):parts['drums'].append((beat,37,.09,52 if beat==0 else 40))
    parts['drums'] += [(100,36,.09,75),(100,49,.09,49)]
    parts['bass'].append((100,33,2,66))
    for j,n in enumerate([57,64,69]):parts['guitar'].append((100+j*.026,n,2,45+j))
    for part in parts:parts[part].sort()
    return parts,plan,seed

def render(style,mode):
    bpm=90 if style=='blues' else 104
    name=f'{style}-{mode}'
    parts,plan,seed=parts_for(style,mode)
    r.COUNTER.clear()
    r.write_midi(name,bpm,parts)
    print(name+': sampled rendering',flush=True)
    length=round((104*60/bpm+5)*SR)
    kit=r.render_kit(parts['drums'],bpm,length,style)
    perc=r.render_perc(parts['percussion'],bpm,length)
    bass=r.render_bass(parts['bass'],bpm,length)
    guitar=r.render_guitar(parts['guitar'],bpm,length,style)
    kit*=1 if style=='blues' else 1.05
    perc*=1.2
    bass*=.39*10**(-12/20)
    guitar*=1.5*10**(-12/20)
    kit,kg=r.compress(kit,-22,1.5)
    bass,bg=r.compress(bass,-26,2)
    guitar,gg=r.compress(guitar,-25,1.45)
    send=r.filt(guitar*.22+perc*.10+bass*.025,280)
    ir=r.room_ir();room=np.zeros_like(send)
    for ch in range(2):room[:,ch]=fftconvolve(send[:,ch],ir[:,ch])[:length]
    before,after=r.master(name,kit+perc+bass+guitar+room)
    event_json={p:[[round(t,6),n,round(d,6),v] for t,n,d,v in events] for p,events in parts.items()}
    event_hash=hashlib.sha256(json.dumps(event_json,sort_keys=True).encode()).hexdigest()
    # Determinism check is independent of rendering and sample-cache order.
    again,again_plan,again_seed=parts_for(style,mode)
    assert parts==again and plan==again_plan and seed==again_seed
    x,sr=sf.read(OUT/(name+'.wav'),always_2d=True)
    # Small linear correction removes residual loudnorm error between conditions;
    # all six clips retain at least roughly 1 dB of peak headroom.
    correction=-18-float(after['output_i'])
    x*=10**(correction/20)
    assert sr==SR and np.isfinite(x).all() and np.max(abs(x))<.9
    sf.write(OUT/(name+'.wav'),x,sr,subtype='PCM_24')
    data=dict(file=name+'.wav',style=style,mode=mode,key='A',bpm=bpm,
        seed=seed,generator=VERSION,seconds=round(len(x)/sr,2),
        integrated_lufs=-18.0,true_peak_dbtp=round(float(after['output_tp'])+correction,2),
        event_sha256=event_hash,notes={p:len(ns) for p,ns in parts.items()},
        fills=sum(p['fill_start']<4 for p in plan),
        source=SOURCES[style],plan=plan)
    (OUT/(name+'.events.json')).write_text(json.dumps(dict(metadata=data,parts=event_json),indent=2)+'\n')
    print(json.dumps({k:v for k,v in data.items() if k!='plan'}),flush=True)
    return data

if __name__=='__main__':
    results=[render(style,mode) for style in ['blues','rock'] for mode in MODES]
    for style in ['blues','rock']:
        variants=[x for x in results if x['style']==style]
        assert len({x['event_sha256'] for x in variants})==3
        assert [x['fills'] for x in variants]==sorted(x['fills'] for x in variants)
    (OUT/'manifest.json').write_text(json.dumps(results,indent=2)+'\n')
    (OUT/'sample-sha256.json').write_text(json.dumps(r.USED,indent=2,sort_keys=True)+'\n')
    credits=OUT/'licenses';credits.mkdir(exist_ok=True)
    for f in (r.BASE/'realistic/licenses').iterdir():shutil.copy(f,credits/f.name)
    shutil.copy(r.BASE/'realistic/LICENSE.txt',OUT/'LICENSE.txt')
    shutil.copy(__file__,OUT/'explore-backing-variants.py')
    (OUT/'ATTRIBUTION.txt').write_text(
        'Drum performances adapted from the Groove MIDI Dataset (Google LLC), CC BY 4.0.\n'
        'https://magenta.withgoogle.com/datasets/groove\n'
        'https://creativecommons.org/licenses/by/4.0/\n'
        'Sources: '+SOURCES['blues']+'; '+SOURCES['rock']+'\n'
        'Changes: selected/cropped/repeated bars; Roland drum-note remapping; adapted velocities;\n'
        'ghost-note filtering; phrase-based fills; optional cymbal substitutions; tempo changes;\n'
        'new original bass, supporting guitar, percussion and mix. No endorsement implied.\n'
        'Instrument recordings: Virtuosity Drums, Black And Blue Basses, Black And Green Guitars;\n'
        'Versilian Studios / Karoryfer Samples; CC0 legal texts included in licenses/.\n'
        'New generation code and original accompaniment: MIT, Copyright 2026 Lily Dayton.\n')
