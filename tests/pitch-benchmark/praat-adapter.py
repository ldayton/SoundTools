"""Stock offline Praat settings; preserves native timestamps and undefined frames."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('wav');p.add_argument('output');p.add_argument('--binary',default='/Applications/Praat.app/Contents/MacOS/Praat');a=p.parse_args()
script=Path(__file__).with_name('stock-praat.praat');raw=subprocess.check_output([a.binary,'--run',str(script.resolve()),str(Path(a.wav).resolve())],text=True)
rows={1:[],2:[]}
for line in raw.splitlines()[1:]:
    method,t,hz=line.split('\t');rows[int(method)].append(dict(time=float(t),hz=0 if 'undefined' in hz else float(hz)))
result=dict(mode='offline-whole-file',wavSha256=hashlib.sha256(Path(a.wav).read_bytes()).hexdigest(),binarySha256=hashlib.sha256(Path(a.binary).read_bytes()).hexdigest(),scriptSha256=hashlib.sha256(script.read_bytes()).hexdigest(),methods={'praat-stock-raw':rows[1],'praat-stock-filtered':rows[2]})
Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(result,indent=2));print({k:len(v) for k,v in result['methods'].items()})
