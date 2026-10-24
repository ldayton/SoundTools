import hashlib
import tempfile
import unittest
from pathlib import Path
from staged_corpus import publish

class StagedCorpusTest(unittest.TestCase):
    def test_validation_failure_preserves_existing_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); stage = root/'stage'; output = root/'output'
            stage.mkdir(); output.mkdir()
            for name in ['voice.wav', 'voice.f32', 'manifest.json', 'results.json', 'report.html']:
                (output/name).write_bytes(b'accepted')
            digest = hashlib.sha256(b'new').hexdigest()
            pin = {'clips': [{'id':'voice', 'wavSha256':digest, 'pcmSha256':digest}]}
            before = {p.name:p.read_bytes() for p in output.iterdir()}
            (stage/'voice.wav').write_bytes(b'new')
            with self.assertRaises(ValueError): publish(stage, output, {}, pin)
            # An incomplete generation (e.g. decoder failure) cannot publish a partial clip.
            with self.assertRaises(FileNotFoundError): publish(stage, output, pin, pin)
            (stage/'voice.f32').write_bytes(b'corrupt')
            with self.assertRaises(ValueError): publish(stage, output, pin, pin)
            self.assertEqual(before, {p.name:p.read_bytes() for p in output.iterdir()})
            (stage/'voice.f32').write_bytes(b'new')
            publish(stage, output, pin, pin)
            self.assertEqual((output/'voice.wav').read_bytes(), b'new')
            self.assertEqual((output/'results.json').read_bytes(), b'accepted')

if __name__ == '__main__': unittest.main()
