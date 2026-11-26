import {
  planPianoPhrase,
  validatePianoPlanningInput,
  type PianoPhraseNote,
  type PianoPhraseProfile,
  type PianoPhrasePlan,
} from "./piano-phrase-fingering";
export const pianoPlanningVersion = "classic-phrase-v1";
export type PianoPlanningInput = {
  notes: readonly PianoPhraseNote[];
  profile?: PianoPhraseProfile;
};
export type PianoPlanningBackend = (
  input: PianoPlanningInput,
) => Promise<PianoPhrasePlan>;
export type PianoPlanningReply =
  | { status: "ready"; plan: PianoPhrasePlan; key: string; cached: boolean }
  | { status: "stale" };
/** Cache only musical planning inputs. Visual state, font size, hidden staves,
 * playback position and practice-speed overrides do not belong in this input. */
export function pianoPlanningKey(
  input: PianoPlanningInput,
  version = pianoPlanningVersion,
) {
  const p = input.profile ?? {};
  const notes = [...input.notes]
    .sort(
      (a, b) =>
        a.hand.localeCompare(b.hand) ||
        a.start - b.start ||
        a.id.localeCompare(b.id),
    )
    .map((n) => [
      n.id,
      n.hand,
      n.midi,
      n.start,
      n.duration,
      n.finger ?? null,
      n.tieFrom ?? null,
      n.voice ?? null,
      n.phraseStart ?? false,
      n.notatedDuration ?? null,
    ]);
  const profile = [
    p.model ?? "classic",
    p.bpm ?? 120,
    p.maxSpan ?? 7,
    p.allowSubstitutions ?? false,
    p.maxNotes ?? 4000,
    p.maxCandidates ?? 100000,
    p.maxFrames ?? 8000,
    p.maxTransitions ?? 2000000,
    Object.entries(p.weights ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ];
  return JSON.stringify([version, notes, profile], (_, v) =>
    typeof v === "number" && !Number.isFinite(v) ? String(v) : v,
  );
}
const restoreOrder = (source: PianoPlanningInput, stored: PianoPhrasePlan) => {
  const plan = structuredClone(stored),
    byId = new Map(plan.notes.map((n) => [n.id, n]));
  plan.notes = source.notes.flatMap((n) =>
    byId.has(n.id) ? [byId.get(n.id)!] : [],
  );
  for (const hand of ["right", "left"] as const)
    plan.hands[hand].notes = plan.notes.filter((n) => n.hand === hand);
  return plan;
};
const immediateCache = new Map<string, PianoPhrasePlan>();
/** Shared synchronous entry for current score rendering and classic workers.
 * The asynchronous service below accepts the same input/result contract. */
export function planPianoInput(input: PianoPlanningInput): PianoPhrasePlan {
  validatePianoPlanningInput(input.notes, input.profile);
  if (input.notes.length > 8000)
    return planPianoPhrase(input.notes, input.profile);
  const key = pianoPlanningKey(input),
    cached = immediateCache.get(key);
  if (cached) {
    immediateCache.delete(key);
    immediateCache.set(key, cached);
    return restoreOrder(input, cached);
  }
  const plan = planPianoPhrase(input.notes, input.profile);
  immediateCache.set(key, structuredClone(plan));
  while (immediateCache.size > 16)
    immediateCache.delete(immediateCache.keys().next().value!);
  return plan;
}
/** Serial/coalesced planning: at most one running job and the newest queued
 * request. Older callers receive stale, even when replies arrive successfully.
 * Cached plans are cloned on both boundaries so a renderer cannot corrupt them.
 */
export function createPianoPlanningService(
  options: {
    backend?: PianoPlanningBackend;
    version?: string;
    maxEntries?: number;
  } = {},
) {
  const backend = options.backend ?? (async (input) => planPianoInput(input)),
    version = options.version ?? pianoPlanningVersion,
    maxEntries = options.maxEntries ?? 16;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 64)
    throw Error("Invalid piano plan cache bound");
  const cache = new Map<string, PianoPhrasePlan>();
  let latest = 0,
    epoch = 0,
    running: Promise<void> | undefined;
  const clone = (p: PianoPhrasePlan) => structuredClone(p);
  const read = (key: string) => {
    const p = cache.get(key);
    if (!p) return;
    cache.delete(key);
    cache.set(key, p);
    return clone(p);
  };
  return {
    async request(source: PianoPlanningInput): Promise<PianoPlanningReply> {
      validatePianoPlanningInput(source.notes, source.profile);
      const generation = ++latest;
      // Preserve the core's global-limit diagnostic before cloning, sorting or
      // transferring an arbitrarily oversized score. These replies are uncached.
      if (source.notes.length > 8000)
        return {
          status: "ready",
          plan: planPianoPhrase(source.notes, source.profile),
          key: JSON.stringify([version, "global-limit", source.notes.length]),
          cached: false,
        };
      const requestEpoch = epoch,
        input = structuredClone(source),
        key = pianoPlanningKey(input, version);
      let cached = read(key);
      if (cached)
        return {
          status: "ready",
          plan: restoreOrder(input, cached),
          key,
          cached: true,
        };
      if (running) await running;
      if (generation !== latest) return { status: "stale" };
      cached = read(key);
      if (cached)
        return {
          status: "ready",
          plan: restoreOrder(input, cached),
          key,
          cached: true,
        };
      let release!: () => void;
      running = new Promise<void>((resolve) => (release = resolve));
      try {
        const result = await backend(input);
        if (requestEpoch === epoch) {
          cache.set(key, clone(result));
          while (cache.size > maxEntries)
            cache.delete(cache.keys().next().value!);
        }
        return generation === latest
          ? { status: "ready", plan: clone(result), key, cached: false }
          : { status: "stale" };
      } catch (error) {
        if (generation !== latest) return { status: "stale" };
        throw error;
      } finally {
        running = undefined;
        release();
      }
    },
    invalidate() {
      latest++;
      epoch++;
      cache.clear();
    },
    get cacheSize() {
      return cache.size;
    },
  };
}

