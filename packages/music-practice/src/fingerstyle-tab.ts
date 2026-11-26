import {isGuitarPositionMark} from "./edition-score";
import type { TuneObject } from "abcjs";

import {bluesPosition as fingerstylePosition} from "./fingerstyle-blues";
export {bluesPosition as fingerstylePosition} from "./fingerstyle-blues";

type TabNumber = { num: number | string; str: number; note: { pitch: number; pitchAltered: number } };
type TabResult = { notes?: TabNumber[]; graces?: TabNumber[] };
type Semantics = { clefTranspose?: number; notesToNumber(notes: unknown[], graces: unknown): TabResult };
type TabLine = { staffGroup: { staffs: { isTabStaff?: boolean; top: number }[] } };
type Plugin = { init(...args: unknown[]): void; render(renderer: unknown, line: TabLine, staffIndex: number): void; semantics: Semantics };
type PluginEntry = { classz: new () => Plugin };

/** Keep the original edition's string choices while abcjs lays out the tab. */
export function preserveFingerstyleTab(tune: TuneObject, transpose: number,positionFor:(pitch:number,chord:boolean,transpose:number,group?:readonly number[])=>{str:number;num:number}|undefined=fingerstylePosition) {
  const entries = (tune as TuneObject & { tablatures?: (PluginEntry | null)[] }).tablatures;
  for (const entry of entries || []) {
    if (!entry) continue;
    const Original = entry.classz;
    entry.classz = class extends Original {
      render(renderer: unknown, line: TabLine, staffIndex: number) {
        super.render(renderer, line, staffIndex);
        // The plugin includes the source's lower extent in both staff offsets.
        // Reserve seven pitch steps after that extent, without counting it twice.
        for (const staff of line.staffGroup.staffs)
          if (staff.isTabStaff) staff.top = 24;
      }
      init(...args: unknown[]) {
        super.init(...args);
        const automatic = this.semantics.notesToNumber.bind(this.semantics);
        this.semantics.notesToNumber = (notes, graces) => {
          // abcjs's guitar tuning already uses the written-to-sounding octave.
          // Its octave-clef adjustment would apply that shift a second time.
          const clefTranspose = this.semantics.clefTranspose;
          this.semantics.clefTranspose = 0;
          let result: TabResult;
          try { result = automatic(notes, graces); }
          finally { this.semantics.clefTranspose = clefTranspose; }
          for (const number of result.notes || []) {
            const position = positionFor(
              number.note.pitch + number.note.pitchAltered,
              (notes?.length || 0) > 1,
              transpose,
              (result.notes || []).map(n=>n.note.pitch+n.note.pitchAltered),
            );
            if (position) Object.assign(number, position);
          }
          return result;
        };
      }
    };
  }
}

/** Use one modern TAB sign per staff; abcjs duplicates it for the bass voice. */
export function normalizeFingerstyleTab(paper: HTMLElement,singleVoice=false) {
  const ns = "http://www.w3.org/2000/svg";
  for (const svg of paper.querySelectorAll("svg")) {
    const staff = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")]
      .sort((a, b) => a.getBBox().y - b.getBBox().y)[1];
    if (!staff) continue;
    svg.querySelectorAll('[data-name^="tab."]').forEach(node => node.remove());
    // The second voice duplicates bars, with its opening repeat at the clef.
    svg.querySelectorAll(singleVoice ? '.abcjs-bar.abcjs-v1' : '.abcjs-bar.abcjs-v2,.abcjs-bar.abcjs-v3').forEach(node => node.remove());
    const box = staff.getBBox();
    const bars = document.createElementNS(ns, "g");
    bars.classList.add("fingerstyle-tab-bars");
    for (const source of svg.querySelectorAll('.abcjs-bar.abcjs-v0')) {
      const dots = [...source.querySelectorAll<SVGGraphicsElement>('[data-name="dots.dot"]')];
      for (const path of source.querySelectorAll<SVGGraphicsElement>('[data-name="bar"]')) {
        const ink = path.getBBox();
        const bar = document.createElementNS(ns, "rect");
        bar.setAttribute("x", String(ink.x)); bar.setAttribute("y", String(box.y));
        bar.setAttribute("width", String(ink.width)); bar.setAttribute("height", String(box.height));
        bar.setAttribute("stroke", "none"); bars.append(bar);
      }
      dots.forEach((dot, index) => {
        const ink = dot.getBBox();
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(ink.x + ink.width / 2));
        circle.setAttribute("cy", String(box.y + box.height / 2 + (index % 2 ? -6 : 6)));
        circle.setAttribute("r", "1.7"); circle.setAttribute("stroke", "none"); bars.append(circle);
      });
    }
    staff.parentElement!.append(bars);
    const sign = document.createElementNS(ns, "g");
    sign.classList.add("fingerstyle-tab-clef");
    sign.setAttribute("aria-label", "Tablature");
    for (const [index, letter] of [..."TAB"].entries()) {
      const text = document.createElementNS(ns, "text");
      text.textContent = letter;
      text.setAttribute("x", String(box.x + 12));
      text.setAttribute("y", String(box.y + box.height * (index + 1) / 4 + 4));
      text.setAttribute("font-family", "sans-serif");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("paint-order", "stroke");
      text.setAttribute("stroke", "white");
      text.setAttribute("stroke-width", "3");
      sign.append(text);
    }
    // Keep the sign inside the staff wrapper so the tab-only crop applies too.
    staff.parentElement!.append(sign);
  }
}

