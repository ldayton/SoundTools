// Local source preview: never reuse browser-cached code, including worker code.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.webm': 'audio/webm',
};
function createDevServer({ root = ROOT } = {}) {
  root = path.resolve(root);
  return http.createServer(async (request, response) => {
    // Deliberately omit validators and ignore conditional requests so even an
    // older cached script is replaced. Apply the policy to errors as well.
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD'); response.writeHead(405).end(); return;
    }
    try {
      const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      // Each HTML load gets a new asset namespace, including URLs resolved by
      // workers, worklets and fetch(). This also escapes pre-existing HTTP cache
      // entries whose old server headers cannot be changed retroactively.
      const name = requested.replace(/^\/__dev\/[a-f0-9]{16}\//, '/');
      if (name === '/') { response.writeHead(302, { Location: '/dist/index.html' }).end(); return; }
      let file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep) || name.includes('\0') || name.split('/').some(part => part.startsWith('.'))) {
        response.writeHead(403).end(); return;
      }
      if (name.endsWith('/')) file = path.join(file, 'index.html');
      let bytes = await fs.readFile(file);
      if (path.extname(file) === '.html') {
        const directory = name.endsWith('/') ? name : path.posix.dirname(name).replace(/\/$/, '') + '/';
        const html = bytes.toString();
        // Test/replay pages can live outside dist while deliberately resolving
        // the production assets against /dist/. Preserve that document base;
        // inserting a second base before it silently changes every asset URL.
        const existingBase = html.match(/<base\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/i);
        const documentURL = new URL(name, 'http://localhost');
        const assetBase = new URL(existingBase?.[2] || directory, documentURL);
        const href = assetBase.origin === documentURL.origin
          ? `/__dev/${randomBytes(8).toString('hex')}${assetBase.pathname}${assetBase.search}${assetBase.hash}`
          : assetBase.href;
        const base = `<base href="${href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
        bytes = Buffer.from(existingBase ? html.replace(existingBase[0], base) : /<head\b[^>]*>/i.test(html)
          ? html.replace(/<head\b[^>]*>/i, match => match + base)
          : html.replace(/^(\s*<!doctype[^>]*>)?/i, match => match + base));
      }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : error instanceof URIError ? 400 : 500).end();
    }
  });
}
if (require.main === module) {
  const at = process.argv.indexOf('--port');
  const port = at === -1 ? 8780 : Number(process.argv[at + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Choose a port from 1 to 65535');
  const server = createDevServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Soundglow: http://127.0.0.1:${port}/dist/index.html (cache disabled)`));
}
module.exports = { createDevServer };
