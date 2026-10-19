"""Fetch original AMI meeting channels; never pad, loop, mix or denoise them."""
import concurrent.futures,hashlib,json,subprocess,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-comparison/continuous-sources';OUT.mkdir(parents=True,exist_ok=True)
base='https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/'
jobs=[(meeting,channel) for meeting in ['ES2004a','IS1009a','TS3003a'] for channel in ['Array1-01','Mix-Headset']]
def download(job):
 meeting,channel=job;name=f'{meeting}.{channel}.wav';url=f'{base}{meeting}/audio/{name}';dest=OUT/name
 if not dest.exists():
  with urllib.request.urlopen(url,timeout=60) as response,open(str(dest)+'.part','wb') as target:
   while True:
    block=response.read(1024*1024)
    if not block:break
    target.write(block)
  Path(str(dest)+'.part').replace(dest)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=sample_rate,channels,duration','-of','json',str(dest)]))
 print(name,dest.stat().st_size,flush=True)
 return {'file':str(dest.relative_to(ROOT)),'url':url,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'probe':probe,'license':'CC BY 4.0','licenseSource':'https://groups.inf.ed.ac.uk/ami/download/','attribution':'AMI Consortium / University of Edinburgh, AMI Meeting Corpus'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:files=list(pool.map(download,jobs))
(OUT/'sources.json').write_text(json.dumps({'description':'Original continuous meeting channels; no synthetic noise, looping or padding. Headset mix is a comparison channel, not reference F0.','files':files},indent=2))
