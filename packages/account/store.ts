import { freshReplica, type Replica } from "./model";
export interface ReplicaStore {
  transaction<T>(
    user: string,
    update: (state: Replica) => T,
  ): Promise<{ state: Replica; result: T }>;
}
/** A single IndexedDB transaction serializes tabs without holding a lock over
 * network I/O. Account replicas never overwrite the guest application's data. */
export class AccountStore implements ReplicaStore {
  private constructor(
    private db: IDBDatabase,
    private app: string,
  ) {}
  static async open(app: string) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("soundtools-accounts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("replicas");
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(Error("Close older app windows to enable account storage."));
    });
    return new AccountStore(db, app);
  }
  transaction<T>(user: string, update: (state: Replica) => T) {
    return new Promise<{ state: Replica; result: T }>((resolve, reject) => {
      const tx = this.db.transaction("replicas", "readwrite", {
        durability: "strict",
      });
      const store = tx.objectStore("replicas");
      const key = `${user}:${this.app}`;
      let state: Replica, result: T;
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          state = request.result ?? freshReplica();
          if (state.version !== 1)
            throw Error("Update the app to use its saved account data.");
          result = update(state);
          store.put(state, key);
        } catch (error) {
          reject(error);
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve({ state, result });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          tx.error ??
            Error("Account changes could not be saved on this device."),
        );
    });
  }
}
