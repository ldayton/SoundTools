import type {InkBox} from './skyline';

// Preserve complete text/selectable bounds in each SVG frame, even where an
// aligned stanza has a blank row; contours can still interlock that blank area.
export const scoreFrameSelector='path,text,use,rect,line,polyline,polygon,circle,ellipse';
export const scoreInkSelector='path,text:not(:has(tspan)),tspan,use,rect,line,polyline,polygon,circle,ellipse';

/** One visible-ink measurement contract for framing, skylines and export. */
export function visibleScoreInk(node:SVGGraphicsElement){
  if(node.closest('defs,clipPath,mask,pattern,marker,symbol,.score-playhead,.passage-overlay,.score-skyline-debug'))return false;
  for(let p:Element|null=node;p&&p.tagName.toLowerCase()!=='svg';p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return false;}
  return true;
}
export function scoreInkBox(node:SVGGraphicsElement,svg:SVGSVGElement):InkBox|undefined {
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
