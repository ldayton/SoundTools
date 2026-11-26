"""Isolated pretrained inference, never imported by SongAlong.

Original evaluation adapters based on the documented pinned architectures.
ArGNN graph equations/decoder architecture: Pedro Ramoneda (2022), MIT;
https://github.com/PRamoneda/Automatic-Piano-Fingering .
Lumikey feature encoding/architecture: https://github.com/lumikey/piano-fingering-model
(js/package.json declares MIT; root/weight licensing needs clarification).
No upstream Python modules, datasets, training scripts or unrestricted pickle
loaders execute. Only trusted installed PyTorch operators run.
"""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F

torch.set_num_threads(1)
torch.set_num_interop_threads(1)


def load_checkpoint(path):
    unsafe = torch.serialization.get_unsafe_globals_in_checkpoint(path)
    if set(unsafe) - {"torch.nn.modules.loss.NLLLoss"}:
        raise ValueError(f"Unexpected checkpoint globals: {unsafe}")
    # The old research checkpoint stores this built-in loss alongside tensors.
    with torch.serialization.safe_globals([nn.NLLLoss]):
        return torch.load(path, map_location="cpu", weights_only=True)


def black(midi):
    return float(midi % 12 in (1, 3, 6, 8, 10)) if midi >= 0 else -1.0


def tokens(note, previous, future):
    out = torch.zeros(26, 5)
    out[:, 4] = -1
    for i, (midi, age) in enumerate(previous):
        out[i] = torch.tensor([
            (midi - note['midi']) / 87 if midi >= 0 else -1,
            min(10, max(0, age)) / 10 if math.isfinite(age) else 1,
            black(midi), 0, -1])
    out[5] = torch.tensor([((note['midi'] - 21) % 12) / 11, 0, black(note['midi']), .5, -1])
    out[6:] = -1
    for i, n in enumerate(future[:20], 6):
        out[i] = torch.tensor([(n['midi'] - note['midi']) / 87,
                               min(10, (n['time'] - note['time']) / 1000) / 10,
                               black(n['midi']), 1,
                               (n['finger'] - 1) / 4 if 'finger' in n else -1])
    return out


class Transformer:
    def __init__(self, path):
        ck = load_checkpoint(path)
        self.s = ck['model_state']
        layer = nn.TransformerEncoderLayer(ck['d_model'], ck['nhead'], ck['dim_feedforward'], dropout=0, batch_first=True)
        self.encoder = nn.TransformerEncoder(layer, ck['num_layers'], enable_nested_tensor=False)
        self.encoder.load_state_dict({k.removeprefix('transformer.'): v for k,v in self.s.items() if k.startswith('transformer.')}, strict=True)
        self.encoder.eval()

    def logits(self, x):
        s = self.s
        h = F.linear(x, s['input_proj.weight'], s['input_proj.bias']) + s['pos_encoder.pe'][:, :26]
        return F.linear(self.encoder(h)[:, 5], s['output_head.weight'], s['output_head.bias'])

    def predict(self, notes, width):
        # (log probability, digits, last MIDI and release time for each finger)
        beam = [(0., [], [(-1, float('inf')) for _ in range(5)])]
        for i, n in enumerate(notes):
            x = torch.stack([tokens(n, p, notes[i+1:i+21]) for _,_,p in beam])
            logp = self.logits(x).log_softmax(-1)
            next_beam = []
            for j,(score, digits, previous) in enumerate(beam):
                choices = [n['finger']-1] if 'finger' in n else range(5)
                for digit in choices:
                    p = list(previous)
                    p[digit] = (n['midi'], -n['duration']/1000)
                    dt = (notes[i+1]['time']-n['time'])/1000 if i+1<len(notes) else 0
                    p = [(m, age+dt) for m, age in p]
                    next_beam.append((score+logp[j,digit].item(), digits+[digit+1], p))
            beam = sorted(next_beam, key=lambda b:(-b[0], b[1]))[:width]
        return [dict(fingers=d,logProbability=s) for s,d,_ in beam]

    def score_sequences(self, notes, sequences):
        """Likelihood of supplied paths with original future context only.

        Proposed digits update past-finger memory, never the future anchor tokens.
        This scores a classic path fairly even when it was outside the beam.
        """
        for fingers in sequences:
            if len(fingers) != len(notes) or any(type(f) is not int or not 1 <= f <= 5 for f in fingers):
                raise ValueError("Invalid supplied sequence")
            if any('finger' in n and n['finger'] != f for n, f in zip(notes, fingers)):
                raise ValueError("Supplied sequence changed source anchor")
        if not sequences:
            return []
        previous = [[(-1, float('inf')) for _ in range(5)] for _ in sequences]
        totals = [0. for _ in sequences]
        for i, n in enumerate(notes):
            x = torch.stack([tokens(n, p, notes[i+1:i+21]) for p in previous])
            logp = self.logits(x).log_softmax(-1)
            dt = (notes[i+1]['time']-n['time'])/1000 if i+1<len(notes) else 0
            for j, fingers in enumerate(sequences):
                digit = fingers[i]-1
                totals[j] += logp[j, digit].item()
                previous[j][digit] = (n['midi'], -n['duration']/1000)
                previous[j] = [(m, age+dt) for m, age in previous[j]]
        return totals


