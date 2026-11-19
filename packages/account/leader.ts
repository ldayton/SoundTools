/** One visible tab owns the network connection; IndexedDB/CAS remain the
 * correctness boundary on browsers without Web Locks. */
export class SyncLeader {
  active = false;
  private claiming = false;
  private release?: () => void;
  private epoch = 0;
  constructor(
    private name: string,
    private changed: (active: boolean) => void,
  ) {}
  async claim(): Promise<boolean> {
    if (this.active) return true;
    if (this.claiming) return false;
    if (!globalThis.navigator?.locks) {
      this.active = true;
      this.changed(true);
      return true;
    }
    this.claiming = true;
    const epoch = this.epoch;
    return new Promise<boolean>((resolve) => {
      void navigator.locks
        .request(this.name, { ifAvailable: true }, async (lock) => {
          this.claiming = false;
          if (!lock || epoch !== this.epoch) {
            resolve(false);
            return;
          }
          this.active = true;
          this.changed(true);
          resolve(true);
          await new Promise<void>((release) => {
            this.release = release;
          });
          this.active = false;
          this.changed(false);
        })
        .catch(() => {
          this.claiming = false;
          resolve(false);
        });
    });
  }
  close() {
    this.epoch++;
    this.release?.();
    this.release = undefined;
    this.active = false;
    this.changed(false);
  }
}
