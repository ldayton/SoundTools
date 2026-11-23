"""Build normalized, loop-preserving FreePats drawbar samples. Requires ffmpeg.
Usage: python3 packages/music-practice/scripts/build-songalong-organ.py /path/to/drawbar.tar.xz
"""
from pathlib import Path
import array, hashlib, json, math, re, subprocess, sys, tarfile, tempfile
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'packages/music-practice/src/assets/songalong-organ'
URL = 'https://freepats.zenvoid.org/Organ/DrawbarOrganEmulation/DrawbarOrganEmulation-SFZ-20190712.tar.xz'
SHA = 'e2da18b0a4d13be7020037e18e4a719387433357e7603d0773990e794dcf5d0f'
RATE = 24000
TARGET_DB = -26
archive = Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == SHA, 'Upstream archive hash mismatch'
OUT.mkdir(parents=True, exist_ok=True)
def pcm(path):
    data = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'])
    values = array.array('f'); values.frombytes(data)
    return values
with tempfile.TemporaryDirectory() as temp:
    with tarfile.open(archive) as bank: bank.extractall(temp, filter='data')
    source = Path(temp) / 'DrawbarOrganEmulation-SFZ-20190712'
    sfz = next(source.glob('*.sfz'))
    audit = {'archiveUrl': URL, 'archiveSha256': SHA, 'files': {}}
    samples = []
    for region in sfz.read_text().split('<region>')[1:]:
        fields = dict(re.findall(r'(\w+)=(\S+)', region))
        path = source / fields['sample']
        root = int(fields['pitch_keycenter'])
        start = round(int(fields['loop_start']) / 44100 * RATE)
        end = round((int(fields['loop_end']) + 1) / 44100 * RATE)
        values = pcm(path)
        sustain = values[start:end]
        rms = math.sqrt(sum(x*x for x in sustain) / len(sustain))
        gain = min(10 ** (TARGET_DB/20) / rms, 10 ** (-6/20) / max(map(abs, values)))
        file = OUT / f'organ-{root}.flac'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-af', f'volume={gain:.12f}', '-ar', str(RATE), '-ac', '1', '-sample_fmt', 's16', str(file)], check=True)
        normalized = pcm(file)
        measured = math.sqrt(sum(x*x for x in normalized[start:end]) / (end-start))
        samples.append({'file': file.name, 'pitch': root, 'low': int(fields['lokey']), 'high': int(fields['hikey']), 'loopStart': start/RATE, 'loopEnd': end/RATE, 'rmsDb': 20*math.log10(measured), 'peak': max(map(abs, normalized)), 'gainDb': 20*math.log10(gain)})
        audit['files'][fields['sample']] = hashlib.sha256(path.read_bytes()).hexdigest()
    audit['files'][sfz.name] = hashlib.sha256(sfz.read_bytes()).hexdigest()
    (OUT/'source-sha256.json').write_text(json.dumps(audit, indent=2)+'\n')
    (OUT/'manifest.json').write_text(json.dumps({'name': 'FreePats Drawbar Organ Emulation', 'version': '2019-07-12', 'license': 'CC0-1.0', 'sampleRate': RATE, 'normalization': {'sustainRmsDb': TARGET_DB, 'samplePeakCeilingDb': -6}, 'samples': samples}, indent=2)+'\n')
    (OUT/'NOTICE.txt').write_text((source/'readme.txt').read_text()+f'\nSongAlong adaptation: 24 kHz mono 16-bit FLAC; sustain RMS normalized to {TARGET_DB} dBFS per root, with a -6 dBFS sample peak ceiling. Original SFZ pitch zones and sustain loops retained (inclusive source loop end converted to exclusive Web Audio seconds). No velocity layers or automatic sustain pedal. Source archive, WAV and SFZ hashes in source-sha256.json; measured levels and loops in manifest.json.\n')
print(len(samples), 'roots;', sum(p.stat().st_size for p in OUT.glob('*.flac')), 'bytes')
print('Sustain RMS dBFS:', min(s['rmsDb'] for s in samples), max(s['rmsDb'] for s in samples))
