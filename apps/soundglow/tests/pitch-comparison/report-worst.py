"""Package acoustic evidence with unchanged-level, sample-exact source excerpts."""
from pathlib import Path
import html,json
from scipy.io import wavfile
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/pitch-comparison/worst-cases'
audit=json.loads((OUT/'audit.json').read_text());review=json.loads((ROOT/'tests/pitch-comparison/worst-case-review.json').read_text());repeat=json.loads((OUT/'source-repeats.json').read_text())
text='''<!doctype html><meta charset="utf-8"><title>Worst-case pitch audit</title><style>body{background:#101620;color:#e7edf5;font:17px system-ui;margin:24px;max-width:1250px}a{color:#ffae7b}p{line-height:1.5}img{width:100%;background:white}article{margin:48px 0}small{color:#b8c8da}</style><h1>The hybrid rejects both bad estimates and useful speech</h1><p>Acoustic inspection of the eight worst noisy-speech clips. Red points are hybrid rejections; green is whole-clip filtered autocorrelation; white is raw cross-correlation. Reference methods share Praat code and have more context than streaming: their agreement is corroboration, not ground truth. These are acoustic judgements, not a listening/transcription assessment.</p>'''
text+=f'<p><b>Corpus limitation:</b> {sum(r["exactRepeat"] for r in repeat)} of 100 original noisy-speech source files contain exact repeated audio at offsets of 0.25–2 seconds. The repeats already exist in the source files; these are not 400 seconds of distinct conversation.</p>'
for e in review['examples']:
 c=next(c for c in audit['clips'] if Path(c['file']).name.startswith(e['clip']));source=ROOT/c['file'];sr,x=wavfile.read(source);start,end=e['context'];excerpt=x[round(start*sr):round(end*sr)];wavfile.write(OUT/(e['clip']+'-excerpt.wav'),sr,excerpt)
 text+=f'<article id="case-{e["clip"]}"><h2>{e["clip"]}: {html.escape(e["judgement"])}</h2><p>{html.escape(e["detail"])}</p><p>Unchanged-level excerpt, original time {start:.2f}–{end:.2f} s: <audio controls preload="metadata" src="{e["clip"]}-excerpt.wav"></audio></p><small>Source {html.escape(c["file"])}; {c["baseline"]} → {c["retained"]} raw estimates. SHA-256 {c["sha256"]}</small><img loading="lazy" src="{e["clip"]}-focus.png" alt="Acoustic evidence panels for case {e["clip"]}"><details><summary>Full recording and overview</summary><audio controls preload="none" src="/{html.escape(c["file"])}"></audio><img loading="lazy" src="{e["clip"]}-overview.png" alt="Full four-second spectrogram and waveform"></details></article>'
(OUT/'report.html').write_text(text)
print(OUT/'report.html')
