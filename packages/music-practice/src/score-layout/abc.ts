import {scoreInkBox,scoreFrameSelector} from './geometry';
import {planScoreFlow} from './flow';
import {placeScoreStaves,scoreFlowBlock,type VerticalDiagnostics} from './vertical';
import {prepareScoreSvg,type ScorePresentation} from "./svg";
import {isScoreSectionStart,correctWrappedBarNumbers} from "../score-markings";
import abcjs, { type AbcVisualParams, type AbsoluteElement } from "abcjs";
import { planScoreLayout, scoreFrame, spacingBounds, SCORE_LAYOUT, type MeasuredBar, type MeasuredSection, type ScoreLayoutPlan } from "./plan";

type Metrics = (Omit<MeasuredSection,"startWidths"> & {startWidths?:number[]})[];
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
        const result: Metrics = [];
        for(let sectionIndex=0;sectionIndex<sections;sectionIndex++) {
          const tune = abcjs.renderAbc(probe, source, {
            ...params, lineBreaks: sectionBreaks(Array.from({length:sections},()=>[])),
            // A natural probe needs an unconstrained width. A one-unit target
            // compresses even stretchlast=0, so it cannot measure natural space.
            wrap: undefined, staffwidth: minimum ? 1 : 1000000,
            afterParsing: (tune, index, abc) => {
              params.afterParsing?.(tune,index,abc);
              tune.formatting.stretchlast = minimum ? 1 : 0;
              // abcjs only honours ragged-right on the last music line. Isolate
              // each section so earlier sections are not justified to the probe.
              const line=tune.lines.filter(line=>line.staff)[sectionIndex];
              tune.lines=line?[line]:[];
              return tune;
            },
          })[0];
          for (const line of tune.lines) {
            const voice = line.staff?.[0]?.voices?.[0];
            if (!voice) continue;
            const bars: MeasuredBar[] = [];
            let duration = 0, breakBefore = false, lastRight = 0, left: number | undefined, previous: number | undefined, leading:number|undefined;
            for (const item of voice) {
              const absolute = (item as typeof item & {abselem?:AbsoluteElement}).abselem;
              if ((item.el_type === "note" || item.el_type === "bar") && absolute) {
                left ??= absolute.x;
                previous ??= absolute.x;
                lastRight=Math.max(lastRight,absolute.x+absolute.w);
              }
              if (item.el_type === "part" || isScoreSectionStart(item)) breakBefore = true;
              if (item.el_type === "note") {
                duration += item.duration;
                if(absolute && previous!==undefined)leading??=Math.max(0,absolute.x-previous);
              }
              if (item.el_type === "bar" && absolute && previous !== undefined) {
                const width=Math.max(0, absolute.x-previous)+(annotations && duration?SCORE_LAYOUT.annotationAllowance:0);
                bars.push({minimumWidth:width,naturalWidth:width,duration,startInset:leading??0,breakBefore,phraseEnd:item.type!=="bar_thin"});
                duration=0;leading=undefined;breakBefore=false;previous=absolute.x;
              }
            }
            if(duration>0 && previous!==undefined) {
              const width=Math.max(0,lastRight-previous)+(annotations?SCORE_LAYOUT.annotationAllowance:0);
              bars.push({minimumWidth:width,naturalWidth:width,duration,startInset:leading??0,breakBefore,phraseEnd:true});
            }
            if (bars.length) result.push({startWidth:left || 0,bars,barDuration:tune.getBarLength()});
          }
        }
        return result;
      };
      const natural=measure(false), minimum=measure(true);
      metrics=natural.map((section,s)=>({...section,bars:section.bars.map((bar,b)=>{
        const min=Math.min(bar.minimumWidth,minimum[s]?.bars[b]?.minimumWidth??bar.minimumWidth);
        return {...bar,startInset:minimum[s]?.bars[b]?.startInset??0,...spacingBounds(min,bar.naturalWidth,bar.duration>0?SCORE_LAYOUT.minimumClearance:0)};
      })}));
      // Ask the same renderer/preparation policy about every possible line
      // opening. This captures omitted continuation signatures, changed keys,
      // multiple staves and TAB headers without guessing glyph widths.
      const headerTune=abcjs.renderAbc(probe, source, {
        ...params, wrap:undefined, staffwidth:1,
        lineBreaks:sectionBreaks(metrics.map(section=>section.bars.flatMap((bar,index)=>
          bar.duration>0 && index<section.bars.length-1?[index]:[]))),
      })[0];
      metrics.forEach(section=>section.startWidths=section.bars.map(()=>section.startWidth));
      let sectionIndex=0, barIndex=0;
      for (const line of headerTune.lines) {
        const voice=line.staff?.[0]?.voices?.[0], section=metrics[sectionIndex];
        if(!voice || !section) continue;
        let left:number|undefined, duration=0, count=0;
        for(const item of voice) {
          const absolute=(item as typeof item & {abselem?:AbsoluteElement}).abselem;
          if(absolute && (item.el_type==="note" || item.el_type==="bar")) left??=absolute.x;
          if(item.el_type==="note")duration+=item.duration;
          if(item.el_type==="bar" && absolute && left!==undefined){count++;duration=0;}
        }
        if(duration>0)count++;
        if(left!==undefined && count) section.startWidths![barIndex]=left;
        barIndex+=count;
        if(barIndex>=section.bars.length){sectionIndex++;barIndex=0;}
      }
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
    +(options.compactStaves?`%%staffsep 24\n%%sysstaffsep ${SCORE_LAYOUT.minimumStaffSeparation}\n%%musicspace 4\n`:"")+source;
}

