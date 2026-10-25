/** Embed the shared runtime after defining CONFIG.base in a generated service worker. */
export function workerSource(): string;

export interface Resources {
  deadline<T>(
    ms: number,
    action: (signal: AbortSignal) => Promise<T> | T,
    signal?: AbortSignal,
  ): Promise<T>;
  fetchBytes(
    url: string,
    options?: {
      signal?: AbortSignal;
      bytes?: number;
      sha256?: string;
      attempts?: number;
      timeoutMs?: number;
      idleMs?: number;
      retryMs?: number;
      onRetry?: (attempt: number, reason: string) => void;
    },
  ): Promise<ArrayBuffer>;
  verify(
    bytes: ArrayBuffer | Uint8Array,
    file: { bytes?: number; sha256?: string },
  ): Promise<void>;
  digest(bytes: ArrayBuffer | Uint8Array): Promise<string>;
  fault(reason: string, message: string): Error;
  busy(): boolean;
}
export function createResources(env?: unknown): Resources;

export function createUpdatePolicy(options: {env?: unknown; app: string; current: string; apply?: (version:string) => void}): {offer(next: string): boolean; dispose(): void};

export function createWorkerSession(options: {env?: unknown; resources: Resources}): {call<T=unknown>(type:string, data?:Record<string,unknown>, timeout?:number, signal?:AbortSignal):Promise<T>;settle(registration:ServiceWorkerRegistration|undefined, timeout?:number):Promise<void>;reset(reason?:unknown):void;abort(reason?:unknown):void;generation():number;signal():AbortSignal};

/** Inline first-interaction tracking and a dependency-free startup retry. */
export function startupHTML(): string;

export function applyUpdate(version:string, env?:unknown):void;
