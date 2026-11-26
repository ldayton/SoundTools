import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Reuse the vetted Soundglow engine verbatim, with its source and notices.
 * The manifest declares Soundglow as a build dependency for CI/release selection. */
export function pitchAssets(): Plugin {
  const source = resolve('../soundglow');
  const files = new Map<string, string>([
    ...[
      'client.js',
      'processor.js',
      'worker.js',
      'speech-detector.js',
      'build-release/manifest.json',
      'build-release/praat-spectrogram.js',
      'build-release/praat-spectrogram.wasm',
      'source.tar.gz',
      'EMSCRIPTEN-LICENSE',
    ].map((file) => [file, resolve(source, 'dist/vendor/praat', file)] as [string, string]),
    ['praat-stream.js', resolve(source, 'dist/praat-stream.js')],
    ['LICENSE', resolve(source, 'LICENSE')],
    ['NOTICE', resolve(source, 'NOTICE')],
  ]);
  return {
    name: 'dorego-pitch-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files.get((req.url || '').split('?')[0].replace(/^.*\/pitch-engine\//, ''));
        if (!file) return next();
        res.setHeader(
          'Content-Type',
          file.endsWith('.wasm')
            ? 'application/wasm'
            : file.endsWith('.js')
              ? 'application/javascript'
              : file.endsWith('.json')
                ? 'application/json'
                : 'application/octet-stream'
        );
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [file, path] of files)
        this.emitFile({
          type: 'asset',
          fileName: 'pitch-engine/' + file,
          source: readFileSync(path),
        });
    },
  };
}