def graph(notes):
    # Four upstream edge types: same onset, forward-next, identity, reverse-next.
    n=len(notes)
    a=torch.zeros(4,n,n)
    a[2]=torch.eye(n)
    groups={}
    for i,note in enumerate(notes):groups.setdefault(note['time'],[]).append(i)
    times=sorted(groups)
    for k,t in enumerate(times):
        for i in groups[t]:
            for j in groups[t]:
                if i!=j:a[0,i,j]=1
            if k+1<len(times):
                for j in groups[times[k+1]]:a[1,i,j]=1;a[3,j,i]=1
    return a


class Autoregressive:
    def __init__(self, path, kind):
        self.s=load_checkpoint(path)['model_state_dict']
        self.kind=kind
        if kind=='arlstm':
            self.encoder=nn.LSTM(1,32,num_layers=3,batch_first=True,bidirectional=True)
            self.encoder.load_state_dict({k.removeprefix('encoder.rnn1.'):v for k,v in self.s.items() if k.startswith('encoder.rnn1.')},strict=True)
            self.encoder.eval()
        self.decoder=nn.LSTM(128,64,batch_first=True)
        self.decoder.load_state_dict({k.removeprefix('decoder.ar_lstm.'):v for k,v in self.s.items() if k.startswith('decoder.ar_lstm.')},strict=True)
        self.decoder.eval()

    def encode(self, notes):
        s=self.s
        pitches=torch.tensor([n['midi']/127 for n in notes],dtype=torch.float32).view(1,-1,1)
        if self.kind=='arlstm':return self.encoder(pitches)[0]
        x=F.embedding((pitches*127).int().squeeze(-1),s['embedding.emb.weight'])
        a=graph(notes)
        for k in range(1,4):
            p=f'encoder.gnn{k}.'
            activation=a.transpose(1,2)@x[0]+s[p+'ba'][:,None,:]
            joined=activation@s[p+'wz_wr_wh']+s[p+'bw']
            wz,wr,wh=joined.sum(0).chunk(3,dim=-1)
            uz,ur=(x@s[p+'uz_ur']).chunk(2,dim=-1)
            z=(wz+uz).sigmoid();r=(wr+ur).sigmoid()
            x=(1-z)*x+z*(wh+(r*x)@s[p+'uh']).tanh()
        return x

    def predict(self, notes, width):
        x=self.encode(notes);s=self.s
        beams=[(0.,[])]
        hidden=(torch.zeros(1,1,64),torch.zeros(1,1,64))
        prev=torch.zeros(1,1,64)
        for i,n in enumerate(notes):
            out,following=self.decoder(torch.cat((x[:,i:i+1].expand(len(beams),-1,-1),prev),dim=-1),hidden)
            logp=F.linear(out[:,0],s['decoder.FC.weight'],s['decoder.FC.bias']).log_softmax(-1)
            choices=[n['finger']-1] if 'finger' in n else range(5)
            paths=sorted(((score+logp[j,f].item(),ds+[f+1],j,f) for j,(score,ds) in enumerate(beams) for f in choices),key=lambda v:(-v[0],v[1]))[:width]
            parents=torch.tensor([p[2] for p in paths]);fingers=torch.tensor([p[3] for p in paths])
            hidden=(following[0][:,parents],following[1][:,parents])
            prev=F.embedding(fingers,s['decoder.class_embedding.weight']).unsqueeze(1)
            beams=[(p[0],p[1]) for p in paths]
        return [dict(fingers=d,logProbability=s) for s,d in beams]


def main():
    ap=argparse.ArgumentParser();ap.add_argument('requests');ap.add_argument('artifacts');ap.add_argument('output');ap.add_argument('--model',choices=['lumikey','argnn','arlstm'],required=True);ap.add_argument('--pitch-shift',type=int,default=0);ap.add_argument('--limit',type=int);args=ap.parse_args()
    requests=json.loads(Path(args.requests).read_text())
    if args.limit:requests=requests[:args.limit]
    root=Path(args.artifacts)
    models={}
    for h in ('left','right'):
        if args.model=='lumikey':models[h]=Transformer(root/f'lumikey/checkpoints/fingering_transformer_{h}.pt')
        else:models[h]=Autoregressive(root/'argnn/models'/f'{h}_{"ArGNN" if args.model=="argnn" else "ArLSTM"}.pth',args.model)
    result={'model':args.model,'pitchShift':args.pitch_shift,'torch':torch.__version__,'beamWidth':6,'cases':[]}
    started=time.perf_counter()
    with torch.inference_mode():
        for index,req in enumerate(requests):
            row={'id':req['id'],'hands':{}}
            for h in ('left','right'):
                ns=[{**n,'midi':n['midi']+args.pitch_shift} for n in req['contacts'] if n['hand']==h]
                if not ns:continue
                begin=time.perf_counter();greedy=models[h].predict(ns,1);beam=models[h].predict(ns,6)
                row['hands'][h]={'contacts':[n['id'] for n in ns], 'candidates':beam,'greedy':greedy[0], 'elapsedMs':(time.perf_counter()-begin)*1000}
            result['cases'].append(row)
            if index%20==0:print(args.model,index+1,len(requests),round(time.perf_counter()-started,2),'seconds',flush=True)
    result['elapsedMs']=(time.perf_counter()-started)*1000
    Path(args.output).write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(args.model,'complete',round(result['elapsedMs']/1000,2),'seconds')


if __name__=='__main__':main()
