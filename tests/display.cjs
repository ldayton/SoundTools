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
