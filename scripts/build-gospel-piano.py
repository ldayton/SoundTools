# SPDX-License-Identifier: MIT
"""Compact native browser piano bank from the already-licensed bitKlavier files."""
from pathlib import Path
from fractions import Fraction
import hashlib
import json
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

root = Path(__file__).resolve().parents[1]
source = root / 'apps/dorego/public/samples/bitklavier-web-v1'
out = root / 'packages/music-practice/src/assets/backing-gospel'
out.mkdir(parents=True, exist_ok=True)
samples, audit = {}, {}
for note in range(48, 80):
    native = min(range(48, 82, 3), key=lambda n: abs(n-note))
    file = source / f'{native}-v11-2s.flac'
    audit[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
    x, sr = sf.read(file, always_2d=True, dtype='float32')
    ratio = Fraction(24000/(sr * 2 ** ((note-native)/12))).limit_denominator(4096)
    x = resample_poly(x, ratio.numerator, ratio.denominator)
    x = x[:48000]
    x[-960:] *= np.linspace(1,0,960)[:,None]
    name = f'gospel-piano-{note}.flac'
    sf.write(out/name, x, 24000, subtype='PCM_16')
    samples[f'gospel-piano-{note}'] = dict(file=name, part='keys', instrument='acoustic-piano',
        note=note, velocity=64, rr=0, gain=.5, release=False, articulation='normal')
(out/'manifest.json').write_text(json.dumps(dict(samples=samples), separators=(',',':'))+'\n')
(out/'source-sha256.json').write_text(json.dumps(audit, indent=2)+'\n')
(out/'NOTICE.txt').write_text('Traditional Gospel acoustic piano\n'+(source/'NOTICE.txt').read_text()+
    '\nAdditional adaptation: nearest recorded root (at most one semitone), resampled to 24 kHz, '+
    'two-second maximum tail and 40 ms fade, 16-bit FLAC. Original source hashes are beside this notice.\n'+
    'The tonewheel organ and rotary effect are original MIT-licensed synthesis code, not Hammond recordings.\n'+
    'Hammond and Leslie are trademarks of their respective owners; no affiliation is implied.\n')
print(json.dumps(dict(files=len(samples),bytes=sum(p.stat().st_size for p in out.glob('*.flac')))))
