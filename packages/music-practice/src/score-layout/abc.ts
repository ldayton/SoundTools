import {prepareScoreSvg,type ScorePresentation} from "./svg";
import {isScoreSectionStart} from "../score-markings";
import abcjs, { type AbcVisualParams, type AbsoluteElement } from "abcjs";
import { planScoreLayout, scoreFrame, SCORE_LAYOUT, type MeasuredBar, type MeasuredSection, type ScoreLayoutPlan } from "./plan";

type Metrics = MeasuredSection[];
const cache = new Map<string, Metrics>();
// abcjs 6.5 declares a flat array, but its parser requires one break array per section.
export const sectionBreaks = (breaks: number[][]) => breaks as unknown as number[];

/** Measure the same visible voices, lyric padding and signatures as the final pass.
 * Explicit breaks preserve tablature, unlike abcjs's automatic wrap/reparse path. */
function measureAndPlan(
  source: string, params: AbcVisualParams, width: number, annotations: boolean,
  context?: unknown[],
) {
  const {afterParsing: _prepare,...geometry}=params;
  const key = JSON.stringify([source, geometry, annotations, context]);
  const cacheable=!params.afterParsing || context!==undefined;
  let metrics = cacheable?cache.get(key):undefined;
  if (!metrics) {
    const parsed = abcjs.parseOnly(source)[0];
    let sections = 0, inMusic = false;
    for (const line of parsed.lines) {
      if (line.staff && !inMusic) sections++;
      inMusic = !!line.staff;
    }
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:1px;overflow:hidden";
    document.body.append(probe);
    try {
      const measure = (minimum: boolean): Metrics => {
        // Two real engraving passes distinguish collision-constrained width from
        // natural rhythmic spacing. All visible voices share abcjs's x alignment.
        const tune = abcjs.renderAbc(probe, source, {
          ...params, lineBreaks: sectionBreaks(Array.from({length:sections},()=>[])),
          wrap: undefined, staffwidth: 1,
          afterParsing: (tune, index, abc) => {
            params.afterParsing?.(tune,index,abc);
            tune.formatting.stretchlast = minimum ? 1 : 0;
            return tune;
          },
        })[0];
        const result: Metrics = [];
        for (const line of tune.lines) {
          const voice = line.staff?.[0]?.voices?.[0];
          if (!voice) continue;
          const bars: MeasuredBar[] = [];
          let duration = 0, breakBefore = false, lastRight = 0, left: number | undefined, previous: number | undefined;
          for (const item of voice) {
            const absolute = (item as typeof item & {abselem?:AbsoluteElement}).abselem;
            if ((item.el_type === "note" || item.el_type === "bar") && absolute) {
              left ??= absolute.x;
              previous ??= absolute.x;
              lastRight=Math.max(lastRight,absolute.x+absolute.w);
            }
            if (item.el_type === "part" || isScoreSectionStart(item)) breakBefore = true;
            if (item.el_type === "note") duration += item.duration;
            if (item.el_type === "bar" && absolute && previous !== undefined) {
              const width=Math.max(0, absolute.x-previous)+(annotations && duration?SCORE_LAYOUT.annotationAllowance:0);
              bars.push({minimumWidth:width,naturalWidth:width,duration,breakBefore,phraseEnd:item.type!=="bar_thin"});
              duration=0;breakBefore=false;previous=absolute.x;
            }
          }
          if(duration>0 && previous!==undefined) {
            const width=Math.max(0,lastRight-previous)+(annotations?SCORE_LAYOUT.annotationAllowance:0);
            bars.push({minimumWidth:width,naturalWidth:width,duration,breakBefore,phraseEnd:true});
          }
          if (bars.length) result.push({startWidth:left || 0,bars,barDuration:tune.getBarLength()});
        }
        return result;
      };
      const natural=measure(false), minimum=measure(true);
      metrics=natural.map((section,s)=>({...section,bars:section.bars.map((bar,b)=>{
        const min=Math.min(bar.minimumWidth,minimum[s]?.bars[b]?.minimumWidth??bar.minimumWidth);
        // Keep a small collision margin. Stretch only the flexible difference,
        // rather than multiplying clefs, text and all other fixed ink widths.
        return {...bar,minimumWidth:min*SCORE_LAYOUT.minimumExpansion,
          naturalWidth:Math.max(min*SCORE_LAYOUT.minimumExpansion,min+(bar.naturalWidth-min)*SCORE_LAYOUT.targetExpansion)};
      })}));
      if(cacheable) cache.set(key, metrics);
      if (cache.size > 32) cache.delete(cache.keys().next().value!);
    } finally { probe.remove(); }
  }
  return {metrics:structuredClone(metrics),plan:planScoreLayout(metrics, width)};
}