export type ScoreLayoutMode = "reflow" | "wrap";
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
  readonly plan?: ScoreLayoutPlan;
  private metrics?: Metrics;
  readonly params: AbcVisualParams;
  private paper?: HTMLElement;
  private renderPasses=0;
  private tune?:ReturnType<typeof abcjs.renderAbc>[number];
  private vertical:VerticalDiagnostics[]=[];
  /** Serializable developer/test report. Callers cannot mutate cached metrics. */
  get diagnostics() {
    return {renderPasses:this.renderPasses,sections:this.metrics?structuredClone(this.metrics):[],vertical:structuredClone(this.vertical)};
  }
  constructor(readonly input: AbcScoreLayoutInput) {
    const {width,scale,mode,source}=input;
    const params:AbcVisualParams={...input.params,afterParsing:(tune,index,abc)=>{
      if(mode==="reflow")correctWrappedBarNumbers(tune);
      input.params.afterParsing?.(tune,index,abc);
      // Reduce only the minimum blank inter-staff gap. abcjs still expands
      // around notes, lyrics and other engraved content. Explicit source
      // spacing remains authoritative.
      tune.formatting.sysstaffsep??=SCORE_LAYOUT.minimumStaffSeparation;
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
      paddingtop:12,paddingbottom:18,paddingleft:SCORE_LAYOUT.padding,paddingright:SCORE_LAYOUT.padding,
    };
  }
  render(paper: HTMLElement) {
    let tune:ReturnType<typeof abcjs.renderAbc>[number];
    const limit=this.metrics?.reduce((sum,section)=>sum+section.bars.length*(section.bars.length-1)/2,0) || 1;
    for(let pass=0;;pass++) {
      tune=abcjs.renderAbc(paper,this.input.source,this.params)[0];
      this.renderPasses=pass+1;
      if(!this.plan || !this.metrics || pass>=limit)break;
      // abcjs can add end-of-system lyric/barline glue after the probe's
      // collision pass. Reconcile its real minimum extent with the planner;
      // never shrink glyphs, trim ink or loosen the overflow assertion.
      const svgs=[...paper.querySelectorAll('svg')];let index=0,refined=false;
      this.plan.sections.forEach((section,s)=>{
        for(const system of section.systems) {
          const svg=svgs[index++];if(!svg)continue;
          // oneSvgPerLine repeats the widest viewBox on every SVG. Read
          // this system's actual staff extent, not that shared outer width.
          const staffs=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')];
          const observed=staffs.length?Math.max(...staffs.map(staff=>{const box=staff.getBBox();return box.x+box.width-SCORE_LAYOUT.padding;})):0;
          const sounding=this.metrics![s].bars.slice(system.from,system.to).filter(bar=>bar.duration>0).length;
          if(observed>this.plan!.width+.5 && sounding>1 && system.minimumWidth<=this.plan!.width) {
            // End glue belongs to this candidate range, not every line in its
            // section. A range rejected once cannot be selected again.
            this.metrics![s].rangeMinimums=[...(this.metrics![s].rangeMinimums||[]),
              {from:system.from,to:system.to,minimumWidth:observed}];
            refined=true;
          }
        }
      });
      if(!refined)break;
      this.plan.sections=planScoreLayout(this.metrics,this.plan.width).sections;
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
    this.tune=tune;this.vertical=[];
    return tune;
  }
  /** Pack consecutive finalized systems using the same physical contour
   * contract as export. Non-music blocks are boundaries, never overprinted. */
  finish() {
    if(!this.paper?.isConnected||!this.paper.getClientRects().length)return;
    const explicit=[...this.input.source.matchAll(/^%%staffsep\s+([\d.]+)/gm)].at(-1)?.[1];
    if(explicit!==undefined&&Number(explicit)!==24)for(const svg of this.paper.querySelectorAll<SVGSVGElement>('svg'))
      svg.dataset.scoreSystemGap=String(Number(explicit)*4/3*Number(svg.dataset.scoreScale||this.input.scale));
    let run:SVGSVGElement[]=[];
    const pack=()=>{
      if(run.length<2){run=[];return;}
      const blocks=run.map(scoreFlowBlock),plan=planScoreFlow(blocks);
      run.forEach((svg,i)=>{
        const wrapper=svg.parentElement!;
        wrapper.style.marginTop=i?`${plan.positions[i]-plan.positions[i-1]-blocks[i-1].height}px`:'0px';
        wrapper.style.position='relative';
        wrapper.style.marginBottom=i===run.length-1?`${Math.max(0,plan.height-plan.positions[i]-blocks[i].height)}px`:'0px';
        // Overlapping SVG viewports must not intercept the previous system's
        // ink. Painted descendants stay interactive and events still bubble.
        wrapper.style.pointerEvents='none';svg.style.pointerEvents='none';
        for(const child of svg.children)if(child instanceof SVGGraphicsElement&&!child.style.pointerEvents)
          child.style.pointerEvents='visiblePainted';
        svg.dataset.scoreFlowY=String(plan.positions[i]);
      });run=[];
    };
    for(const child of this.paper.children){
      const svg=child.querySelector<SVGSVGElement>(':scope > svg');
      if(svg&&svg.querySelector('.abcjs-staff')&&getComputedStyle(svg).display!=='none')run.push(svg);
      else pack();
    }
    pack();
  }
  /** Call after instrument/lyric decorations have established the final viewBox. */
  fit(svg: SVGSVGElement) {
    prepareScoreSvg(svg,this.input.presentation);
    if(this.tune) {
      const explicit=[...this.input.source.matchAll(/^%%sysstaffsep\s+([\d.]+)/gm)].at(-1)?.[1];
      this.vertical.push(placeScoreStaves(svg,this.tune,explicit===undefined||Number(explicit)===SCORE_LAYOUT.minimumStaffSeparation,this.input.presentation?.view));
    }
    // Reserve real final ink (including tab, chord labels and pointed lyrics).
    // A renderer may place it outside its original per-system viewBox.
    const box=svg.viewBox.baseVal;
    const root=svg.getScreenCTM();
    if(root) {
      let left=box.x,right=box.x+box.width,top=Infinity,bottom=-Infinity;
      for(const node of svg.querySelectorAll<SVGGraphicsElement>(scoreFrameSelector)) {
        const visible=scoreInkBox(node,svg);
        if(!visible)continue;
        // Horizontal paper already includes engraving padding. Reserve stroke
        // edges, without adding another eight units beyond an otherwise fitting
        // final barline (Linux font metrics exposed spurious local scrolling).
        left=Math.min(left,visible.left-1);right=Math.max(right,visible.right+1);
        top=Math.min(top,visible.top-8);bottom=Math.max(bottom,visible.bottom+8);
      }
      // Preserve complete text boxes for selection, and also reserve shaped
      // accents/descenders if a font paints beyond that conservative body box.
      for(const span of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric tspan')){
        const ink=scoreInkBox(span,svg,true);if(!ink)continue;
        top=Math.min(top,ink.top-8);bottom=Math.max(bottom,ink.bottom+8);
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
