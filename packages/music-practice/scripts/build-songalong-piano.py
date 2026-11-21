"""Build SongAlong's three recorded velocity layers; requires ffmpeg on PATH."""
from pathlib import Path
import subprocess, hashlib, json
root = Path(__file__).resolve().parents[3]
source = root / 'apps/dorego/public/samples/bitklavier'
out = root / 'packages/music-practice/src/assets/songalong-piano'
out.mkdir(exist_ok=True)
audit = {}
for note in range(36, 97, 3):
    for layer in [4, 8, 12]:
        file = source / f'{note}-v{layer}.flac'
        audit[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(file),'-t','6','-af','afade=t=out:st=5.85:d=0.15','-ar','24000','-sample_fmt','s16',str(out/file.name)],check=True)
(out/'source-sha256.json').write_text(json.dumps(audit,indent=2)+'\n')
(out/'NOTICE.txt').write_text((source/'NOTICE.txt').read_text()+'\nSongAlong adaptation: recorded layers 4, 8, and 12; roots C2-C7 every minor third; 24 kHz stereo, 16-bit FLAC, six-second maximum with 150 ms tail fade. No normalization; recorded dynamics retained. Source hashes in source-sha256.json.\n')
print(sum(f.stat().st_size for f in out.glob('*.flac')), 'bytes')
