import importlib.util,pathlib,unittest
from PIL import Image
spec=importlib.util.spec_from_file_location('scorer',pathlib.Path(__file__).with_name('score-images.py'));s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class ScoringTests(unittest.TestCase):
 def test_previous_clip_excluded(self):
  # Last 4 seconds of a 10 second chart: earlier signal must not leak in.
  data=(0,100,list(range(10,20))*20,[])
  self.assertEqual(sum(s.count_roi(data,4,0).values()),0)
 def test_background_bands_are_not_markers(self):
  im=Image.new('RGB',(1051,820),(255,183,197));d=s.pixels(im,'voice-tools');self.assertEqual(d[2:],([],[]))
 def test_threshold_fragility_is_not_asserted_as_difference(self):
  d=(0,100,[],[80]*5);self.assertEqual(s.classify(d,4,0,[0,0])['robust'],'sensitive')
 def test_robust_interior_signal(self):
  d=(0,100,[80]*20,[]);self.assertEqual(s.classify(d,4,0,[0,0])['robust'],'visible')
 def test_alignment_boundary_is_uncertain(self):
  d=(0,100,[59]*30,[]);self.assertEqual(s.classify(d,4,0,[0,0])['robust'],'sensitive')
if __name__=='__main__':unittest.main()