/** All display-only ABC directives are owned by the layout adapter. */
export function prepareScoreLayoutSource(source: string, options: {staffScale?:number;melismas?:boolean;compactStaves?:boolean} = {}) {
  const staffScale=options.staffScale??1;
  if(!(staffScale>0) || !Number.isFinite(staffScale)) throw new RangeError("Staff scale must be positive and finite");
  // abcjs rounds font sizes. Reserve lyric leading at the selected staff size;
  // the lyric adapter restores the exact display font after engraving.
  const vocalFont=(Math.ceil(16/staffScale)*3)/4*(options.melismas?1.25:1);
  return `%%barnumbers 1\n%%vocalfont sans-serif ${vocalFont}\n%%stretchlast 0\n`
    +(options.compactStaves?"%%staffsep 24\n%%sysstaffsep 28\n%%musicspace 4\n":"")+source;
}

export type ScoreLayoutMode = "reflow" | "wrap" | "rhythm";
export type AbcScoreLayoutInput = {
  source: string;
  width: number;
  scale: number;
  mode: ScoreLayoutMode;
  params: AbcVisualParams;
  annotations?: boolean;
  presentation?: ScorePresentation;
  /** All semantic choices made by afterParsing that affect measurement.
   * Omit to disable caching when a callback has unkeyed dependencies. */
  measurementContext?: unknown[];
};

/** The single abcjs layout boundary: measurement, breaks, spacing and physical
 * sizing live here. Instrument adapters still own their musical decorations. */
