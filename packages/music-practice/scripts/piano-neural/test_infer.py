"""Manual adapter checks using installed PyTorch; no network or upstream code."""
import unittest
from pathlib import Path

import torch
from torch.nn import functional as F
from infer import tokens, graph, Autoregressive, Transformer


class AdapterTests(unittest.TestCase):
    def test_independent_feature_values_and_held_time_clipping(self):
        n={'midi':60,'time':1000,'duration':500}
        previous=[(-1,float('inf')),(62,-.5),(61,2),(72,20),(59,0)]
        future=[{'midi':64,'time':1500,'duration':250,'finger':3}]
        t=tokens(n,previous,future)
        self.assertEqual(tuple(t.shape),(26,5))
        self.assertEqual(t[0].tolist(),[-1,1,-1,0,-1])
        self.assertAlmostEqual(t[1,0].item(),2/87)
        self.assertEqual(t[1,1].item(),0) # faithful upstream encoding loses remaining hold
        self.assertEqual(t[2,2].item(),1)
        self.assertEqual(t[3,1].item(),1)
        self.assertAlmostEqual(t[5,0].item(),3/11)
        self.assertEqual(t[5,3].item(),.5)
        self.assertAlmostEqual(t[6,0].item(),4/87)
        self.assertAlmostEqual(t[6,1].item(),.05)
        self.assertEqual(t[6,4].item(),.5)
        self.assertTrue(torch.equal(t[7:],torch.full((19,5),-1.)))

    def test_graph_chord_and_next_onset_directions(self):
        a=graph([{'time':0},{'time':0},{'time':1},{'time':3}])
        self.assertEqual(a[0].nonzero().tolist(),[[0,1],[1,0]])
        self.assertEqual(a[1].nonzero().tolist(),[[0,2],[1,2],[2,3]])
        self.assertEqual(a[3].nonzero().tolist(),[[2,0],[2,1],[3,2]])
        self.assertTrue(torch.equal(a[2],torch.eye(4)))
        self.assertEqual(graph([{'time':0}]).sum().item(),1)

    def test_two_attack_beam_agrees_with_exhaustive_paths(self):
        # Real published tensors, independently enumerate all 25 paths. No labels.
        root=Path('work/neural-piano/upstream/argnn/models')
        ns=[{'midi':60,'time':0,'duration':250},{'midi':64,'time':250,'duration':250}]
        with torch.inference_mode():
            for kind,suffix in [('argnn','ArGNN'),('arlstm','ArLSTM')]:
                model=Autoregressive(root/f'right_{suffix}.pth',kind)
                x=model.encode(ns);s=model.s
                first,state=model.decoder(torch.cat((x[:,:1],torch.zeros(1,1,64)),dim=-1))
                lp1=F.linear(first[:,0],s['decoder.FC.weight'],s['decoder.FC.bias']).log_softmax(-1)[0]
                paths=[]
                for a in range(5):
                    embedding=s['decoder.class_embedding.weight'][a].view(1,1,64)
                    out,_=model.decoder(torch.cat((x[:,1:2],embedding),dim=-1),state)
                    lp2=F.linear(out[:,0],s['decoder.FC.weight'],s['decoder.FC.bias']).log_softmax(-1)[0]
                    for b in range(5):paths.append((lp1[a].item()+lp2[b].item(),[a+1,b+1]))
                expected=sorted(paths,key=lambda v:(-v[0],v[1]))[:6]
                actual=model.predict(ns,6)
                self.assertEqual([a['fingers'] for a in actual],[p[1] for p in expected])
                for a,p in zip(actual,expected):self.assertAlmostEqual(a['logProbability'],p[0],places=5)

    def test_supplied_digits_are_hard_constraints_in_each_adapter(self):
        root=Path('work/neural-piano/upstream')
        notes=[{'midi':60,'time':0,'duration':250,'finger':5},{'midi':62,'time':250,'duration':250,'finger':1}]
        models=[Transformer(root/'lumikey/checkpoints/fingering_transformer_right.pt'),Autoregressive(root/'argnn/models/right_ArGNN.pth','argnn'),Autoregressive(root/'argnn/models/right_ArLSTM.pth','arlstm')]
        with torch.inference_mode():
            for model in models:
                self.assertEqual(model.predict(notes,6)[0]['fingers'],[5,1])

    def test_hybrid_sequence_scores_use_own_history_without_future_digit_leakage(self):
        root=Path('work/neural-piano/upstream/lumikey/checkpoints')
        notes=[{'midi':60,'time':0,'duration':250},{'midi':64,'time':250,'duration':250}]
        with torch.inference_mode():
            for hand in ('left','right'):
                model=Transformer(root/f'fingering_transformer_{hand}.pt')
                beam=model.predict(notes,6)
                scores=model.score_sequences(notes,[c['fingers'] for c in beam])
                for expected,actual in zip(beam,scores):
                    self.assertAlmostEqual(expected['logProbability'],actual,places=5)
                # Independently score a specified path, even if outside the beam.
                initial=[(-1,float('inf')) for _ in range(5)]
                first=model.logits(tokens(notes[0],initial,notes[1:]).unsqueeze(0)).log_softmax(-1)[0,4]
                previous=initial.copy();previous[4]=(60,0.)
                second=model.logits(tokens(notes[1],previous,[]).unsqueeze(0)).log_softmax(-1)[0,0]
                actual=model.score_sequences(notes,[[5,1]])[0]
                self.assertAlmostEqual(actual,first.item()+second.item(),places=5)
                self.assertNotIn('finger',notes[1])
                for invalid in ([[1]],[[0,1]],[[True,1]]):
                    with self.assertRaises(ValueError):model.score_sequences(notes,invalid)
                anchored=[notes[0],{**notes[1],'finger':2}]
                with self.assertRaises(ValueError):model.score_sequences(anchored,[[5,1]])


if __name__=='__main__':unittest.main()
