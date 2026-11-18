# SPDX-License-Identifier: MIT
"""Loudness-match WAV comparisons with constant gain, preserving their long dynamics."""
from pathlib import Path
import argparse,concurrent.futures,json,subprocess,tempfile
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('directory',type=Path)
p.add_argument('--target-lufs',type=float,default=-20)
a=p.parse_args();scratch=Path(__file__).resolve().parents[1]/'work';scratch.mkdir(exist_ok=True)
def measure(path):
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-20:TP=-1.5:LRA=20:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 s=r.stderr;return json.loads(s[s.rfind('{'):s.rfind('}')+1])
def master(path):
 before=measure(path);gain=a.target_lufs-float(before['input_i'])
 seconds=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True).strip())
 with tempfile.TemporaryDirectory(prefix='backing-master-',dir=scratch) as tmp:
  rendered=Path(tmp)/path.name
  filters=f'volume={gain}dB,alimiter=limit=0.8:attack=5:release=70:level=false:latency=true,afade=t=out:st={max(0,seconds-.25)}:d=0.25'
  subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(path),'-af',filters,'-ar','48000','-c:a','pcm_s24le',str(rendered)],check=True)
  rendered.replace(path)
 after=measure(path)
 return path.name,dict(before={k:before[k] for k in ['input_i','input_tp','input_lra']},gain_db=gain,after={k:after[k] for k in ['input_i','input_tp','input_lra']})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:result=dict(pool.map(master,sorted(a.directory.glob('*.wav'))))
(a.directory/'loudness-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
