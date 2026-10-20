"""Fetch the fixed, independently labelled pilot; never discover/re-pin sources implicitly."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import subprocess
import urllib.request
ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT/'tests/pitch-comparison/practice-manifest.json').read_text())

def checked(data, digest):
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Pinned audio/reference changed')
    return data

def atomic_file(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.part')
    temporary.write_bytes(data)
    temporary.replace(path)

def prepare(clip):
    for item in clip['files'].values():
        path = ROOT/item['file']
        if path.exists(): checked(path.read_bytes(), item['sha256'])
        else:
            with urllib.request.urlopen(item['url'], timeout=45) as response:
                data = checked(response.read(), item['sha256'])
            atomic_file(path, data)
    data = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(ROOT/clip['files']['mic']['file']), '-ar', '48000', '-ac', '1', '-f', 'f32le', 'pipe:1'])
    checked(data, clip['pcmSha256'])
    if len(data) != round(clip['seconds']*48000)*4:
        raise ValueError('PCM duration mismatch')
    atomic_file(ROOT/clip['pcm'], data)
    return clip['id']

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for ident in pool.map(prepare, MANIFEST['clips']): print(ident)
