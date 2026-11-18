import type { PreviousUpload } from "tus-js-client";

export type FileJob = {
  id: string;
  user: string;
  app: string;
  kind: "upload" | "download" | "delete" | "rename";
  localId?: string;
  fileId?: string;
  name?: string;
  revision?: string;
  deletedId?: string | null;
};

/** Original file bytes remain in the app's chunk store. This database contains
 * only transfer intentions, native TUS checkpoints and the offline catalogue. */
export class FileStore {
  constructor(private db: IDBDatabase) {}
  static open() {
    return new Promise<FileStore>((resolve, reject) => {
      const request = indexedDB.open("soundtools-file-transfers", 1);
      request.onupgradeneeded = () => {
        for (const name of ["jobs", "catalogues", "uploads"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(new FileStore(request.result));
      };
    });
  }
  async transaction<T>(
    store: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const tx = this.db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          tx.error || request.error || Error("File queue could not be saved."),
        );
      tx.onerror = () => {};
    });
    return request.result;
  }
  get<T>(store: string, id: string) {
    return this.transaction<T>(store, "readonly", (s) => s.get(id));
  }
  all<T>(store: string) {
    return this.transaction<T[]>(store, "readonly", (s) => s.getAll());
  }
  put(store: string, value: object) {
    return this.transaction(store, "readwrite", (s) => s.put(value));
  }
  remove(store: string, id: string) {
    return this.transaction(store, "readwrite", (s) => s.delete(id));
  }
  async complete(job: FileJob) {
    const tx = this.db.transaction("jobs", "readwrite"),
      store = tx.objectStore("jobs");
    const read = store.get(job.id);
    read.onsuccess = () => {
      if (read.result?.revision === job.revision) store.delete(job.id);
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  }
  async jobs(user: string, app: string) {
    return (await this.all<FileJob>("jobs")).filter(
      (j) => j.user === user && j.app === app,
    );
  }
  urlStorage = {
    findAllUploads: async () =>
      (await this.all<{ id: string; upload: PreviousUpload }>("uploads")).map(
        (r) => ({ ...r.upload, urlStorageKey: r.id }),
      ),
    findUploadsByFingerprint: async (fingerprint: string) =>
      (
        await this.all<{
          id: string;
          fingerprint: string;
          upload: PreviousUpload;
        }>("uploads")
      )
        .filter((r) => r.fingerprint === fingerprint)
        .map((r) => ({ ...r.upload, urlStorageKey: r.id })),
    removeUpload: async (id: string) => {
      await this.remove("uploads", id);
    },
    addUpload: async (fingerprint: string, upload: PreviousUpload) => {
      const id = crypto.randomUUID();
      await this.put("uploads", { id, fingerprint, upload });
      return id;
    },
  };
}
