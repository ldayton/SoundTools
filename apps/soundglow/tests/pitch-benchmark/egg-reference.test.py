"""Reference extraction must preserve known periods and never manufacture silence truth."""
import importlib.util
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('egg_reference',Path(__file__).with_name('egg-reference.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for hz in [80,200,400,600]:
 t=np.arange(8000)/8000;x=np.sin(2*np.pi*hz*t)+.25*np.sin(4*np.pi*hz*t);rows=m.derive(x);v=[r['hz'] for r in rows if not r['exclude']];assert len(v)>70,(hz,len(v));assert abs(np.median(v)/hz-1)<.01,(hz,np.median(v))
assert all(r['exclude'] for r in m.derive(np.zeros(8000)))
assert all(r['exclude'] for r in m.derive(np.random.default_rng(42).normal(size=8000)))
print('EGG reference: known low/high periods, silence and noise passed')
