const assert=require('node:assert/strict');
const {palette,colourPixels,intensity}=require('../dist/praat-display.js');
const stops=[[17,8,133],[51,12,150],[157,22,167],[247,73,137],[255,237,65]];
const lut=Array.from({length:256},(_,i)=>{const n=i/255*4,j=Math.min(3,Math.floor(n)),t=n-j;return stops[j].map((a,c)=>Math.round(a+(stops[j+1][c]-a)*t))});
const colours=palette(lut);assert.equal(colours.byteLength,262144);
let maxError=0;
// Dense sweep, clipped extremes, different scales, slice boundaries and row strides.
for(const [maximum,range,gain] of [[100,70,0],[80,30,12],[130,100,-20]]){
 const width=1003,height=211,rgba=new Uint8ClampedArray(width*height*4);
 const slices=[7,993,3].map(columns=>({width:columns,db:Float32Array.from({length:columns*height},(_,i)=>maximum-gain-range*1.2+(i/(columns*height-1))*range*1.4)}));
 colourPixels(slices,width,height,maximum,range,gain,colours,rgba);
 let offset=0;
 for(const slice of slices){
  for(let y=0;y<height;y++)for(let x=0;x<slice.width;x++){
   const level=intensity(slice.db[y*slice.width+x],maximum,range,gain)*255,lo=Math.floor(level),hi=Math.min(255,lo+1),mix=level-lo,p=(y*width+offset+x)*4;
   for(let c=0;c<3;c++){const expected=Math.round(lut[lo][c]+(lut[hi][c]-lut[lo][c])*mix);maxError=Math.max(maxError,Math.abs(rgba[p+c]-expected))}
   assert.equal(rgba[p+3],255);
  }
  offset+=slice.width;
 }
}
assert(maxError<=1,`Palette changed a colour channel by ${maxError}`);
console.log(`PASS: packed repaint matches interpolated RGB within ${maxError}/255 across 634899 pixels`);
// Resize retains occupied history width and independently interpolates both axes.
{
 const {resizeSlices}=require('../dist/praat-display.js');
 const source=[{width:1,db:new Float32Array([0,20])},{width:1,db:new Float32Array([10,30])}];
 assert.deepEqual(resizeSlices(source,8,2,8,2),[{width:2,db:new Float32Array([0,10,20,30])}]);
 const [scaled]=resizeSlices(source,8,2,16,4);assert.equal(scaled.width,4);assert.deepEqual(Array.from(scaled.db),[0,2.5,7.5,10,5,7.5,12.5,15,15,17.5,22.5,25,20,22.5,27.5,30]);
 assert.deepEqual(resizeSlices([],8,2,16,4),[]);assert.deepEqual(Array.from(source[0].db),[0,20]);
}
console.log('PASS: resize preserves occupied history, row order and bilinear levels');
// Projection always starts from immutable spectra, independent of prior sizes.
{
 const {SpectrumHistory}=require('../dist/praat-display.js');
 const history=new SpectrumHistory({seconds:31,maxBytes:1024});
 history.append([{time:0,power:new Float32Array([0,20])},{time:1,power:new Float32Array([10,30])}],{firstFrequency:0,frequencyStep:100});
 const options={end:1,duration:1,width:2,height:2,rowsFor:f=>f.power,maxGap:2};
 assert.deepEqual(Array.from(history.project(options).db),[2.5,7.5,22.5,27.5]);
 assert.deepEqual(Array.from(history.project({...options,interpolate:false}).db),[0,0,20,20]);
 const original=history.project(options);
 for(let i=0;i<20;i++)history.project({...options,width:i%2?7:19});
 assert.deepEqual(history.project(options),original);
 assert.deepEqual(Array.from(history.frames[0].power),[0,20]);
 assert.deepEqual(Array.from(history.project({...options,end:4,maxGap:.03}).db),[-Infinity,-Infinity,-Infinity,-Infinity]);
 assert.deepEqual(Array.from(history.project({...options,end:-1}).db),[-Infinity,-Infinity,-Infinity,-Infinity]);
 const bounded=new SpectrumHistory({seconds:2,maxBytes:24});
 for(let time=0;time<20;time++)bounded.append([{time,power:new Float32Array([time,time])}],{frequencyStep:10});
 assert(bounded.bytes<=24);assert.equal(bounded.frames.length,3);assert.equal(bounded.frames[0].time,17);
 assert.equal(bounded.append([{time:19,power:new Float32Array(2)}],{}).length,0);
 bounded.clear();assert.equal(bounded.bytes,0);assert.equal(bounded.frames.length,0);
}
console.log('PASS: timestamped projection, gap handling, resize stability, source ownership and bounded retention');

// Missing time is never made bright by quiet-frame boost, even at its maximum.
{
 const rgba=new Uint8ClampedArray(8);
 colourPixels([{width:2,db:new Float32Array([-Infinity,80])}],2,1,100,70,30,colours,rgba,1,0);
 const first=new Uint8Array(colours.buffer,0,4);assert.deepEqual(Array.from(rgba.subarray(0,4)),Array.from(first));
}
console.log('PASS: missing capture time stays background under maximum quiet-frame boost');

// Cached levels must preserve both unit conventions, pre-emphasis and peaks.
{
 const {LevelCache,powerDb}=require('../dist/praat-display.js'),{level}=require('../dist/analysis-settings.js');
 const cache=new LevelCache();
 for(const spectrumUnits of ['density','amplitude'])for(const preemphasis of [0,3,6])for(const firstFrequency of [0,20]){
  const frame={power:new Float32Array([0,1e-30,4e-10,1e-4,1,1e20]),firstFrequency,frequencyStep:1000,spectrumUnits};
  const actual=cache.get(frame,preemphasis);let peak=0;
  for(let i=0;i<frame.power.length;i++){
   const hz=firstFrequency+i*1000,db=spectrumUnits==='amplitude'?level(frame.power[i],hz,spectrumUnits,preemphasis):powerDb(frame.power[i],hz,preemphasis);
   assert.equal(actual.levels[i],Math.fround(db));peak=Math.max(peak,db);
  }
  assert.equal(actual.peak,peak);assert.equal(cache.get({...frame},preemphasis),actual,'History ownership copies must share the cache');
  assert.notEqual(cache.get(frame,preemphasis+1),actual,'Pre-emphasis must invalidate levels');
  for(const patch of [{frequencyStep:500},{firstFrequency:firstFrequency+100},{spectrumUnits:spectrumUnits==='density'?'amplitude':'density'}]){
   const baseline=cache.get(frame,preemphasis);assert.notEqual(cache.get({...frame,...patch},preemphasis),baseline,'Geometry and units must invalidate levels');
  }
 }
 for(let i=0;i<30;i++)cache.get({power:new Float32Array([1]),frequencyStep:i+1},3);
 assert(cache.geometry.size<=16,'Frequency corrections must remain bounded');
}
console.log('PASS: shared display-level cache, exact density/amplitude conversion, peak precision and invalidation');
