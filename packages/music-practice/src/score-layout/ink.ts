import {anchorScoreInk} from './vertical';
const ns = 'http://www.w3.org/2000/svg';
let maskId = 0;

/** Preserve musical geometry while correcting the renderer's ink layering. */
export function normalizeScoreInk(svg: SVGSVGElement) {
  for (const wrapper of svg.querySelectorAll<SVGGElement>('.abcjs-staff-wrapper')) {
    const screen = wrapper.getScreenCTM();
    if (!screen) continue;
    let layer = wrapper.querySelector<SVGGElement>(':scope > .score-ledger-layer');
    for (const ledger of wrapper.querySelectorAll<SVGGraphicsElement>('.abcjs-ledger')) {
      if (ledger.parentElement === layer) continue;
      const style = getComputedStyle(ledger);
      if (style.visibility !== 'visible' || style.display === 'none') continue;
      const transform = ledger.getScreenCTM();
      if (!transform || !ledger.getBoundingClientRect().width) continue;
      const matrix = screen.inverse().multiply(transform);
      if (!layer) {
        layer = document.createElementNS(ns, 'g');
        layer.classList.add('score-ledger-layer');
        wrapper.prepend(layer);
      }
      anchorScoreInk(ledger,ledger.parentElement!);
      ledger.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
      layer.append(ledger);
    }
    // Mask only the six-string staff. The numbers themselves retain their
    // original position and paint, including held-note continuation digits.
    for (const staff of wrapper.querySelectorAll<SVGGElement>(':scope > .abcjs-staff')) {
      if (staff.querySelectorAll(':scope > path').length !== 6) continue;
      const transform = staff.getScreenCTM();
      if (!transform) continue;
      const bounds = staff.getBBox(), inverse = transform.inverse();
      const gaps: {x:number;y:number;width:number;height:number}[] = [];
      for (const text of wrapper.querySelectorAll<SVGGraphicsElement>('.abcjs-tabNumber text,.tab-rhythm-continuation')) {
        if (getComputedStyle(text).visibility !== 'visible') continue;
        const matrix = text.getScreenCTM();
        if (!matrix) continue;
        const box = text.getBBox(), relative = inverse.multiply(matrix);
        const a = new DOMPoint(box.x, box.y).matrixTransform(relative);
        const b = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(relative);
        const center = (a.y + b.y) / 2;
        if (center < bounds.y - bounds.height / 10 || center > bounds.y + bounds.height * 1.1) continue;
        gaps.push({x:a.x-1.5,y:a.y-1,width:b.x-a.x+3,height:b.y-a.y+2});
      }
      if (!gaps.length) continue;
      const old = staff.getAttribute('data-score-tab-mask');
      if (old) svg.querySelector(`[id="${old}"]`)?.remove();
      let defs = svg.querySelector('defs');
      if (!defs) { defs = document.createElementNS(ns, 'defs'); svg.prepend(defs); }
      const mask = document.createElementNS(ns, 'mask'), id = `score-tab-lines-${++maskId}`;
      mask.id = id;
      mask.classList.add('score-tab-line-mask');
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
      const rect = (box:{x:number;y:number;width:number;height:number}, fill:string) => {
        const node = document.createElementNS(ns, 'rect');
        for (const key of ['x','y','width','height'] as const) node.setAttribute(key, String(box[key]));
        node.setAttribute('fill', fill); node.setAttribute('stroke', 'none'); mask.append(node);
      };
      const area = {x:bounds.x-4,y:bounds.y-4,width:bounds.width+8,height:bounds.height+8};
      for (const key of ['x','y','width','height'] as const) mask.setAttribute(key, String(area[key]));
      rect(area, 'white');
      for (const gap of gaps) rect(gap, 'black');
      defs.append(mask);
      staff.setAttribute('mask', `url(#${id})`);
      staff.setAttribute('data-score-tab-mask', id);
    }
  }
}
