const assert=require('node:assert/strict'),{variants,DecisionPolicy}=require('./gate-cycle-policy.cjs');
const f=(i,p)=>({start:i*.032,end:(i+1)*.032,time:(i+.5)*.032,probability:p});
for(const v of variants){const p=new DecisionPolicy(v);assert.equal(p.push(f(0,0)).speech,false);assert.equal(p.push(f(1,.31)).speech,true);assert.throws(()=>p.push(f(0,.5)),/Invalid/)}
const onset=variants.map(v=>new DecisionPolicy(v));assert.deepEqual(onset.map(p=>p.push(f(0,.25)).speech),[false,true,false]);
const p=new DecisionPolicy(variants[2]);assert(p.push(f(0,.3)).speech);assert(p.push(f(1,.2)).speech);assert(p.push(f(2,.1)).speech);assert(p.push(f(3,.1)).speech);assert.equal(p.push(f(4,.1)).speech,false);assert.equal(p.push(f(5,.2)).speech,false);assert(p.push(f(6,.3)).speech);
const q=new DecisionPolicy(variants[2]);q.push(f(0,.3));q.push(f(1,.1));q.push(f(2,.2));assert(q.push(f(3,.1)).speech);assert(q.push(f(4,.1)).speech);assert.equal(q.push(f(5,.1)).speech,false);
const cfg=require('./gate-cycle.json');assert.deepEqual(cfg.candidates,variants.slice(1));console.log('PASS: fixed thresholds, quiet onset distinction, hysteresis release/reset, chronology and frozen candidate contract');
