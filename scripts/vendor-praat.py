#!/usr/bin/env python3
"""Vendor one local release build together with its exact source inputs."""
import pathlib, subprocess, shutil, tarfile, argparse, hashlib, json, io, re
parser=argparse.ArgumentParser();parser.add_argument('checkout',type=pathlib.Path);args=parser.parse_args()
root=args.checkout.resolve();target=pathlib.Path(__file__).resolve().parents[1]/'dist/vendor/praat'
if (root/'wasm/frame-analysis.h').read_bytes() != (target.parents[2]/'engine/frame-analysis.h').read_bytes():raise SystemExit('Frame-analysis source differs from engine/frame-analysis.h')
if (root/'wasm/voice-analysis.h').read_bytes() != (target.parents[2]/'engine/voice-analysis.h').read_bytes():raise SystemExit('Voice-analysis source differs from engine/voice-analysis.h')
(target/'build-release').mkdir(parents=True,exist_ok=True)
for name in ['worker.js','processor.js','client.js']:shutil.copy2(root/'wasm'/name,target/name)
manifest=json.loads((root/'wasm/build-release/manifest.json').read_text())
headers=sorted(p for p in root.rglob('*.h') if '.git' not in p.parts and not any(part.startswith('build') for part in p.parts))
header_hash=hashlib.sha256()
for p in headers:header_hash.update(str(p.relative_to(root)).encode());header_hash.update(p.read_bytes())
base_key=hashlib.sha256((manifest['toolchain']+'release'+header_hash.hexdigest()+(root/'wasm/build.py').read_text()).encode()).hexdigest()
sources=(root/'wasm/sources.txt').read_text().splitlines()+['wasm/spectrogram.cpp']
source_hash=hashlib.sha256((base_key+''.join(hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources)).encode()).hexdigest()
if source_hash!=manifest['sourceInputsSha256']:raise SystemExit('Source changed since release build; rebuild first')
for name in ['praat-spectrogram.js','praat-spectrogram.wasm','manifest.json']:
 source=root/'wasm/build-release'/name
 if name in manifest['assets'] and hashlib.sha256(source.read_bytes()).hexdigest()!=manifest['assets'][name]['sha256']:raise SystemExit('Artifact hash mismatch: '+name)
 shutil.copy2(source,target/'build-release'/name)
# Exact compiled translation units, all headers (build.py's include/hash inputs),
# and the complete adapter/build/test sources. No unrelated models or media.
files=set((root/'wasm/sources.txt').read_text().splitlines())
files.update(str(p.relative_to(root)) for p in root.rglob('*.h') if '.git' not in p.parts and not any(part.startswith('build') for part in p.parts))
files.update(str(p.relative_to(root)) for p in (root/'wasm').glob('*') if p.is_file())
files.update(['README.md','docs/LICENSE.txt'])
# Some translation units include implementation .c files, not just headers.
by_name={}
for p in root.rglob('*'):
 if p.is_file() and '.git' not in p.parts and not any(part.startswith('build') for part in p.parts):by_name.setdefault(p.name,[]).append(p)
queue=list(files)
while queue:
 name=queue.pop();path=root/name
 for included in re.findall(r'^\s*#\s*include\s*"([^"]+)"',path.read_text(errors='ignore'),re.M):
  direct=path.parent/included
  candidates=[direct] if direct.is_file() else by_name.get(pathlib.Path(included).name,[])
  for dependency in candidates:
   relative=str(dependency.resolve().relative_to(root))
   if relative not in files:files.add(relative);queue.append(relative)

with tarfile.open(target/'source.tar.gz','w:gz') as archive:
 data=(manifest['sourceCommit']+'\n').encode();info=tarfile.TarInfo('praat/SOURCE_REVISION');info.size=len(data);archive.addfile(info,io.BytesIO(data))
 for name in sorted(files):
  if name and (root/name).is_file():archive.add(root/name,arcname='praat/'+name,recursive=False)
print('Vendored verified release artifacts and corresponding source into',target)
