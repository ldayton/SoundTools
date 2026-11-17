import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const app = resolve(root, '../..');
const generated = resolve(app, 'work/piano-trial');

export default defineConfig({
  root,
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'local-piano-trial-assets',
      configureServer(server) {
        const manifest = JSON.parse(readFileSync(resolve(generated, 'manifest.json'), 'utf8'));
        const files = new Map<string, string>([
          ['/manifest.json', resolve(generated, 'manifest.json')],
        ]);
        for (const clip of manifest.clips) {
          for (const [profile, variant] of Object.entries(clip.variants)) {
            files.set(
              (variant as { url: string }).url,
              profile === 'stereo'
                ? resolve(
                    app,
                    `public/samples/bitklavier-web-v1/${clip.midi}-v${clip.layer}-2s.flac`
                  )
                : resolve(generated, `${clip.midi}-v${clip.layer}-${profile}.flac`)
            );
          }
        }
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] ?? '';
          const path = files.get(url);
          if (!path) {
            if (url.startsWith('/audio/')) {
              res.statusCode = 404;
              res.end();
              return;
            }
            next();
            return;
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405;
            res.end();
            return;
          }
          res.setHeader('Content-Type', url.endsWith('.json') ? 'application/json' : 'audio/flac');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Length', statSync(path).size);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          createReadStream(path)
            .on('error', () => res.destroy())
            .pipe(res);
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 4365,
    strictPort: true,
    fs: { allow: [resolve(app, '../..')] },
  },
});
