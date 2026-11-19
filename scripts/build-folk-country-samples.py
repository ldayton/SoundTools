# SPDX-License-Identifier: MIT
"""Pinned CC0 recordings -> compact browser FLAC bank. Requires numpy/scipy/soundfile.

Run with a Python environment containing those packages. Downloads are cached in
work/folk-country-assets; no system packages or personal paths are used.
"""
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from pathlib import Path
import hashlib
import io
import json
import re
import time
import urllib.request

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/folk-country-assets/recordings"
OUT = ROOT / "packages/music-practice/src/assets/backing-folk-country"
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "steel": ("facebookincubator/Meta-open-sound", "514c926efecdb3c7812bf00eedf8e5c8d61dd681", "systems/instruments/meta-steel-guitar/"),
    "brush": ("sfzinstruments/karoryfer.swirly-drums", "c40dafe0011cb2e54c0c220ff0fa308a11fc60f5", ""),
    "upright": ("sfzinstruments/karoryfer.meatbass", "ac9e859564bda286ab5ec672d00ff1aa2fef2895", ""),
    "twang": ("sfzinstruments/karoryfer.black-and-green-guitars", "b3b3249d37dc977a1a297bd2dc053e6d9b6b805c", ""),
}
audit = {}


def download(source, path):
    repo, revision, prefix = SOURCES[source]
    url = f"https://raw.githubusercontent.com/{repo}/{revision}/{prefix}{path}"
    cached = WORK / (hashlib.sha256(url.encode()).hexdigest() + Path(path).suffix)
    if not cached.exists():
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=45) as response:
                    data = response.read()
                cached.write_bytes(data)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)
    data = cached.read_bytes()
    audit[f"{source}/{path}"] = hashlib.sha256(data).hexdigest()
    return data


def maps(text):
    """Read inherited group + region fields from the selected simple SFZ maps."""
    group = {}
    for kind, body in re.findall(r"<(group|region)>(.*?)(?=<|\Z)", text, re.S):
        body = re.sub(r"//[^\n]*", "", body)
        fields = dict(re.findall(r"(\w+)=([^\s]+)", body))
        if kind == "group":
            group = fields
        elif "sample" in fields:
            yield {**group, **fields}


