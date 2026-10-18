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
 const api={powerDb,intensity,palette,colourPixels,resizeSlices};if(typeof module==='object'&&module.exports)module.exports=api;else scope.PraatDisplay=api;
})(typeof self==='object'?self:globalThis);
