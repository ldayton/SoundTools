"""Download only pinned AVID members, with CRC and SHA checks; do not fetch the full archive."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
from remote_zip import Remote
from importlib.util import spec_from_file_location,module_from_spec
ROOT=Path(__file__).resolve().parents[2]
spec=spec_from_file_location('prepare_practice',Path(__file__).with_name('prepare-practice.py'));helpers=module_from_spec(spec);spec.loader.exec_module(helpers)
manifest=json.loads((ROOT/'tests/pitch-comparison/avid-manifest.json').read_text())
if __name__=='__main__':
    archive=None
    try:
        for clip in manifest['clips']:
            path=ROOT/clip['wav']
            if path.exists():helpers.checked(path.read_bytes(),clip['wavSha256'])
            else:
                if archive is None:archive=zipfile.ZipFile(Remote(clip['url'],9947986886))
                data=helpers.checked(archive.read(clip['archiveMember']),clip['wavSha256'])
                helpers.atomic_file(path,data)
            pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','48000','-ac','1','-f','f32le','pipe:1'])
            helpers.checked(pcm,clip['pcmSha256']);helpers.atomic_file(ROOT/clip['pcm'],pcm)
            print(clip['id'])
    finally:
        if archive:archive.close()
