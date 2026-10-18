const assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../dist/settings-state.js'),{presets}=require('../dist/analysis-settings.js');
S.assertPresets(presets);assert.deepEqual(S.defaults,presets.soundglow);assert.equal(presets.soundglow.formants,'off');assert.equal(S.defaults.formantFiltering,'on');assert.equal(S.defaults.formantSmoothing,'light');
// The registry must cover the actual editable preset UI, independent of any preset.
const html=fs.readFileSync('dist/index.html','utf8').split('<section id="presetSettings"')[1].split('</section>')[0];
const controls=[...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(controls.sort(),[...S.ids].sort());assert(!S.ids.includes('microphone'));
for(const [id,entry]of Object.entries(S.registry)){
 assert(S.validValue(id,entry.default));assert(!S.validValue(id,'not-a-value'));assert(!S.validValue(id,NaN));
 const alternatives=entry.values||[String(entry.min),String(entry.max)],value=alternatives.find(v=>v!==S.defaults[id]);
 const before=S.create(),result=S.transition(before,{type:'edit',id,value});
 assert.equal(result.state.selected,'custom');assert.equal(result.state.values[id],value);assert.equal(before.values[id],S.defaults[id]);assert.deepEqual(result.changed,[id]);
 assert(result.effects.includes(entry.effect));
 const restored=S.transition(result.state,{type:'apply',selected:'soundglow',values:presets.soundglow});assert.deepEqual(restored.state.values,presets.soundglow);
 const saved=S.create(presets.soundglow,'saved-test');assert.equal(S.transition(saved,{type:'edit',id,value}).state.selected,'saved-test');
 const missing={...presets.praat};delete missing[id];assert.throws(()=>S.assertPresets({broken:missing}));
}
assert.throws(()=>S.transition(S.create(),{type:'apply',values:presets.soundglow}));
assert.throws(()=>S.transition(S.create(),{type:'edit',id:'microphone',value:'default'}));assert.throws(()=>S.create({...presets.praat,extra:'x'}));assert.throws(()=>S.create({...presets.praat,gain:'Infinity'}));
assert.deepEqual(S.transition(S.create(),{type:'edit',id:'formantSmoothing',value:'strong'}).effects,['overlay']);
assert.deepEqual(S.transition(S.create(),{type:'edit',id:'palette',value:'plasma'}).effects,['colour']);
assert.deepEqual(S.transition(S.create(),{type:'edit',id:'window',value:'0.025'}).changed,[]);
assert(S.transition(S.create(presets.voice,'voice'),{type:'edit',id:'preemphasis',value:'3'}).effects.includes('preemphasis'));
console.log('PASS: independent registry/UI completeness, validation, immutable transitions, preset rules and effects');

// Alternate numeric spellings and tolerated step noise must have one canonical
// representation before either controls or persistence see the snapshot.
for(const [id,input,expected] of [
 ['gain','1e1','10'],['history',' 6.0 ','6'],['gain','-0','0'],
 ['compression','0.30000000000000004','0.3'],['gain','0.0000005','0']
]){
 const source={...S.defaults,[id]:input},state=S.create(source);
 assert.equal(state.values[id],expected);assert.equal(source[id],input);
 const edited=S.transition(S.create(),{type:'edit',id,value:input});
 assert.equal(edited.state.values[id],expected);
 assert.deepEqual(S.create(JSON.parse(JSON.stringify(state.values))).values,state.values);
}
assert.deepEqual(S.transition(S.create(),{type:'edit',id:'gain',value:'-0'}).changed,[]);
assert.throws(()=>S.create({...S.defaults,compression:'0.35'}));
assert.throws(()=>S.create({...S.defaults,gain:'30.0000001'}));
console.log('PASS: canonical numeric spelling, step rounding, boundaries and serialization');
