"""Inventory the full official corpus; optionally acquire a bounded, reproducible subset.
Discovery and downloads are separate; acquired bytes are pinned in a local lockfile.
"""
import argparse, concurrent.futures, hashlib, json, re, urllib.request
from pathlib import Path
BASE='https://www2.spsc.tugraz.at/databases/PTDB-TUG/SPEECH%20DATA/'
ROOT=Path(__file__).resolve().parents[2]
def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r: return r.read()
def inventory(speaker):
    gender='FEMALE' if speaker.startswith('F') else 'MALE'
    base=BASE+gender+'/MIC/'+speaker+'/'
    names=sorted(set(re.findall(r'href="(mic_'+speaker+r'_[a-z]+\d+\.wav)"',fetch(base).decode())))
    if len(names)<200: raise ValueError(f'{speaker}: incomplete or invalid inventory ({len(names)})')
    number=int(speaker[1:]);split='development' if number<=4 else 'calibration' if number<=6 else 'test'
    return [dict(id=speaker+'-'+name.split('_')[-1][:-4],corpus='ptdb',speaker=speaker,split=split,files={kind:BASE+gender+'/'+folder+'/'+speaker+'/'+name.replace('mic_',prefix).replace('.wav',ext) for kind,folder,prefix,ext in [('mic','MIC','mic_','.wav'),('lar','LAR','lar_','.wav'),('ref','REF','ref_','.f0')]}) for name in names]
def main():
    p=argparse.ArgumentParser();p.add_argument('--per-speaker',type=int,default=0,help='0 inventories only; positive acquires that many non-shared si sentences per speaker');a=p.parse_args()
    if a.per_speaker<0 or a.per_speaker>189:p.error('per-speaker must be0..189')
    out=ROOT/'outputs/pitch-benchmark/ptdb';out.mkdir(parents=True,exist_ok=True)
    speakers=[f'{g}{i:02}' for g in 'FM' for i in range(1,11)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: clips=sum(pool.map(inventory,speakers),[])
    doc=dict(documentedUtterances=4720,availableUtterances=len(clips),availablePerSpeaker={s:sum(c['speaker']==s for c in clips) for s in speakers},source=BASE,license='ODbL-1.0 / DbCL-1.0',timingVerified=False,splitPolicy='speaker number1-4development,5-6calibration,7-10test; excludes previously used sa prompts from acquisition',clips=clips)
    (out/'inventory.json').write_text(json.dumps(doc,indent=2))
    print(f'Inventoried{len(clips)}utterances/{len(speakers)}speakers',flush=True)
    if not a.per_speaker:return
    selected=[c for s in speakers for c in [x for x in clips if x['speaker']==s and '-si' in x['id']][:a.per_speaker]]
    lock=out/'acquired.json';old=json.loads(lock.read_text()) if lock.exists() else {'clips':[]};pins={(c['id'],k):v['sha256'] for c in old['clips'] for k,v in c['files'].items()}
    def acquire(c):
        c={**c,'files':{}}
        for kind,url in next(x['files'] for x in selected if x['id']==c['id']).items():
            target=out/'sources'/url.rsplit('/',1)[-1];target.parent.mkdir(exist_ok=True)
            data=target.read_bytes() if target.exists() else fetch(url);digest=hashlib.sha256(data).hexdigest()
            if (c['id'],kind) in pins and pins[c['id'],kind]!=digest:raise ValueError('Pinned source changed: '+c['id'])
            if not target.exists():temp=target.with_suffix(target.suffix+'.part');temp.write_bytes(data);temp.replace(target)
            c['files'][kind]=dict(url=url,file=str(target.relative_to(ROOT)),sha256=digest)
        return c
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: acquired=list(pool.map(acquire,selected))
    lock.write_text(json.dumps({**doc,'clips':acquired},indent=2));print(f'Acquired{len(acquired)}utterances with microphone,laryngograph,reference; timing unverified')
if __name__=='__main__':main()