jobs = []
steel = download("steel", "meta-steel-guitar.sfz").decode()
tuning = [("LowE", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("HighE", 64)]
pcs = {n: i for i, n in enumerate(["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"])}
old = json.loads((OUT.parent / "backing-soul-folk/manifest.json").read_text())["samples"]
samples = {}
reused = []
for file in sorted(set(re.findall(r"sample=(\S+\.ogg)", steel))):
    match = re.search(r"String(\w+)_Vel0([12])_([A-G]s?)(\d)_", file)
    if not match:
        continue
    label, layer, note, octave = match.groups()
    string = next(i for i, (name, _) in enumerate(tuning) if name == label)
    pitch = (int(octave) + 1) * 12 + pcs[note]
    if not tuning[string][1] <= pitch <= tuning[string][1] + 12:
        continue
    layer = int(layer)
    entry = dict(part="guitar", instrument="acoustic-steel", note=pitch,
                 velocity=40 if layer == 1 else 72, velocityLow=1 if layer == 1 else 49,
                 velocityHigh=48 if layer == 1 else 127, rr=0, gain=1,
                 release=False, articulation="normal", string=string)
    key = f"acoustic-{string}-{pitch}-{layer}"
    if layer == 1 and string >= 2:
        samples[key] = {**old[f"folk-steel-{string}-{pitch}"], **entry}
        reused.append(file)
    else:
        jobs.append((key, "steel", "ogg/" + file, pitch, 24000, 6, entry))

# The source omits low-string B2; use the adjacent A#2 recording, explicitly
# pretransposed one semitone. All other steel samples are at native pitch.
for layer in [1, 2]:
    source = next(job for job in jobs if job[0] == f"acoustic-0-46-{layer}")
    jobs.append((f"acoustic-0-47-{layer}", source[1], source[2], 46, 24000, 6,
                 {**source[-1], "note": 47}))

# Upright recordings every minor third; pretranspose at most two semitones so
# the browser's working set can still be selected by the exercise's pitch classes.
upright = list(maps(download("upright", "Programs/pizz_basic_map.sfz").decode()))
for note in range(28, 56):
    for layer, velocity in [(1, 40), (2, 72)]:
        matching = [r for r in upright if int(r.get("lokey", 0)) <= note <= int(r.get("hikey", 127))
                    and int(r.get("lovel", 1)) <= velocity <= int(r.get("hivel", 127))
                    and int(r["pitch_keycenter"]) < 60]
        for rr, region in enumerate(matching[:2]):
            path = region["sample"].replace("\\", "/").removeprefix("../")
            entry = dict(part="bass", instrument="upright-bass", note=note,
                         velocity=velocity, velocityLow=1 if layer == 1 else 65,
                         velocityHigh=64 if layer == 1 else 127, rr=rr, gain=.35,
                         release=False, articulation="normal")
            jobs.append((f"upright-{note}-{layer}-{rr}", "upright", path,
                         int(region["pitch_keycenter"]), 16000, 3.6, entry))

# Separate recorded brush strikes, with real alternates and dynamic layers.
for note, folder, stem, suffix, layers in [
    (36, "marching_kick", "marching_kick", "reso", [(5, 28), (10, 60)]),
    (38, "snare_main", "snare_hit", "top", [(3, 28), (6, 58)]),
    (37, "snare_edge", "snare_edge", "top", [(2, 24), (5, 58)]),
]:
    for layer, velocity in layers:
        for rr in range(1, 5):
            path = f"Samples/{folder}/{stem}_vl{layer}_rr{rr}_{suffix}.wav"
            entry = dict(part="drums", instrument="brush-drums", note=note,
                         velocity=velocity, rr=rr-1, gain=.7 if note == 36 else 2.2 if note == 38 else 2.5, release=False,
                         articulation="normal")
            jobs.append((f"brush-{note}-{layer}-{rr}", "brush", path, note, 24000, 1.1, entry))

# Native bright electric-guitar attacks for occasional country replies. Read
# raw pinned files, avoiding the upstream checkout's WAV/text line-ending rules.
twang = list(maps(download("twang", "Programs/modules/maps_green/ord.sfz").decode()))
for note in range(55, 77):
    for velocity in [40, 64]:
        matching = [r for r in twang if int(r.get("lokey", 0)) <= note <= int(r.get("hikey", 127))
                    and int(r.get("lovel", 1)) <= velocity <= int(r.get("hivel", 127))]
        paths = sorted(set(r["sample"].replace("\\", "/").removeprefix("../") for r in matching))
        for rr, path in enumerate(paths[:2]):
            region = next(r for r in matching if r["sample"].replace("\\", "/").removeprefix("../") == path)
            entry = dict(part="guitar", instrument="electric-twang", note=note,
                         velocity=velocity, rr=rr, gain=3, release=False, articulation="normal")
            jobs.append((f"twang-{note}-{velocity}-{rr}", "twang", path,
                         int(region.get("pitch_keycenter", 60)), 24000, 2.2, entry))


def build(job):
    key, source, path, native, rate, seconds, entry = job
    data = download(source, path)
    x, sr = sf.read(io.BytesIO(data), always_2d=True, dtype="float32")
    ratio = Fraction(rate / (sr * 2 ** ((entry["note"] - native) / 12))).limit_denominator(4096)
    x = resample_poly(x, ratio.numerator, ratio.denominator)[:round(seconds * rate)]
    # Preserve recorded velocity differences; no per-note peak normalization.
    fade = min(len(x), round(rate * .04))
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    file = key + ".flac"
    sf.write(OUT / file, x, rate, subtype="PCM_16")
    return key, {**entry, "file": file}


legacy_hashes = json.loads((OUT.parent / "backing-soul-folk/source-sha256.json").read_text())


def verify_reused(file):
    original = download("steel", "ogg/" + file)
    if hashlib.sha256(original).hexdigest() != legacy_hashes[file]:
        raise ValueError("Reused acoustic source differs from the pinned recording: " + file)


with ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(verify_reused, reused))
    samples.update(pool.map(build, jobs))
assert len([s for s in samples.values() if s["instrument"] == "acoustic-steel"]) == 156
assert len([s for s in samples.values() if s["instrument"] == "upright-bass"]) == 112
assert len([s for s in samples.values() if s["instrument"] == "electric-twang"]) == 88
(OUT / "manifest.json").write_text(json.dumps({"samples": dict(sorted(samples.items()))}, separators=(",", ":")) + "\n")
(OUT / "source-sha256.json").write_text(json.dumps({"revisions": SOURCES, "files": dict(sorted(audit.items()))}, indent=2) + "\n")
(OUT / "NOTICE.txt").write_text("""Folk / Country recordings, CC0 1.0.
Meta Steel Guitar: Meta Platforms Inc., https://github.com/facebookincubator/Meta-open-sound
Swirly Drums (brushes), Meatbass (upright pizzicato), Black and Green Guitars (green twang):
Karoryfer Samples, https://shop.karoryfer.com/pages/free-samples
https://github.com/sfzinstruments/karoryfer.swirly-drums
https://github.com/sfzinstruments/karoryfer.meatbass
https://github.com/sfzinstruments/karoryfer.black-and-green-guitars
License: https://creativecommons.org/publicdomain/zero/1.0/
Pinned revisions and original recording hashes: source-sha256.json.
Acoustic soft D/G/B/high-E samples reuse backing-soul-folk files without duplication.
Other recordings trimmed, faded, resampled to 16 kHz bass / 24 kHz guitar and drums,
16-bit FLAC. Upright notes use the mapped native recording at most two semitones away.
The steel source omits low-string B2; that one pitch uses A#2 raised one semitone.
Recorded velocity layers and real alternate takes preserved; no invented alternates.
Original arrangements and preparation code: MIT, Copyright 2026 Lily Dayton.
""")
print(json.dumps({"entries": len(samples), "files": len(jobs), "bytes": sum(p.stat().st_size for p in OUT.glob("*.flac"))}))
