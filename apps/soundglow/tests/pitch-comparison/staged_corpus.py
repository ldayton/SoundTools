"""Validate a complete staged corpus before publishing any generated files."""
import hashlib
import json

def publish(stage, output, manifest, pin):
    if manifest != pin:
        raise ValueError('Pinned sources or generated PCM changed')
    files = []
    for clip in pin['clips']:
        for suffix, digest in [('wav', 'wavSha256'), ('f32', 'pcmSha256')]:
            source = stage / (clip['id'] + '.' + suffix)
            if hashlib.sha256(source.read_bytes()).hexdigest() != clip[digest]:
                raise ValueError('Staged audio does not match pin')
            files.append(source)
    # All generation and integrity checks have completed before any replacement.
    for source in files:
        source.replace(output / source.name)
    temporary = output / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2))
    temporary.replace(output / 'manifest.json')
