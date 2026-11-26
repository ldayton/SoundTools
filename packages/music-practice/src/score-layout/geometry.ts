import type {InkBox} from './skyline';

// Preserve complete bounds of real text for selection/clipping. Trailing blank
// lyric lines are removed before measuring; internal verse alignment remains.
export const scoreFrameSelector='path,text,use,rect,line,polyline,polygon,circle,ellipse';
export const scoreInkSelector='path,text:not(:has(tspan)),tspan,use,rect,line,polyline,polygon,circle,ellipse';

/** One visible-ink measurement contract for framing, skylines and export. */
export function visibleScoreInk(node:SVGGraphicsElement){
  if(node.closest('defs,clipPath,mask,pattern,marker,symbol,.score-playhead,.passage-overlay,.score-skyline-debug'))return false;
  // Visibility inherits, but a child may explicitly override it. Display and
  // opacity suppress the whole subtree and cannot be undone by a descendant.
  const style=getComputedStyle(node);
  if(style.visibility==='hidden'||style.visibility==='collapse'||style.display==='none'||style.opacity==='0')return false;
  for(let p:Element|null=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.opacity==='0')return false;}
  return true;
}
export function scoreInkBox(node:SVGGraphicsElement,svg:SVGSVGElement,preciseText=false):InkBox|undefined {
  if(!visibleScoreInk(node)||node.tagName.toLowerCase()==='tspan'&&!node.textContent?.trim())return;
  const root=svg.getScreenCTM(),matrix=node.getScreenCTM();if(!root||!matrix)return;
  const b=node.getBBox();if(!b.width&&!b.height)return;
  const m=root.inverse().multiply(matrix);
  // WebKit's local tspan bbox can omit preceding blank-row dy offsets.
  // Painted screen bounds preserve the actual shaped Hebrew/English row.
  const span=node.tagName.toLowerCase()==='tspan',r=span?node.getBoundingClientRect():b,projection=span?root.inverse():m;
  const points=[[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(projection));
  const stroke=getComputedStyle(node).stroke==='none'?0:parseFloat(getComputedStyle(node).strokeWidth)/2*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d));
  const result={left:Math.min(...points.map(p=>p.x))-stroke,right:Math.max(...points.map(p=>p.x))+stroke,top:Math.min(...points.map(p=>p.y))-stroke,bottom:Math.max(...points.map(p=>p.y))+stroke};
  if(preciseText&&node.closest('.abcjs-lyric')&&(span||node.tagName.toLowerCase()==='text'&&!node.querySelector('tspan'))){
    const ink=lyricVerticalInk(node,m,result);
    if(ink){result.top=ink.top-stroke;result.bottom=ink.bottom+stroke;}
  }
  for(let owner:SVGGraphicsElement|null=node;owner&&owner!==svg;owner=owner.parentElement as unknown as SVGGraphicsElement|null){
    const id=owner.getAttribute('clip-path')?.match(/url\(["']?#([^)'" ]+)/)?.[1];
    const clip=id?svg.querySelector<SVGClipPathElement>(`clipPath[id="${CSS.escape(id)}"]`):null;
    const screen=owner.getScreenCTM();
    if(!clip||!screen||clip.getAttribute('clipPathUnits')==='objectBoundingBox')continue;
    const rect=clip.querySelector<SVGRectElement>(':scope > rect');if(!rect)continue;
    let transform=root.inverse().multiply(screen);
    const clipMatrix=clip.transform.baseVal.consolidate()?.matrix,rectMatrix=rect.transform.baseVal.consolidate()?.matrix;
    if(clipMatrix)transform=transform.multiply(clipMatrix);
    if(rectMatrix)transform=transform.multiply(rectMatrix);
    const bounds=rect.getBBox(),corners=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x,bounds.y+bounds.height],[bounds.x+bounds.width,bounds.y+bounds.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(transform));
    result.left=Math.max(result.left,Math.min(...corners.map(p=>p.x)));result.right=Math.min(result.right,Math.max(...corners.map(p=>p.x)));
    result.top=Math.max(result.top,Math.min(...corners.map(p=>p.y)));result.bottom=Math.min(result.bottom,Math.max(...corners.map(p=>p.y)));
  }
  if(result.left>result.right||result.top>result.bottom)return;
  return result;
}

/** Distance between string/staff line centres, excluding their ink thickness. */
export function scoreStaffSpace(staff:SVGGraphicsElement,svg:SVGSVGElement){
  const lines=[...staff.querySelectorAll<SVGGraphicsElement>(':scope > path')],root=svg.getScreenCTM(),matrix=staff.getScreenCTM();
  if(lines.length<2||!root||!matrix)return;
  const first=lines[0].getBBox(),last=lines.at(-1)!.getBBox(),m=root.inverse().multiply(matrix);
  const a=new DOMPoint(0,first.y+first.height/2).matrixTransform(m),b=new DOMPoint(0,last.y+last.height/2).matrixTransform(m);
  return Math.hypot(b.x-a.x,b.y-a.y)/(lines.length-1);
}


const textContexts=new WeakMap<Document,CanvasRenderingContext2D>();
/** Browser shaping gives actual accent/descender extents; SVG text boxes often
 * reserve the entire font body even for a short syllable. Keep SVG's horizontal
 * shaping and use canvas only for vertical ink around the SVG baseline. */
function lyricVerticalInk(node:SVGGraphicsElement,m:DOMMatrix,bounds:InkBox){
  if(Math.abs(m.b)>.00001||Math.abs(m.c)>.00001||m.d<=0)return;
  const text=node as SVGTextContentElement;
  if(!text.getNumberOfChars?.())return;
  let context=textContexts.get(node.ownerDocument);
  if(!context){context=node.ownerDocument.createElement('canvas').getContext('2d')??undefined;if(!context)return;textContexts.set(node.ownerDocument,context);}
  const style=getComputedStyle(node);
  if(!['auto','alphabetic'].includes(style.dominantBaseline)||style.writingMode!=='horizontal-tb')return;
  context.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.direction=style.direction==='rtl'?'rtl':'ltr';context.textBaseline='alphabetic';
  const metrics=context.measureText(node.textContent||'');
  const ascent=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
  if(![ascent,descent].every(Number.isFinite)||ascent+descent<=0)return;
  try{
    const position=text.getStartPositionOfChar(0),baseline=new DOMPoint(position.x,position.y).matrixTransform(m).y;
    // Some SVG implementations cannot report a baseline for transformed text.
    // Keep conservative bounds rather than trusting an unrelated origin.
    const em=parseFloat(style.fontSize)*m.d;
    if(!Number.isFinite(baseline)||baseline<bounds.top-em||baseline>bounds.bottom+em)return;
    return {top:baseline-ascent*m.d-.5,bottom:baseline+descent*m.d+.5};
  }catch{return;}
}


/** abcjs appends a final newline to every lyric. Empty trailing tspans have no
 * following verse to position, but their font boxes can reserve a whole row. */
export function trimLyricTails(svg:SVGSVGElement){
  for(const lyric of svg.querySelectorAll('.abcjs-lyric')){
    let tail=lyric.lastElementChild;
    while(tail?.tagName.toLowerCase()==='tspan'&&!tail.textContent?.trim()){
      tail.remove();tail=lyric.lastElementChild;
    }
  }
}
