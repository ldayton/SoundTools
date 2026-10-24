import { chromium, type Browser } from 'playwright';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateExercise, secondsAt, type ExerciseSpec } from '../src/music';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export type ExportStatus = 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled';
export interface ExportJob {
  id: string;
  status: ExportStatus;
  progress: number;
  stage: string;
  error: string | null;
  directory: string;
  file: string;
  createdAt: number;
  cancel: () => void;
}
export const jobs = new Map<string, ExportJob>();
let reserving = false;
export async function hasFfmpeg() {
  try {
    await promisify(execFile)(ffmpeg, ['-version']);
    return true;
  } catch {
    return false;
  }
}
export function publicJob(job: ExportJob) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
  };
}
export async function startExport(spec: ExerciseSpec, height: 720 | 1080, baseURL: string) {
  if (
    reserving ||
    [...jobs.values()].some((j) => j.status === 'queued' || j.status === 'rendering')
  )
    throw new Error('Another video is rendering. Wait for it to finish, or cancel it first.');
  reserving = true;
  try {
    if (!(await hasFfmpeg()))
      throw new Error('FFmpeg is missing. Install FFmpeg and restart DoReGo to export video.');
    const directory = await mkdtemp(join(tmpdir(), 'dorego-'));
    const job: ExportJob = {
      id: randomUUID(),
      status: 'queued',
      progress: 0,
      stage: 'Opening the renderer',
      error: null,
      directory,
      file: join(directory, 'dorego.mp4'),
      createdAt: Date.now(),
      cancel() {},
    };
    jobs.set(job.id, job);
    void render(job, spec, height, baseURL);
    return job;
  } finally {
    reserving = false;
  }
}
async function render(job: ExportJob, spec: ExerciseSpec, height: 720 | 1080, baseURL: string) {
  const cancelled = () => job.status === 'cancelled';
  let browser: Browser | null = null;
  let encoder: ChildProcess | null = null;
  job.cancel = () => {
    if (!['queued', 'rendering'].includes(job.status)) return;
    job.status = 'cancelled';
    job.stage = 'Export cancelled';
    encoder?.kill('SIGTERM');
    void browser?.close();
  };
  try {
    job.status = 'rendering';
    const exercise = generateExercise(spec);
    const width = height === 1080 ? 1920 : 1280,
      fps = 30;
    const duration = secondsAt(exercise.totalBeats, spec.bpm) + 0.8;
    const totalFrames = Math.ceil(duration * fps);
    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    if (cancelled()) return;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${baseURL}/render.html`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!window.doregoRenderer);
    await page.evaluate(
      ({ spec, width, height }) => window.doregoRenderer.init(spec, width, height),
      { spec, width, height }
    );
    job.stage = 'Rendering the audio track';
    const audio = await page.evaluate(() => window.doregoRenderer.audio());
    await writeFile(join(job.directory, 'audio.wav'), Buffer.from(audio, 'base64'));
    if (cancelled()) return;
    job.progress = 0.05;
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      '-framerate',
      String(fps),
      '-i',
      'pipe:0',
      '-i',
      join(job.directory, 'audio.wav'),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-t',
      String(totalFrames / fps),
      job.file,
    ];
    encoder = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let errorOutput = '';
    encoder.stderr?.on('data', (data) => {
      errorOutput = (errorOutput + String(data)).slice(-4000);
    });
    encoder.stdin!.on('error', () => {});
    const done = new Promise<void>((resolve, reject) => {
      encoder!.on('error', reject);
      encoder!.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Video encoding failed (${code}). ${errorOutput}`))
      );
    });
    // Attach immediately: a process can fail while frames are still being produced.
    void done.catch(() => {});
    const canvas = page.locator('#render');
    for (let frame = 0; frame < totalFrames; frame++) {
      if (cancelled()) return;
      await page.evaluate((time) => window.doregoRenderer.frame(time), frame / fps);
      const png = await canvas.screenshot({ type: 'png', animations: 'disabled', timeout: 30000 });
      await new Promise<void>((resolve, reject) =>
        encoder!.stdin!.write(png, (error) => (error ? reject(error) : resolve()))
      );
      job.progress = 0.05 + (0.9 * (frame + 1)) / totalFrames;
      job.stage = `Rendering frame ${frame + 1} of ${totalFrames}`;
    }
    job.stage = 'Finishing your MP4';
    encoder.stdin!.end();
    await done;
    if (cancelled()) return;
    job.status = 'complete';
    job.stage = 'Your video is ready';
    job.progress = 1;
  } catch (error) {
    if (job.status !== 'cancelled') {
      job.status = 'failed';
      job.stage = 'Export failed';
      job.error = error instanceof Error ? error.message : 'Could not export this exercise.';
      if (job.error.includes("Executable doesn't exist"))
        job.error =
          'Chromium is missing. Run npm run setup:browser in the DoReGo directory, then try again.';
    }
  } finally {
    encoder?.kill('SIGTERM');
    await browser?.close().catch(() => {});
    await rm(join(job.directory, 'audio.wav'), { force: true }).catch(() => {});
    if (job.status !== 'complete')
      await rm(job.directory, { recursive: true, force: true }).catch(() => {});
  }
}
const cleanup = setInterval(() => {
  for (const [id, job] of jobs)
    if (
      !['queued', 'rendering'].includes(job.status) &&
      Date.now() - job.createdAt > 60 * 60 * 1000
    ) {
      jobs.delete(id);
      void rm(job.directory, { recursive: true, force: true });
    }
}, 60 * 1000);
cleanup.unref();
export async function shutdownExports() {
  for (const job of jobs.values()) job.cancel();
  await Promise.all(
    [...jobs.values()].map((job) => rm(job.directory, { recursive: true, force: true }))
  );
}
