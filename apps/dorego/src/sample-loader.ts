// A single budget across instruments and overlapping exercise preparations.
// Running decodes keep their slot until completion: Web Audio cannot abort them.
export class SampleLoader {
  private needed = new Map<string, Set<string>>();
  private jobs = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<unknown>;
      run: () => Promise<void>;
      reject: (reason: unknown) => void;
      started: boolean;
    }
  >();
  private active = 0;
  constructor(private limit = 4) {}

  has(key: string) {
    return this.jobs.has(key);
  }

  select(scope: string, keys: Iterable<string>) {
    this.needed.set(scope, new Set(keys));
    for (const [key, job] of this.jobs) {
      if ([...this.needed.values()].some((needed) => needed.has(key))) continue;
      job.controller.abort();
      if (!job.started) job.reject(new DOMException('Superseded sample load', 'AbortError'));
      this.jobs.delete(key);
    }
  }

  load<T>(key: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const existing = this.jobs.get(key);
    if (existing) return existing.promise as Promise<T>;
    const controller = new AbortController();
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const job = {
      controller,
      promise,
      reject,
      started: false,
      run: async () => {
        try {
          controller.signal.throwIfAborted();
          const result = await task(controller.signal);
          controller.signal.throwIfAborted();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          if (this.jobs.get(key) === job) this.jobs.delete(key);
          this.active--;
          this.pump();
        }
      },
    };
    this.jobs.set(key, job);
    this.pump();
    return promise;
  }

  private pump() {
    for (const job of this.jobs.values()) {
      if (this.active >= this.limit) break;
      if (job.started) continue;
      job.started = true;
      this.active++;
      void job.run();
    }
  }
}
export const sampleLoader = new SampleLoader();
