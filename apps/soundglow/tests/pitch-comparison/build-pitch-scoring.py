"""Research-only scoring variants around the exact currently shipped Praat source."""
import pathlib,hashlib,json,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve();repo=pathlib.Path(__file__).resolve().parents[2];out=repo/'outputs/pitch-comparison/pitch-scoring/build';out.mkdir(parents=True,exist_ok=True);cached=root/'wasm/build-release'
m=json.loads((cached/'manifest.json').read_text());version=subprocess.check_output(['emcc','--version'],text=True).splitlines()[0];assert version==m['toolchain']
src=(root/'wasm/spectrogram.cpp').read_text();needle='if(flags&2){if(pitchMethod==1)pitch=Sound_to_Pitch_filteredAc(sound.get(),.01,pitchFloor,pitchCeiling,15,false,.03,.03,.45,.01,.35,.14);else pitch=Sound_to_Pitch(sound.get(),.01,pitchFloor,pitchCeiling);}'
assert src.count(needle)==1
src=src.replace('static int pitchMethod=0;','static int pitchMethod=0;\nstatic int scoringMode=0;')
src=src.replace('extern "C" {','extern "C" {\nEMSCRIPTEN_KEEPALIVE int sg_scoring_mode(int mode){if(mode<0||mode>2)return -1;scoringMode=mode;return 0;}',1)
src=src.replace(needle,'''if(flags&2){if(pitchMethod==1)pitch=Sound_to_Pitch_filteredAc(sound.get(),.01,pitchFloor,scoringMode==2?std::min(pitchCeiling,800.0):pitchCeiling,15,false,.03,.03,.45,scoringMode==0?.01:.055,.35,.14);else pitch=Sound_to_Pitch(sound.get(),.01,pitchFloor,pitchCeiling);}''')
source=out/'research.cpp';source.write_text(src)
headers=[p for p in root.rglob('*.h')if '.git'not in p.parts and not any(s.startswith('build')for s in p.parts)];includes=[s for folder in sorted({str(p.parent)for p in headers})for s in ['-I',folder]]
flags=['-O3','-flto','-sUSE_ZLIB=1','-DUNIX','-Dlinux','-DNO_GRAPHICS','-D_FILE_OFFSET_BITS=64','-DWORDS_BIGENDIAN=0','-DPA_LITTLE_ENDIAN','-fexceptions','-std=c++17']
obj=out/'research.o';subprocess.run(['em++',*flags,*includes,'-c',str(source),'-o',str(obj)],check=True)
objects=[cached/(name.replace('/','_')+'.o')for name in(root/'wasm/sources.txt').read_text().splitlines()];assert all(p.is_file()for p in objects)
subprocess.run(['em++',*[str(p)for p in objects],str(obj),*m['linkFlags'],'-o',str(out/'praat-spectrogram.js')],check=True)
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
evidence={'toolchain':version,'cachedBuild':m,'bridgeSha256':h(source),'objects':{p.name:h(p)for p in objects},'assets':{name:h(out/name)for name in ['praat-spectrogram.js','praat-spectrogram.wasm']},'modes':{'0':'Current filtered parameters: octave cost .01, top 1200','1':'Octave cost .055 only; top 1200','2':'Octave cost .055, top 800; same remaining thresholds'}}
(out/'research-manifest.json').write_text(json.dumps(evidence,indent=2));print(out)
