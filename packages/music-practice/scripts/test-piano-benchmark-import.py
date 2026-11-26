"""Synthetic tests for our importer; no upstream programs or data are executed."""
import importlib.util
import pathlib
import unittest
import sys
sys.dont_write_bytecode=True
from fractions import Fraction
spec=importlib.util.spec_from_file_location('ours',pathlib.Path(__file__).with_name('import-piano-benchmark.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def test_pitch(self):
        for name,value in [('C4',60),('B#3',60),('Cb4',59),('Fx4',67),('Ebb4',62),('C-1',0)]:self.assertEqual(module.pitch(name),value)
        for name in ['H4','C99','C4junk']:self.assertRaises(ValueError,module.pitch,name)

    def test_voices_chord_rest_tie_and_hand_not_clef(self):
        xml='''<score-partwise><part><measure><attributes><divisions>4</divisions><staves>2</staves></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="start"/><notations><technical><fingering>1</fingering></technical></notations></note>
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><tie type="stop"/></note>
        <backup><duration>8</duration></backup>
        <note><rest/><duration>4</duration><voice>5</voice><staff>2</staff></note>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff><notations><technical><fingering>4-5</fingering></technical></notations></note>
        </measure><measure><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note></measure></part></score-partwise>'''
        c=module.musicxml_case(xml,'test','synthetic')
        self.assertEqual([(n['midi'],n['start'],n['duration'],n['hand'])for n in c['notes']],[(60,0,1,'right'),(64,0,1,'right'),(60,1,1,'right'),(48,1,1,'left'),(62,2,1,'right')])
        self.assertEqual(c['notes'][2]['tieFrom'],c['notes'][0]['id'])
        self.assertEqual(c['labels'][1]['kind'],'flagged');self.assertNotIn('finger',c['labels'][1])
        self.assertTrue(all('finger' not in n for n in c['notes']))
        self.assertRaises(ValueError,module.musicxml_case,xml.replace('<tie type="start"/>',''),'bad','synthetic')

    def test_triplets_closing_rest_and_chord_digits(self):
        row={'number':50,'part':'test','beats':3,'perBeat':3,'right':[['C4+E4','D4+F4','E4+G4'],['C4']],'left':[['C3','D3','E3'],['C3']],'rightFingers':[['13','24','35'],['1']],'leftFingers':[['5','4','3'],['5']],'rest':3}
        c=module.exercise_cases([row],'synthetic')[0]
        self.assertEqual(c['notes'][0]['duration'],float(Fraction(1,3)))
        self.assertEqual(c['notes'][1]['start'],0)
        self.assertEqual(c['notes'][6]['start'],1)
        self.assertEqual(c['notes'][6]['duration'],2)
        self.assertEqual([l['finger']for l in c['labels'][:2]],[1,3])

if __name__=='__main__':unittest.main()
