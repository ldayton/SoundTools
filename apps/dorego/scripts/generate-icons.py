"""Compatibility entry point; both apps share one SVG-based icon generator."""
from pathlib import Path
import subprocess

subprocess.run(['node', str(Path(__file__).resolve().parents[3] / 'scripts/generate-branding.cjs')], check=True)
