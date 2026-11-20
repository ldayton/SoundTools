import { failureKind, retryDelay } from "./retry";
import { Upload } from "tus-js-client";
import type { Account } from "./client";
import { FileStore, type FileJob } from "./file-store";

export const FILE_BUCKET = "soundtools-files";
export const MAX_CLOUD_FILE_BYTES = 50 * 1024 * 1024;
export type CloudFile = {
  id: string;
  user_id: string;
  app: string;
  fingerprint: string;
  name: string;
  mime: string;
  bytes: number;
  details: Record<string, unknown>;
  state: "pending" | "ready" | "deleted";
  rename_time?: number;
  rename_counter?: number;
  rename_device?: string;
  created_at: string;
  updated_at: string;
};
export type LocalFile = {
  id: string;
  fingerprint: string;
  name: string;
  mime: string;
  bytes: number;
  details: Record<string, unknown>;
  owner?: string;
  cloudId?: string;
  cloudOwner?: string;
};
export type FileAdapter = {
  list(): Promise<LocalFile[]>;
  read(id: string): Promise<Blob | null>;
  bind(id: string, cloudId: string, user: string): Promise<void>;
  save(file: CloudFile, blob: Blob): Promise<void>;
  remove(id: string): Promise<void>;
  fingerprint(blob: Blob): Promise<string>;
  changed(): Promise<void> | void;
  report(
    code: string,
    error?: unknown,
    details?: Record<string, unknown>,
  ): void;
};
const objectPath = (f: CloudFile) => `${f.user_id}/${f.app}/${f.id}`;
const live = (f: CloudFile) => f.state !== "deleted";

/** A small native Storage coordinator, shared by apps. Postgres owns the file
 * lifecycle; tus-js-client owns the resumable byte transfer. */
