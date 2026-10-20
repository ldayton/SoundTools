"""REAPER's whole-utterance output is an offline comparator, not ground truth."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('wav');p.add_argument('output');p.add_argument('--binary',default='outputs/pitch-benchmark/REAPER/build/reaper');a=p.parse_args()
with tempfile.TemporaryDirectory() as td:
    f=Path(td)/'pitch.f0';subprocess.run([a.binary,'-i',a.wav,'-f',str(f),'-a'],check=True,capture_output=True)
    lines=f.read_text().split('EST_Header_End\n',1)[1].strip().splitlines();rows=[]
    for line in lines:
        t,voiced,hz=map(float,line.split());rows.append(dict(time=t,hz=hz if voiced and hz>0 else 0))
binary=Path(a.binary).resolve();repo=binary.parents[1];commit=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
result=dict(algorithm='reaper',mode='offline-whole-file',settings='upstream CLI defaults',commit=commit,binarySha256=hashlib.sha256(binary.read_bytes()).hexdigest(),wavSha256=hashlib.sha256(Path(a.wav).read_bytes()).hexdigest(),rows=rows)
Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(result,indent=2));print(f'{len(rows)}frames')
