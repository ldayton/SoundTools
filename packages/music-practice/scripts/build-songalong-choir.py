"""Build the CC BY 4.0 epic-choir alto 'ah' mf bank. Requires ffmpeg.
Usage: python3 packages/music-practice/scripts/build-songalong-choir.py /path/to/epic-choir-v1.0-A.zip
"""
from pathlib import Path
import array, hashlib, json, math, re, subprocess, sys, tempfile, zipfile
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'packages/music-practice/src/assets/songalong-choir'
SHA='a0ab193e78f45a9e8925280bc19b6dfee215b87f968481d14fd3dcbb2d58b7cf'
archive=Path(sys.argv[1]);assert hashlib.sha256(archive.read_bytes()).hexdigest()==SHA
OUT.mkdir(parents=True,exist_ok=True)
def pcm(path):
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ar','24000','-ac','2','-'])
 values=array.array('f');values.frombytes(data);return values
samples=[];audit={'archiveUrl':'https://github.com/thepok/epic-choir/releases/download/v1.0/epic-choir-v1.0-A.zip','archiveSha256':SHA,'files':{}}
with tempfile.TemporaryDirectory() as temp:
 with zipfile.ZipFile(archive) as bank:
  for name in bank.namelist():
   if re.fullmatch(r'samples/A/A_ah_mf_\w+\.wav',name):
    path=Path(temp)/Path(name).name;path.write_bytes(bank.read(name))
    token=path.stem.split('_')[-1]
    note=re.fullmatch(r'([A-G])(s?)(\d)',token)
    pitch=(int(note[3])+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[note[1]]+bool(note[2])
    values=pcm(path);start=round(.33*24000)*2;end=round(2.33*24000)*2
    rms=math.sqrt(sum(x*x for x in values[start:end])/(end-start))
    gain=min(10**(-26/20)/rms,10**(-6/20)/max(map(abs,values)))
    target=OUT/f'choir-ah-{pitch}.flac'
    subprocess.run(['ffmpeg','-v','error','-y','-ss','0.08','-i',str(path),'-af',f'volume={gain:.12f}','-ar','24000','-ac','2','-sample_fmt','s16',str(target)],check=True)
    normalized=pcm(target);a=round(.25*24000)*2;b=round(2.25*24000)*2
    samples.append({'file':target.name,'pitch':pitch,'low':pitch if pitch!=58 else 57,'high':pitch+1,'rmsDb':20*math.log10(math.sqrt(sum(x*x for x in normalized[a:b])/(b-a))),'peak':max(map(abs,normalized)),'duration':len(normalized)/48000,'gainDb':20*math.log10(gain)})
    audit['files'][name]=hashlib.sha256(path.read_bytes()).hexdigest()
(OUT/'source-sha256.json').write_text(json.dumps(audit,indent=2)+'\n')
(OUT/'manifest.json').write_text(json.dumps({'name':'epic-choir alto ah','license':'CC-BY-4.0','sampleRate':24000,'normalization':{'sustainRmsDb':-26,'samplePeakCeilingDb':-6},'samples':sorted(samples,key=lambda s:s['pitch'])},indent=2)+'\n')
(OUT/'NOTICE.txt').write_text('''Choir samples derived from VocalSet (Wilkins, Seetharaman, Wahl, Pardo 2018), CC BY 4.0,
https://doi.org/10.5281/zenodo.1442513 — epic-choir by thepok.
Original library: https://github.com/thepok/epic-choir (v1.0).
License: Creative Commons Attribution 4.0 International
https://creativecommons.org/licenses/by/4.0/
Original dataset: Julia Wilkins, Prem Seetharaman, Alison Wahl, Bryan Pardo. VocalSet: A Singing Voice Dataset (Version 1.2), 2018.
Upstream changes: real VocalSet singers excerpted, gently pitch shifted, sustain extended, level matched and placed into a simulated hall as ensemble samples.
SongAlong changes: alto ah mf vowel subset, original SFZ 80 ms start offset applied; 24 kHz stereo 16-bit FLAC, sustain window normalized to -26 dBFS RMS with a -6 dBFS sample peak ceiling. No words or voice cloning. Source archive/sample hashes and measured levels are retained in the accompanying JSON files. No endorsement by the original authors is implied.
''')
print(len(samples),'roots;',sum(p.stat().st_size for p in OUT.glob('*.flac')),'bytes')
print('Sustain RMS dBFS:',min(s['rmsDb'] for s in samples),max(s['rmsDb'] for s in samples))
