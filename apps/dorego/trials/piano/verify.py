"""Check the generated bank against the untouched source PCM."""
import hashlib
import json
import math
import unittest
from prepare import OUTPUT, SOURCE, pcm


class BankTests(unittest.TestCase):
    def test_channels_and_pcm(self):
        manifest = json.loads((OUTPUT / "manifest.json").read_text())
        self.assertEqual(len(manifest["clips"]), 12)
        for clip in manifest["clips"]:
            stem = f'{clip["midi"]}-v{clip["layer"]}'
            source = SOURCE / f"{stem}-2s.flac"
            stereo = pcm(source)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), clip["variants"]["stereo"]["sha256"])
            left, right = stereo[::2], stereo[1::2]
            for profile, meta in clip["variants"].items():
                self.assertEqual(meta["sampleRate"], 44100)
                self.assertEqual(meta["bits"], 16)
                self.assertEqual(meta["frames"], 88200)
                self.assertEqual(meta["channels"], 2 if profile == "stereo" else 1)
                if profile == "stereo":
                    continue
                result = pcm(OUTPUT / f"{stem}-{profile}.flac")
                self.assertEqual(len(result), len(left))
                if profile in ("left", "right"):
                    self.assertEqual(result, left if profile == "left" else right)
                else:
                    self.assertLessEqual(max(abs(s - (l + r) * 0.5) for s, l, r in zip(result, left, right)), 2 / 32768)
            if clip["midi"] == 75:
                ratio = clip["variants"]["sum"]["rms"] / clip["variants"]["stereo"]["rms"]
                self.assertLess(20 * math.log10(ratio), -10)


if __name__ == "__main__":
    unittest.main()
