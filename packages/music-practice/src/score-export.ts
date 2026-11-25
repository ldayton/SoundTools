/** Full-score export shares engraving with the interactive score. */
export type ScoreExportSource = {
  title:string;
  credits:readonly string[];
  render(target:HTMLElement,width:number):void;
};
export type ScorePaper = 'mobile'|'desktop';
export const scorePapers = {
  desktop:{width:210/25.4*96,height:297/25.4*96,margin:36},
  mobile:{width:390,height:844,margin:16},
} as const;
export type ExportBlock={svg:SVGSVGElement;width:number;height:number};
export function paginateScore(blocks:readonly {width:number;height:number}[],paper:ScorePaper) {
  const {width,height,margin}=scorePapers[paper],inner=width-2*margin,available=height-2*margin;
  const pages:{index:number;width:number;height:number}[][]=[[]];let used=0;
  blocks.forEach((block,index)=>{
    if(![block.width,block.height].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid score export geometry');
    const scale=Math.min(1,inner/block.width,available/block.height);
    const placed={index,width:block.width*scale,height:block.height*scale};
    if(used+placed.height>available&&pages.at(-1)!.length){pages.push([]);used=0;}
    pages.at(-1)!.push(placed);used+=placed.height+12;
  });
  return pages;
}
function header(source:ScoreExportSource,width:number,paper:ScorePaper,setup?:string):ExportBlock {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const ctx=document.createElement('canvas').getContext('2d')!;
  function draw(text:string,start:number,columnWidth:number,x:number,anchor:'start'|'middle'|'end',size=12,weight=400,family='"Times New Roman", Times, serif',secondary=false) {
    ctx.font=`${secondary?"italic ":""}${weight} ${size}px ${family}`;let line='',y=start;
    const append=()=>{
      y+=size*1.3;
      const node=document.createElementNS(svg.namespaceURI,'text');
      node.setAttribute('x',String(x));node.setAttribute('y',String(y));
      node.setAttribute('text-anchor',anchor);node.setAttribute('font-family',family);
      node.setAttribute('font-weight',String(weight));node.setAttribute('font-size',String(size));
      if(secondary){node.setAttribute('font-style','italic');node.setAttribute('fill','#444');}
      node.textContent=line;svg.append(node);
    };
    for(const word of text.split(/\s+/)){if(line&&ctx.measureText(`${line} ${word}`).width>columnWidth){append();line='';}line+=(line?' ':'')+word;}
    if(line)append();return y;
  }
  let y=draw(source.title,0,width,width/2,'middle',30,700,'"Times New Roman", Times, serif');
  function credit(text:string,start:number,columnWidth:number,x:number,anchor:'start'|'end') {
    // Separate bibliographic sentences and quoted tune attributions, rather
    // than allowing incidental wrapping to strand a date on its own line.
    const tune=text.match(/^(Music:\s*['‘"][^'’"]+['’"])\s+(.+)$/);
    const lines=tune?[tune[1],tune[2]]:text.split(/(?<=\.)\s+(?=[a-z])/);
    for(const [index,line] of lines.entries()) {
      const content=index && !tune?line.charAt(0).toUpperCase()+line.slice(1):line;
      start=draw(content,start,columnWidth,x,anchor,index?11.5:12,400,'"Times New Roman", Times, serif',index>0);
    }
    return start+4;
  }
  if(source.credits.length) {
    y+=18;
    if(paper==='mobile') {
      for(const text of source.credits)y=credit(text,y,width,0,'start');
    } else {
      const columnWidth=(width-28)/2;
      let left=y,right=y;
      for(const text of source.credits) {
        if(/^(Music:|Arranged by |Arrangement:|Arranger:|Tabledited by )/i.test(text))
          right=credit(text,right,columnWidth,width,'end');
        else left=credit(text,left,columnWidth,0,'start');
      }
      y=Math.max(left,right);
    }
  }
  if(setup)y=draw(setup,y+8,width,0,'start',13);
  y+=12;svg.setAttribute('viewBox',`0 0 ${width} ${y}`);return {svg,width,height:y};
}
export async function prepareScoreExport(source:ScoreExportSource,paper:ScorePaper) {
  await document.fonts.ready;
  const width=scorePapers[paper].width-2*scorePapers[paper].margin;
  const host=document.createElement('div');host.className='hymn-paper';host.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;background:white;color:black`;
  document.body.append(host);
  try {
    source.render(host,width);
    const setup=[host.querySelector(".hymn-score-setup")?.textContent?.match(/^Capo \d+/)?.[0],
      host.querySelector(".score-swing-trigger")?.textContent].filter(Boolean).join(" · ");
    const blocks:ExportBlock[]=[header(source,width,paper,setup)];
    for(const original of host.querySelectorAll('svg')) {
      if(getComputedStyle(original).display==='none')continue;
      const svg=original.cloneNode(true) as SVGSVGElement;
      const originals=[original,...original.querySelectorAll('*')],copies=[svg,...svg.querySelectorAll('*')];
      originals.forEach((node,i)=>{
        const style=getComputedStyle(node),copy=copies[i] as SVGElement|undefined;
        if(!copy)return;
        for(const name of ['font-family','font-size','font-weight','font-style','fill','stroke','stroke-width','direction','unicode-bidi','text-anchor','visibility','display'])copy.style.setProperty(name,style.getPropertyValue(name));
      });
      svg.querySelectorAll('.score-playhead,.passage-overlay,.passage-handle').forEach(n=>n.remove());
      const rect=original.getBoundingClientRect();
      svg.removeAttribute('style');svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
      svg.setAttribute('width',String(rect.width));svg.setAttribute('height',String(rect.height));
      blocks.push({svg,width:rect.width,height:rect.height});
    }
    if(blocks.length===1)throw Error('Select score content to export.');
    return {title:source.title,blocks,pages:paginateScore(blocks,paper),paper};
  } finally {host.remove();}
}
export type PreparedScoreExport=Awaited<ReturnType<typeof prepareScoreExport>>;
export async function scorePdf(prepared:PreparedScoreExport):Promise<File> {
  const {PDFDocument}=await import('pdf-lib');
  const doc=await PDFDocument.create();doc.setTitle(prepared.title);doc.setCreator('SongAlong');
  const sheet=scorePapers[prepared.paper],factor=.75;
  for(const placements of prepared.pages) {
    const page=doc.addPage([sheet.width*factor,sheet.height*factor]);let y=sheet.margin;
    for(const placement of placements) {
      const block=prepared.blocks[placement.index];
      // Browser rasterization preserves Hebrew shaping/niqqud exactly. Capture
      // at 4 CSS pixels per unit (384 dpi), with no page-wide canvas allocation.
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(placement.width*4);canvas.height=Math.ceil(placement.height*4);
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(block.svg)],{type:'image/svg+xml'}));
      try {const image=new Image();image.src=url;await image.decode();ctx.drawImage(image,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}
      const image=await doc.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(image,{x:sheet.margin*factor,y:(sheet.height-y-placement.height)*factor,width:placement.width*factor,height:placement.height*factor});
      y+=placement.height+12;canvas.width=0;canvas.height=0;
    }
  }
  const bytes=await doc.save();
  return new File([bytes as Uint8Array<ArrayBuffer>],`${prepared.title.replace(/[\\/:*?"<>|]/g,'-')}-${prepared.paper}.pdf`,{type:'application/pdf'});
}
export function printScore(prepared:PreparedScoreExport,target:Window) {
  const sheet=scorePapers[prepared.paper],doc=target.document;
  doc.title=prepared.title;doc.body.replaceChildren();
  const style=doc.createElement('style');style.textContent=`@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:white;color:black}section{width:${sheet.width}px;height:${sheet.height}px;padding:${sheet.margin}px;break-after:page}section:last-child{break-after:auto}svg{display:block;margin-bottom:12px;max-width:none} @media screen{section{margin:auto;box-shadow:0 0 2px #888}}`;
  doc.head.append(style);
  for(const placements of prepared.pages){const page=doc.createElement('section');for(const placed of placements){const svg=doc.importNode(prepared.blocks[placed.index].svg,true);svg.setAttribute('width',String(placed.width));svg.setAttribute('height',String(placed.height));page.append(svg);}doc.body.append(page);}
  target.focus();target.print();
}
export async function saveScorePdf(file:File) {
  if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:file.name});return;}
  const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
