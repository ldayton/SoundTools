"""Fetch only pinned model artifacts, with mandatory byte hashes; no datasets.

This is an isolated research download, not a grant of deployment rights.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

parser=argparse.ArgumentParser()
parser.add_argument('destination')
args=parser.parse_args()
here=Path(__file__).resolve().parent
manifest=json.loads((here/'artifacts.json').read_text())
root=Path(args.destination)
for row in manifest:
    target=root/row['model']/row['path']
    if target.exists():
        data=target.read_bytes()
    else:
        url=f"https://raw.githubusercontent.com/{row['repository']}/{row['revision']}/{row['path']}"
        data=urlopen(url,timeout=45).read()
    if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:
        raise ValueError('Artifact checksum mismatch: '+row['path'])
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
    print(row['model'],row['path'],len(data),'verified bytes')
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
