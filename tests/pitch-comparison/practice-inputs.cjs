const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function inputs(root=path.resolve(__dirname,'../..')){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p))),pin=p=>read('tests/pitch-comparison/'+p+'.json');
 const noise=read('outputs/pitch-comparison/practice/noise/manifest.json');assert.deepEqual(noise,pin('practice-noise-manifest'),'Noise corpus pin mismatch');
 return [...pin('practice-manifest').clips,...pin('avid-manifest').clips,...noise.clips,
 {...pin('near-mic-control'),split:'regression',condition:'English interview control'},
 ...pin('near-mic-manifest').clips.filter(c=>c.id.endsWith('-original')).map(c=>({...c,pcm:'outputs/pitch-comparison/near-mic/'+c.id+'.f32',split:'regression',condition:'Natural conversational headset speech'}))];
}
module.exports={inputs};
