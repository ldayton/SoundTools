#!/usr/bin/env python3
"""Add the missing CC0 Meta steel dynamics/frets without duplicating our bank.

Requires ffmpeg and flac. Original recordings are pinned and cached under work/. Run from
any directory; generation is an explicit authoring step, never a CI download.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "packages/music-practice/src/assets/songalong-guitar"
CACHE = ROOT / "work/songalong-guitar-source"
REPO = "facebookincubator/Meta-open-sound"
REVISION = "514c926efecdb3c7812bf00eedf8e5c8d61dd681"
PREFIX = "systems/instruments/meta-steel-guitar/"
TUNING = {name: (index, pitch) for index, (name, pitch) in enumerate(
    [("LowE", 40), ("A", 45), ("D", 50), ("G", 55), ("B", 59), ("HighE", 64)])}
PCS = {name: i for i, name in enumerate(["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"])}
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)


def download(path):
    url = f"https://raw.githubusercontent.com/{REPO}/{REVISION}/{PREFIX}{path}"
    cached = CACHE / (hashlib.sha256(url.encode()).hexdigest() + Path(path).suffix)
    if not cached.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read()
        cached.write_bytes(data)
    return cached


sfz = download("meta-steel-guitar.sfz")
legacy = json.loads((OUT.parent / "backing-folk-country/manifest.json").read_text())["samples"]
existing = {(s["string"], s["note"], s["velocity"]): s for s in legacy.values()
            if s.get("instrument") == "acoustic-steel"}
jobs = []
for file in sorted(set(re.findall(r"sample=(\S+\.ogg)", sfz.read_text()))):
    match = re.search(r"String(\w+)_Vel0([123])_([A-G]s?)(\d)_", file)
    if not match:
        continue
    name, layer, pc, octave = match.groups()
    string, root = TUNING[name]
    pitch = (int(octave) + 1) * 12 + PCS[pc]
    layer = {"1": 40, "2": 72, "3": 104}[layer]
    if 0 <= pitch - root <= 20 and (string, pitch, layer) not in existing:
        jobs.append(dict(string=string, pitch=pitch, layer=layer, sourcePitch=pitch, source="ogg/" + file))

# This is the only missing source pitch. Keep our existing, documented adjacent
# sample adaptation rather than silently switching its physical string.
adjacent = next(j for j in jobs if (j["string"], j["pitch"], j["layer"]) == (0, 46, 104))
jobs.append({**adjacent, "pitch": 47})


def build(job):
    cached = download(job["source"])
    file = f"acoustic-{job['string']}-{job['pitch']}-{job['layer']}.flac"
    filters = []
    if job["pitch"] != job["sourcePitch"]:
        ratio = 2 ** ((job["pitch"] - job["sourcePitch"]) / 12)
        filters.extend(["aresample=48000", f"asetrate={48000 * ratio:.8f}"])
    # Match the existing compact bank: six-second natural one-shots, with a
    # short tail fade, recorded dynamics intact and no invented alternate takes.
    filters.extend(["aresample=24000", "atrim=duration=6", "areverse", "afade=t=in:d=0.04", "areverse"])
    wave = CACHE / (file + ".wav")
    try:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(cached),
                        "-af", ",".join(filters), "-c:a", "pcm_s16le", str(wave)], check=True)
        # Match the existing libFLAC bank. FFmpeg's default block framing at
        # 24 kHz can be rejected by WebKit even when Chromium decodes it.
        subprocess.run(["flac", "--silent", "--force", "--blocksize=4096",
                        "--output-name=" + str(OUT / file), str(wave)], check=True)
    finally:
        wave.unlink(missing_ok=True)
    return ({k: job[k] for k in ["string", "pitch", "layer"]} | {"file": file},
            {"file": file, "source": job["source"], "sourcePitch": job["sourcePitch"],
             "sourceSha256": hashlib.sha256(cached.read_bytes()).hexdigest(),
             "sha256": hashlib.sha256((OUT / file).read_bytes()).hexdigest()})


with ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(build, jobs))
samples = sorted([sample for sample, _ in results], key=lambda s: (s["string"], s["pitch"], s["layer"]))
assert len(samples) == 222
assert len(existing) + len(samples) == 378
(OUT / "manifest.json").write_text(json.dumps({"license": "CC0-1.0", "samples": samples}, indent=2) + "\n")
(OUT / "source-sha256.json").write_text(json.dumps({"repository": REPO, "revision": REVISION,
    "prefix": PREFIX, "sfzSha256": hashlib.sha256(sfz.read_bytes()).hexdigest(),
    "files": sorted([audit for _, audit in results], key=lambda s: s["file"])}, indent=2) + "\n")
(OUT / "NOTICE.txt").write_text("""Meta Steel Guitar — Meta Platforms Inc. CC0 1.0.
https://github.com/facebookincubator/Meta-open-sound
https://creativecommons.org/publicdomain/zero/1.0/

Additional SongAlong recordings: hard velocity at frets 0–12, all three recorded
velocities at frets 13–20. Existing soft/medium recordings remain in the shared
backing-folk-country and backing-soul-folk banks without duplication.
24 kHz, 16-bit FLAC, natural decays capped at six seconds with a 40 ms tail fade.
Reference libFLAC encoding with 4096-sample blocks for WebKit compatibility.
No per-note normalization, synthetic sustain loops or invented round robins.
The missing low-string B2 hard recording uses A#2 raised one semitone, matching
the documented soft/medium adaptation. All other new samples are native pitch.
Original source and output hashes, including the pinned revision, accompany this bank.
Preparation code: MIT, Copyright 2026 Lily Dayton.
""")
print(json.dumps({"additionalSamples": len(samples), "bytes": sum((OUT / s["file"]).stat().st_size for s in samples)}))