export type PianoWorkerRequest = {
  id: number;
  version: string;
  input: PianoPlanningInput;
  configuration?: Readonly<Record<string, unknown>>;
};
export type PianoWorkerReply =
  | { id: number; ok: true; version: string; plan: PianoPhrasePlan }
  | { id: number; ok: false; error: string };
type PianoWorkerPort = {
  postMessage(message: PianoWorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<PianoWorkerReply>) => void,
  ): void;
  addEventListener(
    type: "error" | "messageerror",
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<PianoWorkerReply>) => void,
  ): void;
  removeEventListener(
    type: "error" | "messageerror",
    listener: (event: Event) => void,
  ): void;
  terminate(): void;
};
/** Worker lifecycle is owned by the consumer; close rejects every pending job. */
export function createPianoWorkerBackend(
  worker: PianoWorkerPort,
  options: {
    version?: string;
    configuration?: Readonly<Record<string, unknown>>;
  } = {},
) {
  const version = options.version ?? pianoPlanningVersion,
    configuration = structuredClone(options.configuration);
  let next = 0,
    failure: Error | undefined;
  const pending = new Map<
    number,
    { resolve: (plan: PianoPhrasePlan) => void; reject: (error: Error) => void }
  >();
  const onMessage = (event: MessageEvent<PianoWorkerReply>) => {
    const message = event.data,
      p = pending.get(message?.id);
    if (!p) return;
    pending.delete(message.id);
    if (!message.ok) p.reject(new Error(message.error));
    else if (message.version !== version)
      p.reject(new Error("Piano worker policy mismatch"));
    else p.resolve(message.plan);
  };
  const stop = (error: Error) => {
    if (failure) return;
    failure = error;
    worker.removeEventListener("message", onMessage);
    worker.removeEventListener("error", onFailure);
    worker.removeEventListener("messageerror", onFailure);
    worker.terminate();
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  const onFailure = (event: Event) => {
    event.preventDefault();
    const detail = "message" in event ? String(event.message) : event.type;
    stop(new Error("Piano worker failed: " + detail));
  };
  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onFailure);
  worker.addEventListener("messageerror", onFailure);
  return {
    backend: (input: PianoPlanningInput) =>
      new Promise<PianoPhrasePlan>((resolve, reject) => {
        if (failure) {
          reject(failure);
          return;
        }
        const id = ++next;
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, version, input, configuration });
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      }),
    close() {
      stop(new Error("Piano worker closed"));
    },
  };
}
