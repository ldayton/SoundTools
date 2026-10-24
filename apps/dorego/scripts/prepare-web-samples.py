"""Prepare lossless web piano variants; originals remain available for CLI renders.

Requires FFmpeg. Two-second melody and five-second chord variants cover the
fixed web timing at 60 BPM, including nearest-note pitch shifts and release.
Run again when changing the recordings or preparation settings, then bump the
versioned directory in src/steinway.ts to invalidate browser caches.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
source = root / 'public/samples/bitklavier'
target = root / 'public/samples/bitklavier-web-v1'
target.mkdir(exist_ok=True)

def prepare(item):
    path, seconds = item
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-t', str(seconds),
                    '-map_metadata', '-1', '-c:a', 'flac', '-compression_level', '8',
                    str(target / f'{path.stem}-{seconds}s.flac')], check=True)

files = [source / f'{key}-v{layer}.flac' for layer in (11, 12) for key in range(21, 109, 3)]
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(prepare, [(path, seconds) for path in files for seconds in (2, 5)]))
(target / 'NOTICE.txt').write_text((source / 'NOTICE.txt').read_text() +
    '\nWeb adaptation: recordings shortened to their first two or five seconds, '
    'without changing retained PCM samples. Full originals remain in ../bitklavier/.\n')
print(f'Prepared {len(files) * 2} lossless web samples.')
