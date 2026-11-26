"""Fetch pinned offline research artifacts, checking committed hashes.

Does not install the project or execute downloaded code. Learned rule weights
are marked research/non-profit by the model card. Keep these files in work/.
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

manifest_path, destination = map(pathlib.Path, sys.argv[1:])
manifest = json.loads(manifest_path.read_text())
destination.mkdir(parents=True, exist_ok=True)
sha256 = lambda b: hashlib.sha256(b).hexdigest()


def fetch(url, path, expected=None):
    if path.exists():
        if expected is not None and sha256(path.read_bytes()) != expected:
            raise ValueError('Existing artifact hash mismatch: '+str(path))
        return
    content=urllib.request.urlopen(url).read()
    if expected is not None and sha256(content)!=expected:
        raise ValueError('Downloaded artifact hash mismatch: '+url)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content)


revision=manifest['githubRevision']
for relative,digest in manifest['sourceSha256'].items():
    fetch(f'https://raw.githubusercontent.com/vibetuned/chirality/{revision}/src/{relative}',destination/'upstream'/relative,digest)
fetch(f'https://raw.githubusercontent.com/vibetuned/chirality/{revision}/LICENSE',destination/'upstream/LICENSE')
weights=manifest['weights']
fetch(f"https://huggingface.co/vibetuned/chirality-models/resolve/{weights['revision']}/{weights['path']}",destination/'parncutt.json',weights['sha256'])
fetch(f"https://huggingface.co/vibetuned/chirality-models/resolve/{weights['revision']}/README.md",destination/'README.md',manifest['modelCardSha256'])
# Minimal local import scaffold avoids unrelated gym/torch package setup. These
# two files are ours; both upstream feature/decoder modules stay byte-identical.
for relative in ['chirality/__init__.py','chirality/rules/__init__.py']:
    p=destination/'upstream'/relative
    if not p.exists():
        p.write_text('# Offline research import scaffold.\n')
print('Verified pinned research artifacts in '+str(destination))
