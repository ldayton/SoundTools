/** Browser-side pixel oracle, bundled without host-transpiler helpers. */
export async function compareLayoutPixels(expected:string,actual:string) {
    const decode=async(data:string)=>{
      const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
      return {canvas,context,pixels:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const before=await decode(expected),after=await decode(actual);
    const width=Math.max(before.canvas.width,after.canvas.width),height=Math.max(before.canvas.height,after.canvas.height);
    const diff=document.createElement('canvas');diff.width=width;diff.height=height;
    const context=diff.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,width,height);
    const ink=(image:typeof before,x:number,y:number)=>{
      if(x<0||y<0||x>=image.canvas.width||y>=image.canvas.height) return false;
      const at=(y*image.canvas.width+x)*4;
      return image.pixels[at]<200||image.pixels[at+1]<200||image.pixels[at+2]<200;
    };
    const nearby=(image:typeof before,x:number,y:number)=>{
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(ink(image,x+dx,y+dy))return true;
      return false;
    };
    let changed=0,inkPixels=0,left=width,top=height,right=0,bottom=0;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const a=ink(before,x,y),b=ink(after,x,y);
      if(a||b) inkPixels++;
      const mismatch=(a&&!nearby(after,x,y))||(b&&!nearby(before,x,y));
      if(mismatch){changed++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(a||b){context.fillStyle=mismatch?(a?'#d22':'#06c'):'#aaa';context.fillRect(x,y,1,1);}
    }
    const dimensionChanged=before.canvas.width!==after.canvas.width||before.canvas.height!==after.canvas.height;
    if(dimensionChanged){context.strokeStyle='#06c';context.strokeRect(.5,.5,width-1,height-1);}
    const region=dimensionChanged?{x:0,y:0,width,height}:changed?{x:Math.max(0,left-8),y:Math.max(0,top-8),width:Math.min(width,right+9)-Math.max(0,left-8),height:Math.min(height,bottom+9)-Math.max(0,top-8)}:null;
    const crop=(source:HTMLCanvasElement)=>{
      if(!region)return '';
      const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(source,region.x,region.y,region.width,region.height,0,0,region.width,region.height);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return {changed,inkPixels,region,dimensionChanged,expectedSize:[before.canvas.width,before.canvas.height],actualSize:[after.canvas.width,after.canvas.height],
      diff:changed||dimensionChanged?diff.toDataURL('image/png').split(',')[1]:'',beforeCrop:crop(before.canvas),afterCrop:crop(after.canvas),diffCrop:crop(diff)};
}

export function layoutComparatorSamples() {
    const image=(shift:number,blank=false,height=60)=>{
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=height;
      const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,80,height);
      if(!blank){context.fillStyle='#111';context.fillRect(10+shift,10,10,30);}
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return [image(0),image(1),image(6),image(0,true),image(0,false,90)];
}
