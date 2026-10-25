// Render both existing SVG marks consistently. Run: node scripts/generate-branding.cjs
// Playwright is already a workspace development dependency; no image tooling is required.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch();
 try {
  const page = await browser.newPage();
  for (const [directory, svg, background] of [
   ['apps/dorego/public', 'icon.svg', '#f5f3ec'],
   ['apps/soundglow/dist', 'favicon.svg', '#080b10'],
  ]) {
   const folder = path.resolve(__dirname, '..', directory);
   const source = fs.readFileSync(path.join(folder, svg), 'utf8');
   async function render(size, maskable = false) {
    const data = await page.evaluate(async ({ source, size, background, maskable }) => {
     const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
     const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
     const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
     await image.decode();
     const inset = maskable ? size * .1 : 0;
     ctx.drawImage(image, inset, inset, size - inset * 2, size - inset * 2);
     return canvas.toDataURL('image/png').split(',')[1];
    }, { source, size, background, maskable });
    return Buffer.from(data, 'base64');
   }
   for (const [size, name, maskable] of [[48,'favicon-48.png'],[180,'apple-touch-icon.png'],[192,'icon-192.png'],[512,'icon-512.png'],[1024,'icon-maskable.png',true]]) {
    fs.writeFileSync(path.join(folder,name),await render(size,maskable));
   }
   // ICO supports multiple embedded PNG images for each browser display density.
   const sizes = [16,32,48], images = [];
   for (const size of sizes) images.push(await render(size));
   const header = Buffer.alloc(6 + 16 * sizes.length); header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
   let offset = header.length;
   images.forEach((bytes,index) => {
    const at = 6 + index * 16; header[at] = header[at+1] = sizes[index];
    header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
    header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset += bytes.length;
   });
   fs.writeFileSync(path.join(folder,'favicon.ico'),Buffer.concat([header,...images]));
  }
 } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
