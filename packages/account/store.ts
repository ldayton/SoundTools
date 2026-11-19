import { freshReplica, type Replica } from "./model";
export interface ReplicaStore {
  transaction<T>(
    user: string,
    update: (state: Replica) => T,
  ): Promise<{ state: Replica; result: T }>;
}
/** Durable outbox plus an in-memory recovery copy for an open tab. A browser
 * can still erase non-persistent storage after the process has been closed. */
export class AccountStore implements ReplicaStore {
  private db?: IDBDatabase;
  private opening?: Promise<IDBDatabase>;
  private last = new Map<string, Replica>();
  private constructor(private app: string) {}
  static async open(app: string) {
    const store = new AccountStore(app);
    await store.database();
    if (navigator.storage?.persist)
      void navigator.storage.persist().catch(() => false);
    return store;
  }
  private database(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("soundtools-accounts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("replicas");
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = undefined;
        };
        this.db.onclose = () => {
          this.db = undefined;
        };
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
      // Other versions close cooperatively on versionchange; do not ask the
      // user to arbitrate tab locks or delete storage to recover sync.
    }).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }
  async transaction<T>(
    user: string,
    update: (state: Replica) => T,
  ): Promise<{ state: Replica; result: T }> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction("replicas", "readwrite", { durability: "strict" });
      } catch (error) {
        if ((error as DOMException).name === "InvalidStateError") {
          this.db = undefined;
          void this.transaction(user, update).then(resolve, reject);
          return;
        }
        reject(error);
        return;
      }
      const store = tx.objectStore("replicas"),
        key = `${user}:${this.app}`;
      let state: Replica, result: T;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          state =
            request.result ??
            structuredClone(this.last.get(user) ?? freshReplica());
          if (state.version !== 1)
            throw Error("Update the app to use its saved account data.");
          result = update(state);
          store.put(state, key);
        } catch (error) {
          reject(error);
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        this.last.set(user, structuredClone(state));
        resolve({ state, result });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          tx.error ??
            Error("Account changes could not be saved on this device."),
        );
    });
  }
}
