#!/usr/bin/env python3
"""Create identical PCM and native Praat reference for a controlled visual test."""
from pathlib import Path
import argparse, struct, wave, subprocess
parser=argparse.ArgumentParser();parser.add_argument('--praat',required=True,type=Path);args=parser.parse_args()
root=Path(__file__).resolve().parents[2];out=root/'tests/visual/generated';out.mkdir(exist_ok=True)
source=root/'dist/audio/speech-english.wav'
with wave.open(str(source)) as w:
 assert (w.getframerate(),w.getsampwidth(),w.getnchannels())==(24000,2,1)
 w.setpos(12*24000);data=w.readframes(int(10.2*24000));values=struct.unpack('<'+'h'*(len(data)//2),data)
(out/'matched.f32').write_bytes(struct.pack('<'+'f'*len(values),*(v/32768 for v in values)))
html=(root/'dist/index.html').read_text().replace('<head>','<head><base href="/dist/">').replace('</body>','<script src="/tests/visual/harness.js"></script></body>')
(out/'harness.html').write_text(html)
# Native finite sounds centre their frame grid. 10.1 s gives the same 5 ms
# origin as the 110 ms streaming blocks; numeric.cjs asserts this explicitly.
script=f'''Read from file: "{source}"
Extract part: 12, 22.1, "rectangular", 1, "no"
To Spectrogram: 0.005, 5000, 0.005, 10, "Gaussian"
Select outer viewport: 0, 6, 0, 7.2
Paint: 0, 10, 0, 5000, 100, "yes", 70, 6, 0, "no"
Save as 300-dpi PNG file: "{out/'native-reference.png'}"
To Matrix
Save as text file: "{out/'matched-native-matrix.txt'}"
'''
(out/'reference.praat').write_text(script)
subprocess.run([str(args.praat.resolve()),'--run',str(out/'reference.praat')],check=True)
print('Prepared',out)
