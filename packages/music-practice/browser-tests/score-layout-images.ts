import type {Page} from '@playwright/test';

/** Compare actual pixels independently of SVG bounds and layout-plan outputs.
 * A one-pixel ink-edge allowance absorbs antialiasing differences; moved or
 * missing strokes beyond that neighbourhood count in either direction. */
export async function compareLayoutPng(page:Page,expected:Buffer,actual:Buffer) {
  return page.evaluate(({expected,actual})=>window.ScoreLayoutFixture.compareLayoutPixels(expected,actual),
    {expected:expected.toString('base64'),actual:actual.toString('base64')});
}

export function layoutImageChanged(diff:Awaited<ReturnType<typeof compareLayoutPng>>) {
  return diff.changed>Math.max(2,diff.inkPixels*.001)||diff.expectedSize.some((value,i)=>Math.abs(value-diff.actualSize[i])>1);
}

/** Independent known images prove that the comparison itself detects damage.
 * Never construct its expected result with the score engine under test. */
export async function checkLayoutImageComparator(page:Page) {
  const images=await page.evaluate(()=>window.ScoreLayoutFixture.layoutComparatorSamples());
  const buffers=images.map(image=>Buffer.from(image,'base64'));
  const whitespace=await compareLayoutPng(page,buffers[0],buffers[4]);
  return {dimensionCrop:!!whitespace.afterCrop,identical:layoutImageChanged(await compareLayoutPng(page,buffers[0],buffers[0])),
    onePixel:layoutImageChanged(await compareLayoutPng(page,buffers[0],buffers[1])),
    moved:layoutImageChanged(await compareLayoutPng(page,buffers[0],buffers[2])),
    removed:layoutImageChanged(await compareLayoutPng(page,buffers[0],buffers[3])),
    whitespace:layoutImageChanged(whitespace)};
}