export class CloudFiles {
  rows: CloudFile[] = [];
  status = new Map<string, string>();
  private store?: FileStore;
  private actor = "";
  private epoch = 0;
  private running = false;
  private pending = false;
  private transfer?: Upload;
  private cancelTransfer?: () => void;
  private downloads = new Map<string, AbortController>();
  private downloadTasks = new Map<string, Promise<void>>();
  private failures = new Map<string, number>();
  private suppressedDownloads = new Set<string>();
  private listeners = new Set<() => void>();
  private initial: Promise<void>;
  constructor(
    private account: Account,
    readonly app: string,
    private adapter: FileAdapter,
  ) {
    this.initial = this.initialize().catch(async (error) => {
      this.adapter.report("files.queue_unavailable", error);
      await this.refreshActor(true).catch((error) =>
        this.adapter.report("files.library_refresh_failed", error),
      );
    });
  }
  get available() {
    return !!this.store;
  }
  get user() {
    return this.account.getSnapshot().user;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }
  private current(user: string, epoch: number) {
    return this.user === user && this.epoch === epoch;
  }
  private networkRetryAt = 0;
  private networkAttempts = 0;
  private nextCatalogueAt = 0;
  private online() {
    return (
      navigator.onLine &&
      !!this.account.native &&
      !["loading", "reauth"].includes(this.account.getSnapshot().status)
    );
  }
  private async initialize() {
    let syncedAt = 0;
    this.account.subscribe(() => {
      const next = this.account.getSnapshot().lastSyncedAt || 0;
      if (next !== syncedAt) {
        syncedAt = next;
        this.nextCatalogueAt = 0;
      }
      void this.refreshActor().catch((error) =>
        this.adapter.report("files.queue_failed", error),
      );
    });
    this.store = await FileStore.open();
    for (const name of ["online", "focus"])
      window.addEventListener(name, () => {
        void this.retry();
      });
    window.addEventListener("offline", () => this.stopTransfers());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.retry();
    });
    setInterval(() => {
      if (!document.hidden) void this.kick();
    }, 1000);
    await this.refreshActor(true);
  }
  private stopTransfers() {
    void this.transfer?.abort(false).catch(() => {});
    this.cancelTransfer?.();
    this.cancelTransfer = undefined;
    for (const controller of this.downloads.values()) controller.abort();
    this.downloads.clear();
  }
  private async refreshActor(force = false) {
    const user = this.user;
    if (force || user !== this.actor) {
      this.actor = user;
      ++this.epoch;
      this.stopTransfers();
      this.rows = [];
      this.status.clear();
      const epoch = this.epoch;
      if (user) {
        const cache = this.store
          ? await this.store.get<{ rows: CloudFile[] }>(
              "catalogues",
              `${user}:${this.app}`,
            )
          : undefined;
        if (this.current(user, epoch)) this.rows = cache?.rows || [];
      }
      if (!this.current(user, epoch)) return;
      await this.adapter.changed();
      this.publish();
    }
    if (this.account.getSnapshot().status === "reauth") this.stopTransfers();
    else void this.kick();
  }
  private async rpc<T>(name: string, args: object): Promise<T> {
    const connection = this.account.native;
    if (!connection) throw Error("Sign in to sync files.");
    const { data, error, status } = await connection.client.rpc(name, args);
    if (error) throw Object.assign(error, { status });
    return data as T;
  }
  private async snapshot(user: string, epoch: number) {
    const rows: CloudFile[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await this.account
        .native!.client.rpc("media_snapshot", { p_app: this.app })
        .range(start, start + 499);
      if (error) throw error;
      rows.push(...(data as CloudFile[]));
      if (data.length < 500) break;
    }
    if (!this.current(user, epoch)) return;
    // Keep offline edits visible while a fresh catalogue is being reconciled.
    for (const job of await this.store!.jobs(user, this.app)) {
      const row = rows.find((f) => f.id === job.fileId);
      if (row && job.kind === "delete") row.state = "deleted";
      if (row && job.kind === "rename" && live(row)) row.name = job.name!;
    }
    if (!this.current(user, epoch)) return;
    this.rows = rows;
    await this.store!.put("catalogues", { id: `${user}:${this.app}`, rows });
    const locals = await this.adapter.list();
    for (const file of locals) {
      if (
        file.cloudOwner === user &&
        rows.some((r) => r.id === file.cloudId && r.state === "deleted")
      ) {
        if (!this.current(user, epoch)) return;
        await this.adapter.remove(file.id);
      }
    }
    await this.adapter.changed();
    this.publish();
  }
  private latestDelete(fingerprint: string) {
    return (
      this.rows
        .filter((f) => f.state === "deleted" && f.fingerprint === fingerprint)
        .sort(
          (a, b) =>
            b.updated_at.localeCompare(a.updated_at) ||
            b.id.localeCompare(a.id),
        )[0]?.id || null
    );
  }
  async imported(id?: string) {
    await this.initial;
    const user = this.user,
      epoch = this.epoch;
    if (!user || !this.store) return;
    const locals = await this.adapter.list();
    for (const f of locals) {
      if (!this.current(user, epoch)) return;
      if (
        (id && id !== f.id) ||
        (f.owner && f.owner !== user) ||
        (f.cloudOwner && f.cloudOwner !== user)
      )
        continue;
      if (f.bytes > MAX_CLOUD_FILE_BYTES) {
        this.status.set(f.id, "Local only · over 50 MB");
        continue;
      }
      if (!f.fingerprint) {
        this.status.set(f.id, "Local only · audio unavailable");
        continue;
      }
      if (f.cloudId && this.rows.some((r) => r.id === f.cloudId)) continue;
      const job: FileJob = {
        id: `${user}:${this.app}:upload:${f.id}`,
        user,
        app: this.app,
        kind: "upload",
        localId: f.id,
        deletedId: this.latestDelete(f.fingerprint),
      };
      if (!(await this.store!.get("jobs", job.id)))
        await this.store!.put("jobs", job);
    }
    this.publish();
    void this.kick();
  }
  async retry() {
    this.failures.clear();
    await this.initial;
    await this.kick();
  }
  private async kick() {
    if (
      !this.store ||
      !this.user ||
      !this.online() ||
      Date.now() < this.networkRetryAt
    )
      return;
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    try {
      if (navigator.locks)
        await navigator.locks.request(
          `soundtools-files:${this.app}:${this.user}`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await this.run();
          },
        );
      else await this.run();
    } catch (error) {
      this.networkAttempts++;
      this.networkRetryAt = Date.now() + retryDelay(this.networkAttempts);
      this.adapter.report("files.sync_failed", error, {
        attempt: this.networkAttempts,
      });
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        setTimeout(() => void this.kick(), 0);
      }
    }
  }
  private async run() {
    const user = this.user,
      epoch = this.epoch;
    const scheduled = await this.store!.jobs(user, this.app);
    if (
      Date.now() < this.nextCatalogueAt &&
      !scheduled.some((job) => !job.retryAt || job.retryAt <= Date.now())
    )
      return;
    await this.snapshot(user, epoch);
    this.networkAttempts = 0;
    this.networkRetryAt = 0;
    this.nextCatalogueAt = Date.now() + 25000 + Math.random() * 10000;
    if (!this.current(user, epoch)) return;
    // Adopt existing local imports once. A bound deleted file is never re-created.
    await this.importedWithoutKick();
    const jobs = await this.store!.jobs(user, this.app);
    const priority = { delete: 0, download: 1, rename: 2, upload: 3 };
    jobs.sort((a, b) => priority[a.kind] - priority[b.kind]);
    for (const job of jobs) {
      if (!this.current(user, epoch) || !this.online()) return;
      if (
        Math.max(this.failures.get(job.id) || 0, job.retryAt || 0) > Date.now()
      )
        continue;
      try {
        const queued = await this.store!.get<FileJob>("jobs", job.id);
        if (!queued || queued.revision !== job.revision) continue;
        if (
          job.kind === "download" &&
          this.suppressedDownloads.has(job.fileId!)
        )
          continue;
        const deleted = this.rows.some(
          (f) => f.id === job.fileId && f.state === "deleted",
        );
        if (deleted && job.kind !== "delete") {
          await this.store!.remove("jobs", job.id);
          continue;
        }
        if (job.kind === "upload") await this.upload(job, user, epoch);
        else if (job.kind === "download") await this.downloadOnce(job.fileId!);
        else if (job.kind === "rename") {
          const renamed = await this.rpc<CloudFile>("media_rename_v2", {
            p_id: job.fileId,
            p_name: job.name,
            p_stamp: job.stamp ?? null,
          });
          const currentJob = await this.store!.get<FileJob>("jobs", job.id);
          if (
            this.current(user, epoch) &&
            currentJob?.revision === job.revision
          )
            this.rows = this.rows.map((file) =>
              file.id === renamed.id ? renamed : file,
            );
        } else await this.rpc("media_delete", { p_id: job.fileId });
        if (!this.current(user, epoch)) return;
        await this.store!.complete(job);
        this.status.delete(job.localId || job.fileId!);
        this.failures.delete(job.id);
      } catch (error) {
        if (
          job.kind === "download" &&
          this.suppressedDownloads.has(job.fileId!)
        )
          continue;
        const queued = await this.store!.get<FileJob>("jobs", job.id);
        if (!queued || queued.revision !== job.revision) continue;
        if (!this.current(user, epoch) || !navigator.onLine) return;
        const retired =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "PT409";
        this.status.set(
          job.localId || job.fileId!,
          retired
            ? "Deleted elsewhere · Import again"
            : "Saved locally · resumes automatically",
        );
        job.attempts = (job.attempts || 0) + 1;
        job.retryAt =
          Date.now() +
          (retired || failureKind(error) === "permanent"
            ? 86400000
            : retryDelay(job.attempts));
        this.failures.set(job.id, job.retryAt);
        const latest = await this.store!.get<FileJob>("jobs", job.id);
        if (latest?.revision === job.revision) await this.store!.delay(job);

        this.adapter.report("files.transfer_failed", error, {
          fileOperation: job.kind,
          attempt: job.attempts,
        });
      }
      this.publish();
    }
    if (!this.current(user, epoch)) return;
    await this.snapshot(user, epoch);
    const removals = await this.rpc<CloudFile[]>("media_pending_deletes", {
      p_app: this.app,
    });
    for (const file of removals) {
      if (!this.current(user, epoch)) return;
      const { error } = await this.account
        .native!.client.storage.from(FILE_BUCKET)
        .remove([objectPath(file)]);
      if (error)
        this.adapter.report("files.delete_pending", error, {
          fileOperation: "delete",
        });
    }
  }
  private async importedWithoutKick() {
    const user = this.user;
    for (const f of await this.adapter.list()) {
      if (
        (f.owner && f.owner !== user) ||
        (f.cloudOwner && f.cloudOwner !== user)
      )
        continue;
      if (f.bytes > MAX_CLOUD_FILE_BYTES) {
        this.status.set(f.id, "Local only · over 50 MB");
        continue;
      }
      if (!f.fingerprint) {
        this.status.set(f.id, "Local only · audio unavailable");
        continue;
      }
      if (f.cloudId) continue;
      const job: FileJob = {
        id: `${user}:${this.app}:upload:${f.id}`,
        user,
        app: this.app,
        kind: "upload",
        localId: f.id,
        deletedId: this.latestDelete(f.fingerprint),
      };
      if (!(await this.store!.get("jobs", job.id)))
        await this.store!.put("jobs", job);
    }
  }
  private async upload(job: FileJob, user: string, epoch: number) {
    const local = (await this.adapter.list()).find((f) => f.id === job.localId);
    if (!local) return;
    let file = local.cloudId
      ? this.rows.find((f) => f.id === local.cloudId)
      : undefined;
    if (file?.state === "deleted") return;
    if (!file)
      file = await this.rpc<CloudFile>("media_reserve", {
        p_app: this.app,
        p_fingerprint: local.fingerprint,
        p_name: local.name,
        p_mime: local.mime || "application/octet-stream",
        p_bytes: local.bytes,
        p_details: local.details,
        p_previous_delete: job.deletedId || null,
      });
    if (!this.current(user, epoch)) return;
    await this.adapter.bind(local.id, file.id, user);
    if (!this.rows.some((f) => f.id === file!.id)) this.rows.push(file);
    await this.adapter.changed();
    this.publish();
    if (file.state !== "ready") {
      const blob = await this.adapter.read(local.id);
      if (!blob) {
        // The user may remove an import while its reservation is in flight.
        // Retire that path instead of leaving a permanent phantom upload.
        await this.rpc("media_delete", { p_id: file.id });
        return;
      }
      if (blob.size !== file.bytes)
        throw Error("Original file is unavailable.");
      this.status.set(local.id, "Uploading…");
      this.publish();
      try {
        await this.send(blob, file, user, epoch, local.id);
      } catch (error) {
        // Another browser may have finished the identical, immutable object.
        if (!this.current(user, epoch)) throw error;
        file = await this.rpc<CloudFile>("media_finish", { p_id: file.id });
      }
      if (!this.current(user, epoch)) return;
      await this.rpc("media_finish", { p_id: file.id });
    }
    this.status.delete(local.id);
  }
  private async send(
    blob: Blob,
    file: CloudFile,
    user: string,
    epoch: number,
    localId: string,
  ) {
    const native = this.account.native!;
    const base = new URL(native.url);
    if (base.hostname.endsWith(".supabase.co"))
      base.hostname = base.hostname.replace(
        /\.supabase\.co$/,
        ".storage.supabase.co",
      );
    const endpoint = new URL("/storage/v1/upload/resumable", base).href;
    let idle: ReturnType<typeof setTimeout>,
      upload: Upload | undefined,
      cancel: (() => void) | undefined;
    let active = true;
    await new Promise<void>((resolve, reject) => {
      const touch = () => {
        if (!active) return;
        clearTimeout(idle);
        idle = setTimeout(() => {
          active = false;
          void upload?.abort(false).catch(() => {});
          reject(Error("Upload paused; it will resume automatically."));
        }, 60000);
      };
      touch();
      upload = new Upload(blob, {
        endpoint,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 7000, 15000].map((delay) =>
          delay ? Math.round(delay * (0.5 + Math.random() * 0.5)) : 0,
        ),
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        fingerprint: async () =>
          `${user}:${this.app}:${file.id}:${file.fingerprint}`,
        urlStorage: this.store!.urlStorage,
        metadata: {
          bucketName: FILE_BUCKET,
          objectName: objectPath(file),
          contentType: file.mime,
          cacheControl: "3600",
        },
        onBeforeRequest: async (request) => {
          touch();
          if (!active || !this.current(user, epoch) || !this.online())
            throw Error("Transfer paused.");
          const { data, error } = await native.client.auth.getSession();
          if (
            !active ||
            !this.current(user, epoch) ||
            !this.online() ||
            error ||
            !data.session ||
            data.session.user.id !== user
          )
            throw Error("Sign in to resume.");
          request.setHeader(
            "Authorization",
            `Bearer ${data.session.access_token}`,
          );
          request.setHeader("apikey", native.key);
        },
        onAfterResponse: () => {
          touch();
        },
        onProgress: (sent, total) => {
          touch();
          if (active && this.current(user, epoch)) {
            this.status.set(
              localId,
              `Uploading ${Math.floor((sent / total) * 100)}%`,
            );
            this.publish();
          }
        },
        onSuccess: () => resolve(),
        onError: () => reject(Error("Upload interrupted.")),
      });
      this.transfer = upload;
      cancel = () => {
        active = false;
        reject(Error("Transfer paused."));
      };
      this.cancelTransfer = cancel;
      void upload
        .findPreviousUploads()
        .then((previous) => {
          if (!active || !this.current(user, epoch) || !this.online())
            return reject(Error("Transfer paused."));
          const safe = previous.find((p) =>
            p.uploadUrl?.startsWith(endpoint + "/"),
          );
          if (safe) upload!.resumeFromPreviousUpload(safe);
          upload!.start();
        })
        .catch(reject);
    }).finally(() => {
      active = false;
      clearTimeout(idle);
      if (this.transfer === upload) this.transfer = undefined;
      if (this.cancelTransfer === cancel) this.cancelTransfer = undefined;
    });
  }
  async download(id: string) {
    await this.initial;
    if (!this.store)
      throw Error("Device storage is unavailable. Please retry.");
    if (!this.user) throw Error("Sign in to download this recording.");
    this.suppressedDownloads.delete(id);
    const job: FileJob = {
      revision: crypto.randomUUID(),
      id: `${this.user}:${this.app}:download:${id}`,
      user: this.user,
      app: this.app,
      kind: "download",
      fileId: id,
    };
    await this.store!.put("jobs", job);
    if (!this.online())
      throw Error("Download queued. Connect to download this recording.");
    await this.downloadOnce(id);
    await this.store!.complete(job);
  }
  private async cacheLock<T>(
    user: string,
    id: string,
    action: () => Promise<T>,
  ) {
    return navigator.locks
      ? navigator.locks.request(
          `soundtools-file-cache:${user}:${this.app}:${id}`,
          action,
        )
      : action();
  }
  async cancelDownload(id: string) {
    await this.initial;
    const user = this.user;
    if (!this.store || !user) return;
    this.suppressedDownloads.add(id);
    this.downloads.get(id)?.abort();
    await this.cacheLock(user, id, () =>
      this.store!.remove("jobs", `${user}:${this.app}:download:${id}`),
    );
    // A local commit may already be in progress. Let it settle before the app
    // removes its cached bytes, otherwise it could silently recreate the copy.
    await this.downloadTasks.get(id)?.catch(() => {});
    this.status.delete(id);
    this.publish();
  }
  private downloadOnce(id: string) {
    const existing = this.downloadTasks.get(id);
    if (existing) return existing;
    const task = this.receive(id).finally(() => this.downloadTasks.delete(id));
    this.downloadTasks.set(id, task);
    return task;
  }
  private async receive(id: string) {
    const user = this.user,
      epoch = this.epoch;
    if (this.suppressedDownloads.has(id)) throw Error("Download cancelled.");
    const file = this.rows.find((f) => f.id === id && f.state === "ready");
    if (!file) throw Error("This recording is not available in the cloud.");
    this.downloads.get(id)?.abort();
    const controller = new AbortController();
    this.downloads.set(id, controller);
    this.status.set(id, "Downloading…");
    this.publish();
    try {
      const { data, error } = await this.account
        .native!.client.storage.from(FILE_BUCKET)
        .createSignedUrl(objectPath(file), 600);
      if (error || !data?.signedUrl) throw Error("Download unavailable.");
      const response = await fetch(data.signedUrl, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(300000),
        ]),
        credentials: "omit",
      });
      if (!response.ok) throw Error("Download interrupted.");
      const blob = await response.blob();
      if (
        blob.size !== file.bytes ||
        (await this.adapter.fingerprint(blob)) !== file.fingerprint
      )
        throw Error(
          "Download verification failed; it will retry automatically.",
        );
      if (
        !this.current(user, epoch) ||
        controller.signal.aborted ||
        this.suppressedDownloads.has(id) ||
        this.rows.some((f) => f.id === id && !live(f))
      )
        throw Error("Download paused.");
      await this.cacheLock(user, id, async () => {
        // A different tab can remove the same device-local download. Check its
        // durable intent while holding the commit lock, not just this tab's signal.
        const queued = await this.store!.get<FileJob>(
          "jobs",
          `${user}:${this.app}:download:${id}`,
        );
        if (
          !queued ||
          !this.current(user, epoch) ||
          controller.signal.aborted ||
          this.suppressedDownloads.has(id)
        )
          throw Error("Download cancelled.");
        await this.adapter.save(file, blob);
      });
      await this.adapter.changed();
    } finally {
      if (this.downloads.get(id) === controller) this.downloads.delete(id);
      this.status.delete(id);
      this.publish();
    }
  }
  async rename(id: string, name: string) {
    await this.initial;
    if (!this.store)
      throw Error("Device storage is unavailable. Please retry.");
    if (!this.user) throw Error("Sign in to rename this cloud file.");
    const file = this.rows.find((file) => file.id === id);
    const stamp = this.account.issueStamp(
      file?.rename_device
        ? {
            time: file.rename_time || 0,
            counter: file.rename_counter || 0,
            node: file.rename_device,
          }
        : undefined,
    );
    await this.store!.put("jobs", {
      stamp,
      id: `${this.user}:${this.app}:rename:${id}`,
      user: this.user,
      app: this.app,
      kind: "rename",
      fileId: id,
      name,
      revision: crypto.randomUUID(),
    } satisfies FileJob);
    this.rows = this.rows.map((f) => (f.id === id ? { ...f, name } : f));
    await this.store!.put("catalogues", {
      id: `${this.user}:${this.app}`,
      rows: this.rows,
    });
    this.publish();
    void this.kick();
  }
  async remove(id: string) {
    await this.initial;
    if (!this.store)
      throw Error("Device storage is unavailable. Please retry.");
    if (!this.user) throw Error("Sign in to delete this cloud file.");
    this.downloads.get(id)?.abort();
    if (this.transfer?.options.metadata?.objectName.endsWith("/" + id))
      this.stopTransfers();
    await this.store!.put("jobs", {
      id: `${this.user}:${this.app}:delete:${id}`,
      user: this.user,
      app: this.app,
      kind: "delete",
      fileId: id,
      revision: crypto.randomUUID(),
    } satisfies FileJob);
    this.rows = this.rows.map((f) =>
      f.id === id ? { ...f, state: "deleted" } : f,
    );
    await this.store!.put("catalogues", {
      id: `${this.user}:${this.app}`,
      rows: this.rows,
    });
    this.publish();
    void this.kick();
  }
}
