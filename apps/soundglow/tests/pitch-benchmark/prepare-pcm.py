"""Decode acquired, hash-verified PTDB sources. No reference timestamp assumptions."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];folder=ROOT/'outputs/pitch-benchmark/ptdb';doc=json.loads((folder/'acquired.json').read_text())
for clip in doc['clips']:
    item=clip['files']['mic'];source=ROOT/item['file']
    if hashlib.sha256(source.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Source changed')
    output=folder/'pcm'/(clip['id']+'.f32');output.parent.mkdir(exist_ok=True)
    data=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-ar','48000','-ac','1','-f','f32le','pipe:1'])
    output.write_bytes(data);clip.update(pcm=str(output.relative_to(ROOT)),pcmSha256=hashlib.sha256(data).hexdigest(),sampleRate=48000)
(folder/'decoded.json').write_text(json.dumps(doc,indent=2));print(f"Decoded{len(doc['clips'])}clips; no scored reference clock assigned")
