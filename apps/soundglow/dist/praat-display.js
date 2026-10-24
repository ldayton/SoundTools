// SPDX-License-Identifier: GPL-3.0-or-later
// Mirrors Spectrogram_paintInside: reference PSD, pre-emphasis, no compression.
(function(scope){
 function powerDb(power,frequency,preemphasis=6){return 10*Math.log10(power/4e-10+1e-308)+preemphasis*Math.log2(Math.max(0,frequency)/1000+1e-308)}
 function intensity(db,maximum,range=70,gain=0){return Math.max(0,Math.min(1,(db+gain-maximum+range)/range))}
 // 256 KiB replaces three interpolations and channel writes per output pixel.
 // Build through RGBA bytes so packed writes also work on either byte order.
 function palette(lut,discrete=false){
  const bytes=new Uint8ClampedArray(65536*4);
  for(let i=0;i<65536;i++){
   const level=i*255/65535,lo=Math.floor(level),hi=discrete?lo:Math.min(255,lo+1),mix=level-lo;
   for(let c=0;c<3;c++)bytes[i*4+c]=Math.round(lut[lo][c]+(lut[hi][c]-lut[lo][c])*mix);
   bytes[i*4+3]=255;
  }
  return new Uint32Array(bytes.buffer);
 }
 function colourPixels(slices,width,height,maximum,range,gain,colours,rgba,compression=0,suppression=0){
  const pixels=new Uint32Array(rgba.buffer,rgba.byteOffset,rgba.byteLength/4);let offset=0;
  for(const slice of slices){
   const db=slice.db,columns=slice.width,boost=new Float32Array(compression?columns:0);
   if(compression)for(let x=0;x<columns;x++){let peak=-160;for(let y=0;y<height;y++)peak=Math.max(peak,db[y*columns+x]);boost[x]=Math.max(0,maximum-peak)*compression}
   for(let y=0;y<height;y++){
    let source=y*columns,destination=y*width+offset;const end=source+columns;
    while(source<end){
     const levelDb=db[source]+(compression?boost[source%columns]:0)+gain-maximum+range;
     const level=levelDb<suppression?0:Math.round(levelDb/range*65535);
     source++;pixels[destination++]=colours[level<0?0:level>65535?65535:level];
    }
   }
   offset+=columns;
  }
 }
 // Preserve the painted time span when the plot's physical dimensions change.
 function resizeSlices(slices,oldWidth,oldHeight,newWidth,newHeight){
  const columns=slices.reduce((sum,s)=>sum+s.width,0);
  if(!columns||!oldWidth||!oldHeight)return [];
  const width=Math.min(newWidth,Math.max(1,Math.round(columns/oldWidth*newWidth))),source=new Float32Array(columns*oldHeight),db=new Float32Array(width*newHeight);
  let offset=0;for(const slice of slices){for(let y=0;y<oldHeight;y++)source.set(slice.db.subarray(y*slice.width,(y+1)*slice.width),y*columns+offset);offset+=slice.width;}
  for(let y=0;y<newHeight;y++){
   const sy=Math.max(0,Math.min(oldHeight-1,(y+.5)*oldHeight/newHeight-.5)),y0=Math.floor(sy),y1=Math.min(oldHeight-1,y0+1),fy=sy-y0;
   for(let x=0;x<width;x++){
    const sx=Math.max(0,Math.min(columns-1,(x+.5)*columns/width-.5)),x0=Math.floor(sx),x1=Math.min(columns-1,x0+1),fx=sx-x0;
    const top=source[y0*columns+x0]*(1-fx)+source[y0*columns+x1]*fx,bottom=source[y1*columns+x0]*(1-fx)+source[y1*columns+x1]*fx;
    db[y*width+x]=top*(1-fy)+bottom*fy;
   }
  }
  return [{width,db}];
 }
 // Source levels are shared by peak detection and painting. Key by the PCM
 // analysis result's power buffer, which survives history ownership copies.
 class LevelCache {
  constructor(){this.frames=new WeakMap();this.geometry=new Map()}
  get(frame,preemphasis){
   const {power,firstFrequency=0,frequencyStep=20,spectrumUnits='density'}=frame;
   const key=[power.length,firstFrequency,frequencyStep,spectrumUnits,preemphasis].join(':');
   const cached=this.frames.get(power);if(cached?.key===key)return cached;
   let correction=this.geometry.get(key);
   if(!correction){
    correction=Float64Array.from(power,(_,i)=>{const hz=firstFrequency+i*frequencyStep;return preemphasis*Math.log2(spectrumUnits==='amplitude'?Math.max(hz,1)/1000:Math.max(0,hz)/1000+1e-308)});
    if(this.geometry.size>=16)this.geometry.delete(this.geometry.keys().next().value);
    this.geometry.set(key,correction);
   }
   const levels=new Float32Array(power.length);let peak=0;
   for(let i=0;i<power.length;i++){
    const db=(spectrumUnits==='amplitude'?Math.max(0,Math.min(255,10*Math.log10(power[i])+92)):10*Math.log10(power[i]/4e-10+1e-308))+correction[i];
    levels[i]=db;peak=Math.max(peak,db);
   }
   const result={key,levels,peak};this.frames.set(power,result);return result;
  }
 }
 // Timestamped source spectra outlive any particular canvas geometry. The byte
 // cap also bounds retention for unusually dense FFTs on high-rate devices.
 class SpectrumHistory {
  constructor({seconds=31,maxBytes=32*1024*1024}={}){this.seconds=seconds;this.maxBytes=maxBytes;this.clear()}
  clear(){this.frames=[];this.bytes=0}
  append(frames,geometry){
   const added=[];
   for(const source of frames){
    if(!Number.isFinite(source.time)||this.frames.length&&source.time<=this.frames.at(-1).time)continue;
    const frame={...source,...geometry};this.frames.push(frame);added.push(frame);this.bytes+=frame.power.byteLength;
   }
   const cutoff=(this.frames.at(-1)?.time??0)-this.seconds;
   // Keep one left neighbour where the byte budget permits interpolation.
   while(this.frames.length&&(this.bytes>this.maxBytes||this.frames.length>1&&this.frames[1].time<cutoff)){
    this.bytes-=this.frames.shift().power.byteLength;
   }
   return added;
  }
  project({end,duration,width,height,rowsFor,interpolate=true,maxGap=.03}){
   const db=new Float32Array(width*height);db.fill(-Infinity);
   const frames=this.frames,columns=[];let index=-1;
   for(let x=0;x<width;x++){
    const time=end-duration+(x+.5)*duration/width;
    while(index+1<frames.length&&frames[index+1].time<=time)index++;
    if(index<0)continue;
    const frame=frames[index],next=frames[index+1];
    if(time-frame.time>maxGap)continue;
    const a=rowsFor(frame),b=next?rowsFor(next):a;
    const mix=interpolate&&next&&next.time-frame.time<=maxGap?Math.max(0,Math.min(1,(time-frame.time)/(next.time-frame.time))):0;
    columns.push({x,a,b,mix});
   }
   // Write consecutive memory instead of striding a large Retina buffer.
   for(let y=0;y<height;y++){const offset=y*width;for(const {x,a,b,mix} of columns)db[offset+x]=a[y]+(b[y]-a[y])*mix;}
   return {width,db};
  }
 }
 const api={powerDb,intensity,palette,colourPixels,resizeSlices,LevelCache,SpectrumHistory};if(typeof module==='object'&&module.exports)module.exports=api;else scope.PraatDisplay=api;
})(typeof self==='object'?self:globalThis);
