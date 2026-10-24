import os
"""Acquire bounded raw stereo prefixes plus matching soft/normal sentence snippets.
Raw prefixes contain synchronous microphone/EGG. Prefix SHA pins do not imply full ZIP CRC verification.
"""
import sys,zipfile,wave,hashlib,json,concurrent.futures,time,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'pitch-comparison'))
from remote_zip import Remote as RangeRemote
class Remote(RangeRemote):
 def read(self,n=-1):
  for attempt in range(5):
   try:return super().read(n)
   except urllib.error.HTTPError as e:
    if e.code not in (429,503) or attempt==4:raise
    print('Server rate limit; waiting30seconds',flush=True);time.sleep(30)

ROOT=Path(__file__).resolve().parents[2];OUT=Path(os.environ.get('AVID_OUTPUT',str(ROOT/'outputs/pitch-benchmark/avid')));OUT.mkdir(parents=True,exist_ok=True)
URL='https://zenodo.org/api/records/10524873/files/AVID.zip/content';SIZE=9947986886
SPEAKERS=[int(x) for x in os.environ.get('AVID_SPEAKERS','4,5,6,7,11,12,13,14').split(',')]
def acquire(sp):
 folder=OUT/f'sp{sp}';folder.mkdir(exist_ok=True);raw=folder/'prefix120.wav';z=None
 def archive():
  nonlocal z
  if z is None:z=zipfile.ZipFile(Remote(URL,SIZE))
  return z
 names=json.loads((OUT.parent/'avid-inventory.json').read_text());member=next(n for n in names if n.startswith(f'AVID/Repository 1/Spk{sp}_') and n.endswith('.wav'))
 if not raw.exists():
  with archive().open(member) as f:
   w=wave.open(f);params=w.getparams();data=w.readframes(params.framerate*120)
   with wave.open(str(raw),'wb') as out:out.setparams(params);out.writeframes(data)
 result={'speaker':f'AVID-{sp}','rawPrefix':str(raw.relative_to(ROOT)),'rawPrefixSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'rawMember':member,'seconds':120,'fullArchiveCRCVerified':False,'clips':[]}
 for task in ['sen1','sen2']:
  for intensity in os.environ.get('AVID_INTENSITIES','soft,normal,loud,veryloud').split(','):
   name=f'sp{sp}_s1_{task}_{intensity}.wav';path=folder/name;mem='AVID/Repository 2/SENT/'+name
   if not path.exists():path.write_bytes(archive().read(mem))
   result['clips'].append(dict(id=name[:-4],condition=intensity,file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),member=mem))
 if z:z.close()
 (folder/'acquired.json').write_text(json.dumps(result,indent=2))
 print(f'sp{sp}: paired prefix +{len(result["clips"])} snippets',flush=True);return result
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:results=list(pool.map(acquire,SPEAKERS))
 (OUT/'acquired.json').write_text(json.dumps(dict(source=URL,selection={'speakers':SPEAKERS,'prefixSeconds':120,'session':1,'tasks':['sen1','sen2'],'intensities':os.environ.get('AVID_INTENSITIES','soft,normal,loud,veryloud').split(','),'note':'Fixed acquisition selection; sex balance is not inferred from speaker IDs'},speakers=results),indent=2))
