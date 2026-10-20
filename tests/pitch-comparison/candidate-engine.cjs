const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createProcessor}=require('../../dist/vendor/praat/processor.js');
async function candidateEngine(mode=1){
 const dir=path.resolve(__dirname,'../../outputs/pitch-comparison/candidate-stream/build'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'research-manifest.json')));
 for(const [name,hash]of Object.entries(manifest.assets))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex'),hash);
 const m=await require(path.join(dir,'praat-spectrogram.js'))();assert.equal(m._sg_set_pitch_mode(mode),0);const processor=createProcessor({load:()=>m});
 return {m,processor:{async handle(request){assert(!request.batchSteps,'Research adapter requires unbatched requests');const r=await processor.handle(request);if(r.error)return r;assert.equal(m._sg_candidates_rows(),r.features.length);const ptr=m._sg_candidates_data()>>>2,b=m.HEAPF32.slice(ptr,ptr+66*r.features.length);for(let i=0;i<r.features.length;i++){const base=i*66,n=b[base];assert(Number.isInteger(n)&&n>=0&&n<=32);const candidates=Array.from({length:n},(_,k)=>({frequency:b[base+2+k*2],strength:b[base+3+k*2]}));r.features[i]={...r.features[i],relativeIntensity:b[base+1],candidates};if(n){assert.equal(candidates[0].frequency,r.features[i].pitch);assert.equal(candidates[0].strength,r.features[i].strength);}}return r;}}};
}
module.exports={candidateEngine};
