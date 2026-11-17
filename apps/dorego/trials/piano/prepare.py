"""Build a local comparison bank; never modify the shipped samples."""
import array
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import sys

APP = pathlib.Path(__file__).resolve().parents[2]
SOURCE = APP / "public/samples/bitklavier-web-v1"
OUTPUT = APP / "work/piano-trial"
NOTES = {48: "C3", 60: "C4", 69: "A4", 75: "D♯5", 84: "C6", 90: "F♯6"}
PROFILES = {
    "stereo": "Original stereo",
    "sum": "Combined mono",
    "left": "Left-channel mono",
    "right": "Right-channel mono",
}


def pcm(path):
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-"],
        capture_output=True, check=True,
    )
    samples = array.array("f", result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def metadata(path):
    header = path.read_bytes()[:42]
    assert header[:4] == b"fLaC"
    value = int.from_bytes(header[18:26], "big")
    samples = pcm(path)
    return {
        "sampleRate": value >> 44,
        "channels": ((value >> 41) & 7) + 1,
        "bits": ((value >> 36) & 31) + 1,
        "frames": value & ((1 << 36) - 1),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rms": math.sqrt(sum(x * x for x in samples) / len(samples)),
        "peak": max(abs(x) for x in samples),
    }


def prepare():
    if not shutil.which("ffmpeg"):
        raise SystemExit("Install ffmpeg first (brew install ffmpeg).")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    clips = []
    for midi, label in NOTES.items():
        for layer in (11, 12):
            source = SOURCE / f"{midi}-v{layer}-2s.flac"
            original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            variants = {}
            for profile, name in PROFILES.items():
                destination = source
                if profile != "stereo":
                    destination = OUTPUT / f"{midi}-v{layer}-{profile}.flac"
                    channel = {"left": "c0", "right": "c1", "sum": "0.5*c0+0.5*c1"}[profile]
                    audio_filter = f"pan=mono|c0={channel}"
                    if profile == "sum":
                        audio_filter += ",aresample=osf=s16:dither_method=triangular"
                    subprocess.run([
                        "ffmpeg", "-v", "error", "-y", "-i", str(source),
                        "-af", audio_filter, "-c:a", "flac", "-sample_fmt", "s16",
                        str(destination),
                    ], check=True)
                variants[profile] = {
                    "name": name,
                    "url": f"/audio/{midi}-v{layer}-{profile}.flac",
                    **metadata(destination),
                }
            assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
            clips.append({"midi": midi, "label": label, "layer": layer, "variants": variants})
    manifest = {"recipe": 1, "clips": clips}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUTPUT / "NOTICE.txt").write_text(
        (SOURCE / "NOTICE.txt").read_text()
        + "\nLocal trial: left/right channel extraction and averaged mono with final 16-bit TPDF dither. "
        + "No EQ, denoising, resampling or level changes. Original stereo files are unchanged.\n"
    )
    print(f"Prepared {len(clips)} recordings × 4 comparisons in {OUTPUT}")


if __name__ == "__main__":
    prepare()