/** Tab is a view of the same score; crop away its standard staff without changing timing. */
export function showOnlyTab(paper: HTMLElement,lyricPadding=58) {
  for (const [index, svg] of [...paper.querySelectorAll("svg")].entries()) {
    const staves = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")]
      .sort((a,b) => a.getBBox().y - b.getBBox().y);
    if (staves.length !== 2) continue;
    const tabBox = staves[1].getBBox();
    // A crop alone can expose bass stems when the two staves are close.
    // Hide the source notation explicitly; retain tab numbers and copied rests.
    staves[0].style.visibility = "hidden";
    svg.querySelectorAll<SVGElement>(
      '.abcjs-note:not(.abcjs-tabNumber):not(.tab-rhythm-rest),.abcjs-beam,.abcjs-slur,.abcjs-staff-extra'
    ).forEach(node => { node.style.visibility = "hidden"; });
    const top = tabBox.y - (index === 0 ? 104 : 80);
    const box = svg.viewBox.baseVal;
    const bottom = box.y + box.height;
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const clip = document.createElementNS(ns, "clipPath");
    const id = `fingerstyle-tab-${index}`;
    clip.id = id;
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(tabBox.y - 42));
    rect.setAttribute("width", String(box.width));
    rect.setAttribute("height", String(bottom - tabBox.y + 42));
    clip.append(rect); defs.append(clip);
    svg.querySelectorAll(":scope > g:not(.tab-rhythm):not(.tab-rhythm-rest)").forEach(group => group.setAttribute("clip-path", `url(#${id})`));
    const barClip=document.createElementNS(ns,'clipPath');
    const barId=`${id}-bars`;barClip.id=barId;
    const barRect=document.createElementNS(ns,'rect');
    barRect.setAttribute('x',String(box.x));barRect.setAttribute('y',String(tabBox.y));
    barRect.setAttribute('width',String(box.width));barRect.setAttribute('height',String(tabBox.height));
    barClip.append(barRect);defs.append(barClip);
    svg.querySelectorAll('.abcjs-bar,:scope > .abcjs-staff-wrapper > path').forEach(group=>group.setAttribute('clip-path',`url(#${barId})`));
    svg.append(defs);
    for (const part of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-bar-number')) {
      const box = part.getBBox();
      const copy = part.cloneNode(true) as SVGGraphicsElement;
      const rhythms = !!svg.querySelector('.tab-rhythm-stem');
      const offset=rhythms ? 48 : 20;
      copy.setAttribute('transform', `translate(0 ${tabBox.y - offset - box.y})`);
      part.remove();
      svg.append(copy);
    }
    const lyrics=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric')];
    const lyricTop=Math.min(...lyrics.map(lyric=>lyric.getBBox().y));
    for (const lyric of lyrics) {
      lyric.setAttribute('transform',`translate(0 ${tabBox.y+tabBox.height+lyricPadding-lyricTop})`);
      svg.append(lyric);
    }
    for (const chord of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-chord')) {
      const ink=chord.getBBox();
      chord.setAttribute('transform',`translate(0 ${tabBox.y-48-ink.y})`);
      svg.append(chord);
    }
    // One TAB symbol represents a shared event across notation voices.
    // abcjs can emit the same annotation in both voices at a system boundary.
    svg.querySelectorAll('.guitar-position,.guitar-fermata').forEach(node=>node.remove());
    const projected=new Set<string>();
    const duplicate=(source:SVGGraphicsElement,kind:string)=>{
      const ink=source.getBBox(),text=source.textContent||source.getAttribute('data-name')||'';
      // Match destination ink, including size: a genuinely different glyph
      // at the same anchor must not disappear. Millipixels ignore rounding.
      const key=kind+':'+text+':'+[ink.x,ink.width,ink.height].map(n=>Math.round(n*1000)).join(':');
      if(projected.has(key))return true;
      projected.add(key);return false;
    };
    for(const position of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-annotation')) {
      if(!isGuitarPositionMark(position.textContent||'')||duplicate(position,'position'))continue;
      const copy=position.cloneNode(true) as SVGGraphicsElement,ink=position.getBBox();
      copy.classList.add('guitar-position');copy.style.visibility='visible';
      copy.setAttribute('transform',`translate(0 ${tabBox.y-76-ink.y})`);svg.append(copy);
    }
    for(const source of svg.querySelectorAll<SVGGraphicsElement>('[data-name="scripts.ufermata"]')){
      if(duplicate(source,'fermata'))continue;
      const copy=source.cloneNode(true) as SVGGraphicsElement,ink=source.getBBox();
      copy.classList.add('guitar-fermata');copy.style.visibility='visible';
      copy.setAttribute('transform',`translate(0 ${tabBox.y-14-ink.y-ink.height})`);svg.append(copy);
    }
    svg.setAttribute("viewBox", `${box.x} ${top} ${box.width} ${bottom - top}`);
  }
}
