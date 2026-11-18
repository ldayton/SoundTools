# SPDX-License-Identifier: MIT
"""Match A/B WAVs using constant gain only, with a common true-peak-safe target."""
from pathlib import Path
import argparse,concurrent.futures,json,subprocess,tempfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);a=p.parse_args()
files=sorted(a.directory.glob('*.wav'));assert files
scratch=Path(__file__).resolve().parents[1]/'work';scratch.mkdir(exist_ok=True)
def measure(path):
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-20:TP=-1.5:LRA=20:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 s=r.stderr;return json.loads(s[s.rfind('{'):s.rfind('}')+1])
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:before=dict(zip(files,pool.map(measure,files)))
# One target for every file. Avoid a limiter or rolling normalization changing
# the phrase dynamics that the listener is supposed to compare.
target=round(min(-20,min(float(d['input_i'])-1.5-float(d['input_tp']) for d in before.values()))-.05,2)
def master(path):
 d=before[path];gain=target-float(d['input_i'])
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True).strip())
 with tempfile.TemporaryDirectory(prefix='backing-ab-',dir=scratch) as tmp:
  rendered=Path(tmp)/path.name
  subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(path),'-af',f'volume={gain}dB,afade=t=out:st={max(0,duration-.15)}:d=0.15','-ar','48000','-c:a','pcm_s24le',str(rendered)],check=True)
  rendered.replace(path)
 after=measure(path)
 assert abs(float(after['input_i'])-target)<.1,(path,after,target)
 assert float(after['input_tp'])<=-1.45,(path,after)
 return path.name,dict(gain_db=round(gain,2),before={k:d[k] for k in ['input_i','input_tp','input_lra']},after={k:after[k] for k in ['input_i','input_tp','input_lra']})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:result=dict(pool.map(master,files))
report=dict(target_lufs=target,method='One constant gain per file; no limiting or rolling loudness normalization',files=result)
(a.directory/'loudness-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
