"""Fixed, pre-analysis continuous excerpts; no padding or signal enhancement."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];source=ROOT/'outputs/pitch-comparison/continuous-sources';out=ROOT/'outputs/pitch-comparison/filtered-stream';(out/'audio').mkdir(parents=True,exist_ok=True)
metadata=json.loads((source/'sources.json').read_text());selection={'ES2004a':[60,180,360],'IS1009a':[90,240,420],'TS3003a':[60,180,300]};clips=[]
for meeting,starts in selection.items():
 for start in starts:
  for channel in ['Array1-01','Mix-Headset']:
   name=f'{meeting}.{channel}.wav';info=next(p for p in metadata['files'] if Path(p['file']).name==name);file=ROOT/info['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==info['sha256'];ident=f'{meeting}-{start:03d}-'+('far' if channel=='Array1-01' else 'headset');wav=out/'audio'/f'{ident}.wav'
   subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(file),'-t','30','-ar','48000','-ac','1','-c:a','pcm_s16le',str(wav)],check=True)
   pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','pipe:1']);assert len(pcm)==30*48000*4,'Excerpt truncated: no padding allowed';(out/'audio'/f'{ident}.f32').write_bytes(pcm)
   clips.append({'id':ident,'meeting':meeting,'channel':channel,'source':info,'sourceStart':start,'seconds':30,'wav':str(wav.relative_to(ROOT)),'pcmSha256':hashlib.sha256(pcm).hexdigest(),'wavSha256':hashlib.sha256(wav.read_bytes()).hexdigest()})
manifest={'selection':'Three fixed, disjoint 30-second passages per meeting, chosen before detector comparison. Source channels kept separate.','rate':48000,'clips':clips}
(out/'continuous.json').write_text(json.dumps(manifest,indent=2));pin=ROOT/'tests/pitch-comparison/continuous-manifest.json'
if pin.exists():assert json.loads(pin.read_text())==manifest,'Pinned corpus changed'
else:pin.write_text(json.dumps(manifest,indent=2))
print('Prepared',len(clips),'channel excerpts; 270 seconds of distinct meeting time')
