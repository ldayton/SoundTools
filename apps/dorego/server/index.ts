import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { generateExercise } from '../src/music';
import { hasFfmpeg, jobs, publicJob, shutdownExports, startExport } from './exporter';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const app = express();
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer between 1024 and 65535.');
const baseURL = `http://127.0.0.1:${port}`;
app.disable('x-powered-by');
app.use((req, res, next) => {
  // Keep this local rendering service inaccessible to cross-origin pages and DNS rebinding.
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host || '')) {
    res.status(403).json({ error: 'Use the local DoReGo URL.' });
    return;
  }
  if (req.headers.origin && ![baseURL, `http://localhost:${port}`].includes(req.headers.origin)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    return;
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, ffmpeg: await hasFfmpeg() });
});
app.post('/api/exports', async (req, res) => {
  try {
    const { spec } = generateExercise(req.body.spec);
    const height = req.body.height ?? 720;
    if (height !== 720 && height !== 1080) {
      res.status(400).json({ error: 'Choose 720p or 1080p.' });
      return;
    }
    const job = await startExport(spec, height, baseURL);
    res.status(202).json(publicJob(job));
  } catch (error) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'Could not start export.' });
  }
});
app.get('/api/exports/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'This export has expired. Create a new video.' });
    return;
  }
  res.json(publicJob(job));
});
app.delete('/api/exports/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Export not found.' });
    return;
  }
  job.cancel();
  res.json(publicJob(job));
});
app.get('/api/exports/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'complete') {
    res.status(404).json({ error: 'This video is not ready or has expired.' });
    return;
  }
  res.download(job.file, 'DoReGo-exercise.mp4');
});
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API route.' });
});
if (process.env.NODE_ENV === 'production') app.use(express.static(join(root, 'dist')));
else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'mpa' });
  app.use(vite.middlewares);
}
app.use(
  (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: error.message || 'Invalid request.' });
  }
);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`\n  DoReGo → ${baseURL}\n  Local vocal exercise studio. Press Ctrl+C to stop.\n`);
});
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await shutdownExports();
  server.close();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
