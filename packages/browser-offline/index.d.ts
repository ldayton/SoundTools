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
