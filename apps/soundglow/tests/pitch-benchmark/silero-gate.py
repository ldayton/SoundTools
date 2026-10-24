"""Bounded causal Silero trial. Model state/context follow upstream ONNX wrapper.
No endpoint segmentation, long sentence buffering, pitch changes or threshold sweep.
"""
import argparse,hashlib,json,time
from pathlib import Path
import numpy as np
import onnxruntime as ort
import soxr
ROOT=Path(__file__).resolve().parents[2]
class Silero:
 def __init__(self,path):
  opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
  self.session=ort.InferenceSession(str(path),opts,providers=['CPUExecutionProvider']);self.reset()
 def reset(self):
  self.state=np.zeros((2,1,128),np.float32);self.context=np.zeros((1,64),np.float32)
 def process(self,block):
  block=np.asarray(block,dtype=np.float32)
  if block.shape!=(512,) or not np.all(np.isfinite(block)):raise ValueError('Expected512finite samples')
  x=np.concatenate((self.context,block[None]),axis=1);out,state=self.session.run(None,dict(input=x,state=self.state,sr=np.array(16000,np.int64)));self.state=state;self.context=block[None,-64:].copy();return float(out[0,0])
def run(x,rate,model,packetSamples=None):
 if rate!=48000:raise ValueError('Trial inputs must be48kHz')
 model.reset();rs=soxr.ResampleStream(rate,16000,1,dtype='float32',quality='LQ');buffer=np.zeros(0,np.float32);count=0;flags=[];calls=[];padded=np.pad(x,(rate//2,rate//2));packetSamples=packetSamples or rate//10
 for first in range(0,len(padded),packetSamples):
  chunk=padded[first:first+packetSamples];available=(first+len(chunk))/rate-.5
  start=time.perf_counter();y=rs.resample_chunk(chunk);buffer=np.concatenate((buffer,y))
  while len(buffer)>=512:
   block=buffer[:512];buffer=buffer[512:];prob=model.process(block);centre=(count*512+256)/16000-.5;flags.append(dict(time=centre,start=count*512/16000-.5,end=(count+1)*512/16000-.5,availableAt=available,probability=prob));count+=1
  calls.append((time.perf_counter()-start)*1000)
 # No flush is used for original audio: half-second trailing context already commits it.
 return flags,calls
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('output');a=p.parse_args();folder=Path(a.output);folder.mkdir(parents=True,exist_ok=True);source=ROOT/'outputs/pitch-benchmark/gate-trial';pin=json.loads((source/'source.json').read_text());modelpath=source/'silero.onnx';assert hashlib.sha256(modelpath.read_bytes()).hexdigest()==pin['files']['silero.onnx']['sha256'];model=Silero(modelpath);manifest=json.loads(Path(a.manifest).read_text())
 for c in manifest['clips']:
  b=(ROOT/c['pcm']).read_bytes();assert hashlib.sha256(b).hexdigest()==c['pcmSha256'];x=np.frombuffer(b,dtype='<f4');flags,calls=run(x,c['sampleRate'],model);(folder/(c['id']+'.json')).write_text(json.dumps(dict(id=c['id'],pcmSha256=c['pcmSha256'],modelSha256=pin['files']['silero.onnx']['sha256'],p95ProcessingMs=float(np.percentile(calls,95)),flags=flags)));print(c['id'],flush=True)
