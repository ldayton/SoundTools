"""Research-only WASM variant. Reuses cached objects without editing the Praat checkout."""
import hashlib,json,pathlib,shutil,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2];praat=pathlib.Path(sys.argv[1]).resolve();cached=praat/'wasm/build-release';out=ROOT/'outputs/pitch-comparison/filtered-stream/build';out.mkdir(parents=True,exist_ok=True)
version=subprocess.check_output(['emcc','--version'],text=True).splitlines()[0]
manifest=json.loads((cached/'manifest.json').read_text());assert version==manifest['toolchain'],'Use the original pinned Emscripten toolchain'
src=(praat/'wasm/spectrogram.cpp').read_text();needle='if(flags&2)pitch=Sound_to_Pitch(sound.get(),.01,pitchFloor,pitchCeiling);';assert src.count(needle)==1
src=src.replace('static int nt,nf;','static int nt,nf;\nstatic int researchPitchMode=0;')
src=src.replace('extern "C" {','extern "C" {\nEMSCRIPTEN_KEEPALIVE int sg_set_pitch_mode(int mode){if(mode<0||mode>2)return -1;researchPitchMode=mode;return 0;}',1)
src=src.replace(needle,'''if(flags&2){
   if(researchPitchMode==0)pitch=Sound_to_Pitch(sound.get(),.01,pitchFloor,pitchCeiling);
   else if(researchPitchMode==1)pitch=Sound_to_Pitch_filteredAc(sound.get(),.01,pitchFloor,pitchCeiling,15,false,.03,.03,.45,.01,.35,.14);
   else pitch=Sound_to_Pitch_filteredAc(sound.get(),.01,pitchFloor,pitchCeiling,15,false,.03,.09,.50,.055,.35,.14);
  }''')
source=out/'research.cpp';source.write_text(src)
headers=[p for p in praat.rglob('*.h') if '.git' not in p.parts and not any(s.startswith('build') for s in p.parts)]
includes=[s for folder in sorted({str(p.parent) for p in headers}) for s in ['-I',folder]]
flags=['-O3','-flto','-sUSE_ZLIB=1','-DUNIX','-Dlinux','-DNO_GRAPHICS','-D_FILE_OFFSET_BITS=64','-DWORDS_BIGENDIAN=0','-DPA_LITTLE_ENDIAN','-fexceptions','-std=c++17']
obj=out/'research.o';subprocess.run(['em++',*flags,*includes,'-c',str(source),'-o',str(obj)],check=True)
names=(praat/'wasm/sources.txt').read_text().splitlines();objects=[cached/(name.replace('/','_')+'.o') for name in names];assert all(p.is_file() for p in objects)
subprocess.run(['em++',*[str(p) for p in objects],str(obj),*manifest['linkFlags'],'-o',str(out/'praat-spectrogram.js')],check=True)
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
evidence={'toolchain':version,'cachedBuild':manifest,'originalBridgeSha256':hashfile(praat/'wasm/spectrogram.cpp'),'researchBridgeSha256':hashfile(source),'objects':{p.name:hashfile(p) for p in objects},'assets':{name:hashfile(out/name) for name in ['praat-spectrogram.js','praat-spectrogram.wasm']},'modes':{'0':'unchanged raw AC','1':'filtered AC, raw path settings','2':'filtered AC, recommended path settings; same 50–1200 Hz range'}}
(out/'research-manifest.json').write_text(json.dumps(evidence,indent=2));print(out)
