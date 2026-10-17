#!/usr/bin/env python3
"""Explicit, offline fixture recapture using native Praat, never the WASM adapter."""
import argparse, base64, gzip, hashlib, json, math, pathlib, re, struct, subprocess, tempfile
parser=argparse.ArgumentParser();parser.add_argument('--praat',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];source=root/'dist/audio/speech-english.wav';wave=source.read_bytes();at=12
while at+8<=len(wave):
 kind=wave[at:at+4];size=struct.unpack_from('<I',wave,at+4)[0]
 if kind==b'fmt ':rate=struct.unpack_from('<I',wave,at+12)[0]
 if kind==b'data':data=wave[at+8:at+8+size]
 at+=8+size+(size%2)
values=struct.unpack('<'+'h'*(len(data)//2),data)
def speech(sample_rate):
 result=[]
 for i in range(round(sample_rate*.2)):
  x=(2+i/sample_rate)*rate;left=int(x);fraction=x-left
  result.append(((1-fraction)*values[left]+fraction*values[left+1])/32768)
 return result

def synthetic(sample_rate,noise_only=False):
 seed=42;filters=[]
 for f,bw in [(500,80),(1500,100),(2500,120),(3500,150)]:
  r=math.exp(-math.pi*bw/sample_rate);filters.append([2*r*math.cos(2*math.pi*f/sample_rate),r*r,0,0])
 result=[]
 for i in range(round(sample_rate*.2)):
  seed=(1664525*seed+1013904223)&0xffffffff;x=seed/4294967296-.5
  if not noise_only:
   for state in filters:
    y=x+state[0]*state[2]-state[1]*state[3];state[3]=state[2];state[2]=y;x=y
  result.append(x)
 maximum=max(map(abs,result));return [x*.2/maximum for x in result]

def wav(samples,sample_rate):
 payload=struct.pack('<'+'f'*len(samples),*samples)
 return b'RIFF'+struct.pack('<I',36+len(payload))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,3,1,sample_rate,sample_rate*4,4,32)+b'data'+struct.pack('<I',len(payload))+payload,payload

cases=[]
with tempfile.TemporaryDirectory(prefix='soundglow-native-lpc-') as work:
 work=pathlib.Path(work)
 for index,(kind,sample_rate,ceiling,window,order,emphasis) in enumerate([
  ('speech',24000,5500,.025,10,0),('speech',44100,5500,.025,10,50),('speech',48000,6000,.04,14,100),
  ('vowel',24000,5000,.015,10,0),('vowel',44100,5500,.025,10,50),('noise',48000,6000,.025,10,50)]):
  samples=speech(sample_rate) if kind=='speech' else synthetic(sample_rate,kind=='noise')
  wave_bytes,pcm=wav(samples,sample_rate);input_file=work/'input.wav';input_file.write_bytes(wave_bytes)
  lpc=work/'result.LPC';spectrum=work/'result.Spectrum';script=work/'capture.praat';resolution=ceiling/512
  script.write_text(f'''Read from file: "{input_file}"
Resample: {2*ceiling}, 50
To LPC (burg): {order}, {window}, 1, {emphasis}
Save as text file: "{lpc}"
To Spectrum (slice): 0.1, {resolution}, 0, {ceiling+1}
Save as text file: "{spectrum}"
''')
  subprocess.run([args.praat,'--run',str(script)],check=True,capture_output=True)
  text=lpc.read_text();centre_time=float(re.search(r'x1 = ([^\s]+)',text)[1]);coefficients=[float(x) for x in re.findall(r'a \[\d+\] = ([^\s]+)',text)];gain=float(re.search(r'gain = ([^\s]+)',text)[1])
  text=spectrum.read_text();rows={int(k):[] for k in [1,2]}
  for channel,value in re.findall(r'z \[(\d+)\] \[\d+\] = ([^\s]+)',text):rows[int(channel)].append(float(value))
  assert len(rows[1])==513 and len(coefficients)==order
  frame_samples=round(2*window*2*ceiling)
  # Native LPC gain is summed prediction error; the API uses mean error.
  # Native Spectrum includes 1/(sampleRate*df); undo that documented scaling.
  power=[(re*re+im*im)*(2*ceiling)*resolution/frame_samples for re,im in zip(rows[1],rows[2])]
  cases.append(dict(id=f'{kind}-{sample_rate}-{order}-{emphasis}',sampleRate=sample_rate,options=dict(ceiling=ceiling,windowSeconds=window,order=order,bins=513,preEmphasisHz=emphasis),pcmBase64=base64.b64encode(pcm).decode(),pcmSha256=hashlib.sha256(pcm).hexdigest(),coefficients=[-x for x in coefficients],gain=gain/frame_samples,power=power,frameSamples=frame_samples,centreTime=centre_time))
version=subprocess.check_output([args.praat,'--version'],text=True).strip()
result=dict(schemaVersion=1,nativeVersion=version,nativeSha256=hashlib.sha256(pathlib.Path(args.praat).read_bytes()).hexdigest(),sourceAudioSha256=hashlib.sha256(wave).hexdigest(),coefficientConvention='positive prediction; negation of native LPC denominator coefficients',powerConvention='native Spectrum magnitude squared * analysisRate * df / frameSamples',cases=cases)
output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
with gzip.GzipFile(filename=str(output),mode='wb',mtime=0) as f:f.write(json.dumps(result,separators=(',',':')).encode())
print(hashlib.sha256(output.read_bytes()).hexdigest(),output)
