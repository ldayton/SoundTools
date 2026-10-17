// SPDX-License-Identifier: GPL-3.0-or-later
// Mirrors Spectrogram_paintInside: reference PSD, pre-emphasis, no compression.
(function(scope){
 function powerDb(power,frequency,preemphasis=6){return 10*Math.log10(power/4e-10+1e-308)+preemphasis*Math.log2(Math.max(0,frequency)/1000+1e-308)}
 function intensity(db,maximum,range=70,gain=0){return Math.max(0,Math.min(1,(db+gain-maximum+range)/range))}
 // 256 KiB replaces three interpolations and channel writes per output pixel.
 // Build through RGBA bytes so packed writes also work on either byte order.
 function palette(lut){
  const bytes=new Uint8ClampedArray(65536*4);
  for(let i=0;i<65536;i++){
   const level=i*255/65535,lo=Math.floor(level),hi=Math.min(255,lo+1),mix=level-lo;
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
 const api={powerDb,intensity,palette,colourPixels};if(typeof module==='object'&&module.exports)module.exports=api;else scope.PraatDisplay=api;
})(typeof self==='object'?self:globalThis);
