# SPDX-License-Identifier: MIT
"""Four longer comparisons: harmonic movement, macro dynamics, and drum phrasing."""
from pathlib import Path
import importlib.util, random, hashlib, json, shutil, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve

spec=importlib.util.spec_from_file_location('backing_vocabulary',Path(__file__).with_name('explore-backing-variants.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
r=base.r;args=base.args;OUT=base.OUT;SR=r.SR
VERSION='harmonic-story-v2'
CHORDS={
 'A7':(33,[55,61,64]), 'D7':(38,[54,60,62]),
 'E7':(40,[56,62,64]), 'B7':(35,[57,63,66]),
 'Am':(33,[57,60,64]), 'F':(29,[53,57,60]),
 'C':(36,[55,60,64]), 'G':(31,[55,59,62]),
}
PROGRESSIONS={
 'blues':['A7','D7','A7','A7','D7','D7','A7','B7','E7','D7','A7','E7'],
 'rock':['Am','Am','F','F','C','C','G','G'],
}
# Each tuple is section name, phrase-count, start dB, end dB, drum texture.
SECTIONS={
 'blues':[
  ('Opening',1,-5,-4,'crossstick'),('Settle in',1,-3,-2,'hat'),
  ('First lift',1,-2,0,'ride'),('Pull back',1,-8,-6,'crossstick'),
  ('Return and build',1,-4,-.5,'hat'),('Climax and resolve',1,-.5,1,'ride')],
 'rock':[
  ('Opening',1,-6,-4,'crossstick'),('Settle in',1,-3,-2,'hat'),
  ('First lift',2,-2,.5,'ride'),('Breakdown',1,-8,-6,'crossstick'),
  ('Rebuild',1,-5,-2,'hat'),('Climax',1,-1,1,'ride'),
  ('Home again',1,-2,-5,'hat')],
}

def compose(style,mode):
    seed=int.from_bytes(hashlib.sha256(f'{args.seed}:{style}:{mode}:{VERSION}'.encode()).digest()[:4],'big')
    rng=random.Random(seed)
    progression=PROGRESSIONS[style];phrase=len(progression)
    parts={p:[] for p in ['drums','percussion','bass','guitar']}
    bars=[];sections=[];cursor=0
    for name,count,start_db,end_db,texture in SECTIONS[style]:
        duration=count*phrase
        sections.append(dict(name=name,start_bar=cursor+1,bars=duration,start_db=start_db,end_db=end_db,texture=texture))
        for j in range(duration):
            progress=j/max(1,duration-1)
            level=start_db+(end_db-start_db)*progress
            bars.append(dict(index=cursor+j,section=name,texture=texture,db=level,
                section_start=j==0,section_end=j==duration-1,section_pos=j,section_bars=duration,
                chord=progression[j%phrase]))
        cursor+=duration
    fills=[]
    for b in bars:
        bar=b['index'];pos=bar%phrase;t=4+bar*4;quiet=b['texture']=='crossstick'
        # Steady preserves its backbone, but breathes and turns at long section boundaries.
        strong=b['section_end'] and bar<len(bars)-1
        small=(mode=='active' and pos in ([3,7] if style=='blues' else [3]))
        phrase_fill=(mode=='active' and pos==phrase-1)
        if b['section']=='Pull back' or b['section']=='Breakdown':small=False
        start=2 if strong and mode=='active' else 3 if strong or phrase_fill or small else 4
        source=base.BASE_BARS[style][bar%2]
        if mode=='active' and not quiet and pos>=2 and rng.random()<.72:
            source=rng.choice(base.ALT_BARS[style])
        hits=base.curated_bar(style,source,start,mode)
        if start<4:
            fs=rng.choice(base.FILL_BARS[style]);hits+=base.fill(style,fs,start,mode)
            fills.append(dict(bar=bar+1,start_beat=start,source_bar=fs,role='section transition' if strong else 'phrase response'))
        clean=[]
        for p,n,d,v in sorted(hits):
            if any(nn==n and abs(pp-p)<.045 for pp,nn,dd,vv in clean):continue
            if quiet:
                if n in [38,37]:n=37;v=min(69,v)
                if n in [46,49,51]:n=42;v=min(v,48)
                if mode=='steady' and n in [43,45,47] and not strong:continue
            elif b['texture']=='ride' and n==42:n=51
            clean.append((p,n,d,v))
        # Deliberate softer ghost notes and stronger backbeats; no added timing noise.
        for p,n,d,v in clean:
            if n in [38,37] and v<40:v=max(18,v-3)
            parts['drums'].append((t+p,n,d,v))
        if b['section_start'] and bar>0 and not quiet:
            parts['drums'].append((t,49,.09,52 if mode=='steady' else 64))
        if not quiet:
            for p in [1,3]:parts['percussion'].append((t+p,54,.09,29))
            if mode=='active' and b['texture']=='ride' and pos%4 in [1,2]:
                for p in [.5,2.5]:parts['percussion'].append((t+p,70,.09,25))
        chord=b['chord'];root,voicing=CHORDS[chord]
        nxt=CHORDS[bars[min(bar+1,len(bars)-1)]['chord']][0]
        third=3 if chord=='Am' else 4
        if start<4:
            bass=[(0,root,1.25,72),(2,root+7,.5 if start==3 else .22,56)]
        elif mode=='steady':
            # Four-bar phrase: root/fifth, root/octave, third/fifth, approach.
            second=[7,12,third,7][bar%4]
            bass=[(0,root,1.2,72),(2,root+second,.95,61)]
            if bar%4==3 and nxt!=root:
                bass.append((3+2/3 if style=='blues' else 3.5,nxt,.2,49))
        else:
            kicks=[p for p,n,d,v in clean if n==36 and .5<p<3 and v>=58]
            anchor=min(kicks,key=lambda p:abs(p-2)) if kicks else 2
            second=[7,third,12,7][bar%4]
            bass=[(0,root,1.03,73),(anchor,root+second,.65,62)]
            if not quiet:
                response=3+2/3 if style=='blues' else 3.5
                note=nxt if nxt!=root else root+[7,10 if chord.endswith('7') else 12,12][bar%3]
                bass.append((response,note,.2,52))
                if bar%4==1:
                    extra=2/3 if style=='blues' else 1.5
                    if all(abs(extra-p)>.18 for p,n,d,v in bass):bass.append((extra,root,.23,51))
        bass.sort()
        for i,(p,n,d,v) in enumerate(bass):
            if i+1<len(bass):d=min(d,max(.07,bass[i+1][0]-p-.07))
            parts['bass'].append((t+p+.006,n,d,v))
        # Long ringing support, with section-dependent inversions and soft rebrushes.
        # No new RNG draws: drums and bass remain identical to the story comparison.
        changed=bar==0 or bars[bar-1]['chord']!=chord
        play=changed or (not quiet and bar%2==0)
        if play:
            inversion=(b['start_bar']//12 if 'start_bar' in b else (bar//phrase))%3
            notes=sorted(voicing)
            if inversion==1:notes=sorted(notes[1:]+[notes[0]+12])
            elif inversion==2:notes=sorted([notes[0]-12]+notes[1:])
            # Sustain up to two bars, stopping before the next harmonic change.
            next_change=next((k for k in range(bar+1,len(bars)) if bars[k]['chord']!=chord),len(bars))
            p=.045 if changed else .5
            dur=min(7.6,(next_change-bar)*4-p-.13)
            rebrush=mode=='active' and not quiet and start==4 and bar%4==0
            if rebrush:dur=min(dur,2.65-p)
            spacing=.035 if quiet else .021 if b['texture']=='ride' else .028
            for j,n in enumerate(notes):parts['guitar'].append((t+p+j*spacing,n,dur-j*spacing,40+j+(2 if b['texture']=='ride' else 0)))
            if rebrush:
                for j,n in enumerate(reversed(notes)):
                    parts['guitar'].append((t+2.75+j*.018,n,min(3.8,(next_change-bar)*4-2.9)-j*.018,32+j))
    for beat in range(4):parts['drums'].append((beat,37,.09,50 if beat==0 else 39))
    ending=4+len(bars)*4
    home='A7' if style=='blues' else 'Am'
    root,voicing=CHORDS[home]
    parts['drums'] += [(ending,36,.09,69),(ending,49,.09,45)]
    parts['bass'].append((ending,root,2.5,65))
    for j,n in enumerate(voicing):parts['guitar'].append((ending+j*.026,n,2.7,43+j))
    for p in parts:parts[p].sort()
    assert len({b['chord'] for b in bars})>=4
    assert len({n for t,n,d,v in parts['bass']})>=4
    assert len({n for t,n,d,v in parts['guitar']})>=4
    return parts,bars,sections,fills,seed

def level_curve(bars,bpm,length):
    # Smooth gain automation over entire sections. The breakdown is a real drop,
    # not just fewer notes at the same mastered level.
    points=[(0,bars[0]['db'])]
    for b in bars:points.append(((4+b['index']*4)*60/bpm,b['db']))
    end=(4+len(bars)*4)*60/bpm
    points += [(end,-3 if len(bars)==72 else -5),(length/SR,-7)]
    times=np.array([t for t,db in points]);values=np.array([db for t,db in points])
    return 10**(np.interp(np.arange(length)/SR,times,values)/20)

def master_linear(name,mix):
    mix*=min(1,.9/max(np.max(abs(mix)),1e-9))
    n=round(.8*SR);mix[-n:]*=np.linspace(1,0,n)[:,None]
    raw=r.WORK/(name+'-story-premaster.wav');sf.write(raw,mix,SR,subtype='FLOAT')
    measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(raw),'-af','loudnorm=I=-19:TP=-1.5:LRA=20:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    before=json.JSONDecoder().raw_decode(measure.stderr[measure.stderr.rfind('{'):])[0]
    gain=-19-float(before['input_i'])
    # One overall gain; the short lookahead peak limiter catches transient spikes.
    # No rolling loudness normalization: it would counteract the composed story.
    af=f'volume={gain}dB,alimiter=limit=0.86:attack=5:release=70:level=false:latency=true'
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(raw),'-af',af,'-ar',str(SR),'-c:a','pcm_s24le',str(OUT/(name+'.wav'))],check=True)
    return gain

def render(style,mode):
    bpm=90 if style=='blues' else 104
    name=f'{style}-{mode}-story'
    parts,bars,sections,fills,seed=compose(style,mode)
    assert compose(style,mode)==(parts,bars,sections,fills,seed)
    r.COUNTER.clear();r.write_midi(name,bpm,parts)
    length=round(((8+len(bars)*4)*60/bpm+5)*SR)
    print(f'{name}: {len(bars)} bars, {len(fills)} fills; sampled rendering',flush=True)
    kit=r.render_kit(parts['drums'],bpm,length,style)
    perc=r.render_perc(parts['percussion'],bpm,length)
    bass=r.render_bass(parts['bass'],bpm,length)
    guitar=r.render_guitar(parts['guitar'],bpm,length,style)
    kit*=1 if style=='blues' else 1.05;perc*=1.2
    bass*=.39*10**(-12/20);guitar*=1.5*10**(-12/20)
    kit,kg=r.compress(kit,-22,1.5);bass,bg=r.compress(bass,-26,2);guitar,gg=r.compress(guitar,-25,1.45)
    curve=level_curve(bars,bpm,length).astype('float32')[:,None]
    # Strings follow the arc slightly less strongly; the drummer drives the build.
    kit*=curve;perc*=curve;bass*=curve**.8;guitar*=curve**.85
    send=r.filt(guitar*.22+perc*.10+bass*.025,280)
    ir=r.room_ir();room=np.zeros_like(send)
    for ch in range(2):room[:,ch]=fftconvolve(send[:,ch],ir[:,ch])[:length]
    gain=master_linear(name,kit+perc+bass+guitar+room)
    x,sr=sf.read(OUT/(name+'.wav'),always_2d=True)
    assert sr==SR and np.isfinite(x).all() and np.max(abs(x))<.9
    stats=[]
    for sec in sections:
        first=(4+(sec['start_bar']-1)*4)*60/bpm
        end=first+sec['bars']*4*60/bpm
        chunk=x[round(first*SR):round(end*SR)]
        stats.append(dict(**sec,start_seconds=round(first,2),rms_dbfs=round(float(20*np.log10(np.sqrt(np.mean(chunk**2))+1e-10)),2)))
    loud=[s['rms_dbfs'] for s in stats if s['name']=='Climax' or s['name']=='Climax and resolve'][0]
    quiet=[s['rms_dbfs'] for s in stats if s['name'] in ['Pull back','Breakdown']][0]
    assert loud-quiet>=4,(name,loud,quiet)
    data=dict(file=name+'.wav',style=style,mode=mode,key='A blues' if style=='blues' else 'A minor',
        bpm=bpm,bars=len(bars),seconds=round(len(x)/SR,2),seed=seed,generator=VERSION,
        chords=list(dict.fromkeys(b['chord'] for b in bars)),
        bass_notes=sorted({n for t,n,d,v in parts['bass']}),guitar_notes=sorted({n for t,n,d,v in parts['guitar']}),
        notes={p:len(ns) for p,ns in parts.items()},fills=len(fills),sections=stats,
        climax_above_breakdown_db=round(loud-quiet,2),master_gain_db=round(gain,2))
    (OUT/(name+'.events.json')).write_text(json.dumps(dict(metadata=data,bars=bars,fills=fills,parts=parts),indent=2)+'\n')
    print(json.dumps(data),flush=True)
    return data

if __name__=='__main__':
    results=[render(style,mode) for style in ['blues','rock'] for mode in ['steady','active']]
    (OUT/'manifest.json').write_text(json.dumps(results,indent=2)+'\n')
    for file in ['ATTRIBUTION.txt','LICENSE.txt']:
        shutil.copy(r.BASE.parents[0]/'backing-track-comparison'/file,OUT/file)
    (OUT/'ATTRIBUTION.txt').write_text((OUT/'ATTRIBUTION.txt').read_text()+
        '\nStory revision: new four-chord progressions, longer section plan, macro dynamics,\n'
        'source-derived and adapted phrase fills, and new coordinated bass/guitar parts.\n')
    shutil.copytree(r.BASE/'realistic/licenses',OUT/'licenses',dirs_exist_ok=True)
    shutil.copy(__file__,OUT/'explore-backing-sustain.py')
