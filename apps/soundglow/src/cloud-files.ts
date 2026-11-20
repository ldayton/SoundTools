import { CloudFiles, type CloudFile } from "@ldayton/account/files";
import { account, soundglowAccount } from "./account";

type StoredFile = {
  id: string;
  fingerprint: string;
  name: string;
  type: string;
  bytes: number;
  duration: number;
  position: number;
  addedAt: number;
  owner?: string;
  cloudId?: string;
  cloudOwner?: string;
};
type Library = {
  store: {
    list(): Promise<StoredFile[]>;
    get(id: string): Promise<Blob | null>;
    add(meta: StoredFile, blob: Blob): Promise<void>;
    remove(id: string): Promise<void>;
    patch(id: string, patch: Partial<StoredFile>): Promise<void>;
  };
  refreshCloudFiles(): Promise<void>;
  ensureFingerprint(file: StoredFile): Promise<void>;
};
let library: Library;
let service: CloudFiles | undefined;
export const soundglowFiles = {
  get available() {
    return !!service?.available;
  },
  get user() {
    return account.getSnapshot().user;
  },
  get rows() {
    return service?.rows || [];
  },
  get status() {
    return service?.status || new Map<string, string>();
  },
  start(host: Library) {
    if (service) return;
    library = host;
    service = new CloudFiles(account, "soundglow", {
      list: async () => {
        const files = await library.store.list(),
          user = account.getSnapshot().user;
        for (const file of files)
          if (
            (!file.owner || file.owner === user) &&
            !file.fingerprint &&
            file.bytes <= 50 * 1024 * 1024
          )
            try {
              await library.ensureFingerprint(file);
            } catch (error) {
              window.SoundglowDiagnostics?.capture?.(
                error,
                "files.fingerprint_failed",
              );
            }
        return files.map((f) => ({
          ...f,
          mime: f.type,
          details: { duration: f.duration },
        }));
      },
      read: (id) => library.store.get(id),
      bind: (id, cloudId, cloudOwner) =>
        library.store.patch(id, { cloudId, cloudOwner }),
      save: async (file, blob) => {
        const duration = file.details.duration;
        if (
          typeof duration !== "number" ||
          !Number.isFinite(duration) ||
          duration <= 0
        )
          throw Error("This recording has invalid audio information.");
        // Do not replace a cached file's playback position when two tabs finish.
        const existing = (await library.store.list()).find(
          (f) => f.id === file.id,
        );
        if (existing && (await library.store.get(file.id))) return;
        if (existing) await library.store.remove(file.id);
        await library.store.add(
          {
            id: file.id,
            cloudId: file.id,
            cloudOwner: file.user_id,
            owner: file.user_id,
            name: file.name,
            type: file.mime,
            fingerprint: file.fingerprint,
            bytes: file.bytes,
            duration,
            position: 0,
            addedAt: Date.parse(file.created_at),
          },
          blob,
        );
      },
      remove: (id) => library.store.remove(id),
      fingerprint: soundglowAccount.fingerprint,
      changed: () => library.refreshCloudFiles(),
      report: (code, error, details) =>
        error
          ? window.SoundglowDiagnostics?.capture?.(error, code, details)
          : window.SoundglowDiagnostics?.event?.(code, details),
    });
    service.subscribe(
      () =>
        void library
          .refreshCloudFiles()
          .catch((error) =>
            window.SoundglowDiagnostics?.capture?.(
              error,
              "files.library_refresh_failed",
            ),
          ),
    );
  },
  imported(id: string) {
    return service?.imported(id);
  },
  async download(id: string) {
    if (!service) throw Error("Sign in to download.");
    await service.download(id);
  },
  async cancelDownload(id: string) {
    await service?.cancelDownload(id);
  },
  async rename(id: string, name: string) {
    if (!service) throw Error("Sign in to rename.");
    await service.rename(id, name);
  },
  async remove(id: string) {
    if (!service) throw Error("Sign in to delete.");
    await service.remove(id);
  },
  retry() {
    return service?.retry();
  },
};
declare global {
  interface Window {
    SoundglowFiles: typeof soundglowFiles;
  }
}
