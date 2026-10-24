import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_SPEC, generateExercise } from '../src/music';
import { exportMidi } from '../src/midi';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: 'string', short: 'o' },
    spec: { type: 'string' },
    height: { type: 'string', default: '720' },
    url: { type: 'string', default: 'http://127.0.0.1:4317' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'npm run export -- <midi|video> --output <file> [--spec exercise.json] [--height 720|1080] [--url http://127.0.0.1:4317]'
  );
} else {
  let jobId: string | undefined;
  let complete = false;
  const base = values.url!.replace(/\/$/, '');
  const cancel = async () => {
    if (jobId && !complete)
      await fetch(`${base}/api/exports/${jobId}`, { method: 'DELETE' }).catch(() => {});
  };
  const interrupt = () => {
    void cancel().finally(() => process.exit(130));
  };
  try {
    const [format, ...extra] = positionals;
    if (!['midi', 'video'].includes(format) || extra.length || !values.output)
      throw new Error('Choose midi or video and --output <file>. Use --help for options.');
    const exercise = generateExercise({
      ...DEFAULT_SPEC,
      ...(values.spec ? JSON.parse(await readFile(values.spec, 'utf8')) : {}),
    });
    if (format === 'midi') await writeFile(values.output, exportMidi(exercise));
    else {
      const height = Number(values.height);
      if (![720, 1080].includes(height)) throw new Error('Choose --height 720 or 1080.');
      const request = async (path: string, options?: RequestInit) => {
        const response = await fetch(`${base}${path}`, options);
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || `Export request failed (${response.status}).`);
        return data;
      };
      process.once('SIGINT', interrupt);
      const job = await request('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: exercise.spec, height }),
      });
      jobId = job.id;
      let stage = '';
      for (;;) {
        const job = await request(`/api/exports/${jobId}`);
        if (job.stage !== stage) {
          stage = job.stage;
          console.log(stage);
        }
        if (job.status === 'complete') break;
        if (['failed', 'cancelled'].includes(job.status))
          throw new Error(job.error || 'Export cancelled.');
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      const response = await fetch(`${base}/api/exports/${jobId}/download`);
      if (!response.ok) throw new Error('Could not download the finished video.');
      await writeFile(values.output, new Uint8Array(await response.arrayBuffer()));
      complete = true;
    }
    console.log(`Saved ${values.output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await cancel();
    process.removeListener('SIGINT', interrupt);
  }
}