export class AbcScoreLayout {
  plan?: ScoreLayoutPlan;
  private metrics?: Metrics;
  readonly params: AbcVisualParams;
  private paper?: HTMLElement;
  constructor(readonly input: AbcScoreLayoutInput) {
    const {width,scale,mode,source}=input;
    const params:AbcVisualParams={...input.params,afterParsing:(tune,index,abc)=>{
      input.params.afterParsing?.(tune,index,abc);
      // Padding is measurement-only and belongs to the shared layout contract.
      for(const line of tune.lines)for(const staff of line.staff||[])for(const voice of staff.voices||[])
        for(const item of voice)if(item.el_type==="note")for(const lyric of item.lyric||[])
          lyric.syllable="\u2009"+lyric.syllable.replace(/[\u2002\u2009]/g,"")+"\u2009";
      return tune;
    }};
    // Validate with the same sizing contract used after engraving.
    scoreFrame(width,scale,{width:1,height:1},true);
    const staffwidth=Math.max(140,width/scale-2*SCORE_LAYOUT.padding);
    if(mode==="reflow") {
      const measured=measureAndPlan(source,params,staffwidth,!!input.annotations,input.measurementContext??(!input.params.afterParsing?[]:undefined));
      this.plan=measured.plan;this.metrics=measured.metrics;
    }
    this.params={...params,staffwidth,
      lineBreaks:this.plan?sectionBreaks(this.plan.sections.map(section=>section.breaks)):undefined,
      responsive:"resize",oneSvgPerLine:true,
      wrap:mode==="wrap"?{minSpacing:2,maxSpacing:2.6,preferredMeasuresPerLine:0}:undefined,
      timeBasedLayout:mode==="rhythm"?{minPadding:8,minWidth:Math.max(100,width/scale-2*SCORE_LAYOUT.padding)}:undefined,
      paddingtop:12,paddingbottom:18,paddingleft:SCORE_LAYOUT.padding,paddingright:SCORE_LAYOUT.padding,
    };
  }
  render(paper: HTMLElement) {
    let tune:ReturnType<typeof abcjs.renderAbc>[number];
    const limit=this.metrics?.reduce((sum,section)=>sum+section.bars.length,0) || 1;
    for(let pass=0;;pass++) {
      tune=abcjs.renderAbc(paper,this.input.source,this.params)[0];
      if(!this.plan || !this.metrics || pass>=limit)break;
      // abcjs can add end-of-system lyric/barline glue after the probe's
      // collision pass. Reconcile its real minimum extent with the planner;
      // never shrink glyphs, trim ink or loosen the overflow assertion.
      const svgs=[...paper.querySelectorAll('svg')];let index=0,refined=false;
      this.plan.sections.forEach((section,s)=>{
        let missing=0;
        for(const system of section.systems) {
          const svg=svgs[index++];if(!svg)continue;
          // oneSvgPerLine repeats the widest viewBox on every SVG. Read
          // this system's actual staff extent, not that shared outer width.
          const staffs=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')];
          const observed=staffs.length?Math.max(...staffs.map(staff=>{const box=staff.getBBox();return box.x+box.width-SCORE_LAYOUT.padding;})):0;
          const sounding=this.metrics![s].bars.slice(system.from,system.to).filter(bar=>bar.duration>0).length;
          if(observed>this.plan!.width+.5 && sounding>1 && system.minimumWidth<=this.plan!.width)
            missing=Math.max(missing,observed-system.minimumWidth);
        }
        if(missing>0){this.metrics![s].startWidth+=missing;refined=true;}
      });
      if(!refined)break;
      this.plan=planScoreLayout(this.metrics,this.plan.width);
      this.params.lineBreaks=sectionBreaks(this.plan.sections.map(section=>section.breaks));
    }
    this.paper=paper;
    for(const lyric of paper.querySelectorAll('.abcjs-lyric')) {
      const walker=document.createTreeWalker(lyric,NodeFilter.SHOW_TEXT);
      while(walker.nextNode())walker.currentNode.textContent=walker.currentNode.textContent!.replace(/[\u2002\u2009]/g,"");
    }
    // With oneSvgPerLine abcjs makes the supplied paper the responsive outer
    // container and creates unclassified clipping divs for individual systems.
    // Restore flow after it writes its own width/overflow/aspect-ratio styles.
    paper.dataset.scoreLayout=this.input.mode;
    paper.style.display="block";paper.style.position="relative";
    paper.style.width="100%";paper.style.paddingBottom="0";
    paper.style.overflowX=this.input.mode==="reflow"?"auto":"hidden";
    paper.style.minWidth="0";
    return tune;
  }
  /** Call after instrument/lyric decorations have established the final viewBox. */
  fit(svg: SVGSVGElement) {
    prepareScoreSvg(svg,this.input.presentation);
    // Reserve real final ink (including tab, chord labels and pointed lyrics).
    // A renderer may place it outside its original per-system viewBox.
    const box=svg.viewBox.baseVal;
    const root=svg.getScreenCTM();
    if(root) {
      const inverse=root.inverse();
      let left=box.x,right=box.x+box.width,top=Infinity,bottom=-Infinity;
      for(const node of svg.querySelectorAll<SVGGraphicsElement>("path,text,use,rect,line,polyline,polygon,circle,ellipse")) {
        if(node.closest("defs,clipPath,mask,pattern,marker,symbol")) continue;
        const style=getComputedStyle(node);
        if(style.visibility==="hidden" || style.visibility==="collapse" || style.display==="none" || style.opacity==="0") continue;
        const screen=node.getBoundingClientRect(),matrix=node.getScreenCTM();
        if(!matrix || (!screen.width && !screen.height)) continue;
        const extent = (bounds: DOMRect | SVGRect, transform: DOMMatrix) => {
          const points=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],
            [bounds.x,bounds.y+bounds.height],[bounds.x+bounds.width,bounds.y+bounds.height]]
            .map(([x,y])=>new DOMPoint(x,y).matrixTransform(transform));
          return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
            top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
        };
        const visible=extent(node.getBBox(),inverse.multiply(matrix));
        // SVG getBBox/getBoundingClientRect include portions cut off by a clip.
        // Our tab/staff adapters use user-space rectangular clipping. Intersect
        // those constraints rather than resurrecting the cropped source staff.
        for(let owner: SVGGraphicsElement|null=node;owner && owner!==svg;owner=owner.parentElement as unknown as SVGGraphicsElement|null) {
          const id=owner.getAttribute("clip-path")?.match(/url\(["']?#([^)'" ]+)/)?.[1];
          const clip=id?svg.querySelector<SVGClipPathElement>(`clipPath[id="${CSS.escape(id)}"]`):null;
          const ownerMatrix=owner.getScreenCTM?.();
          if(!clip || !ownerMatrix || clip.getAttribute("clipPathUnits")==="objectBoundingBox") continue;
          const rect=clip.querySelector<SVGRectElement>(":scope > rect");
          if(!rect) continue;
          let transform=inverse.multiply(ownerMatrix);
          const clipTransform=clip.transform.baseVal.consolidate()?.matrix;
          const rectTransform=rect.transform.baseVal.consolidate()?.matrix;
          if(clipTransform) transform=transform.multiply(clipTransform);
          if(rectTransform) transform=transform.multiply(rectTransform);
          const clipped=extent(rect.getBBox(),transform);
          visible.left=Math.max(visible.left,clipped.left);visible.right=Math.min(visible.right,clipped.right);
          visible.top=Math.max(visible.top,clipped.top);visible.bottom=Math.min(visible.bottom,clipped.bottom);
        }
        if(visible.left>visible.right || visible.top>visible.bottom) continue;
        // Horizontal paper already includes engraving padding. Reserve stroke
        // edges, without adding another eight units beyond an otherwise fitting
        // final barline (Linux font metrics exposed spurious local scrolling).
        left=Math.min(left,visible.left-1);right=Math.max(right,visible.right+1);
        top=Math.min(top,visible.top-8);bottom=Math.max(bottom,visible.bottom+8);
      }
      // Vertical whitespace belongs to the visible music, not abcjs's original
      // untrimmed system box. Glyphs, lyrics and clipped tab ink were all measured.
      if(Number.isFinite(top)&&Number.isFinite(bottom))
        svg.setAttribute("viewBox",`${left} ${top} ${right-left} ${bottom-top}`);
    }
    const frame=scoreFrame(this.input.width,this.input.scale,svg.viewBox.baseVal,this.input.mode==="reflow");
    const wrapper=svg.parentElement;
    if(wrapper && wrapper!==this.paper) {
      // abcjs's responsive wrapper otherwise keeps its old aspect-ratio padding
      // and clips the physically sized SVG. This component owns both boxes.
      wrapper.style.display="block";
      wrapper.style.width=`${frame.width}px`;wrapper.style.height=`${frame.height}px`;
      wrapper.style.paddingBottom="0";wrapper.style.overflow="visible";
      svg.style.position="static";
    }
    svg.style.display="block";
    svg.style.width=`${frame.width}px`;svg.style.height=`${frame.height}px`;
    svg.style.maxWidth=frame.overflow>0.5?"none":"100%";
    svg.dataset.scoreOverflow=String(Math.round(frame.overflow*100)/100);
    svg.dataset.scoreScale=String(frame.scale);
    return frame;
  }
}
