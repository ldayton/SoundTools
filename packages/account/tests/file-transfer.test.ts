import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Upload } from "tus-js-client";
import { CloudFiles, type CloudFile } from "../files";
import { FileStore } from "../file-store";

// Exercise the real TUS callbacks without a network or browser credentials.
for (const action of ["logout", "cancel"] as const)
  test(`${action} while credentials are being read cannot authorize a later upload`, async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: true },
    });
    const queue = mock.method(FileStore, "open", async () => {
      throw Error("unused");
    });
    let release!: (value: unknown) => void, started!: () => void;
    const waiting = new Promise((resolve) => (release = resolve));
    const requested = new Promise<void>((resolve) => (started = resolve));
    let user = "owner",
      headers = 0;
    const account = {
      getSnapshot: () => ({ user, status: "synced" }),
      subscribe: () => () => {},
      native: {
        url: "https://example.supabase.co",
        key: "public-test-key",
        client: {
          auth: {
            getSession: () => {
              started();
              return waiting;
            },
          },
        },
      },
    };
    const service = new CloudFiles(account as any, "soundglow", {
      report() {},
      async changed() {},
    } as any);
    await (service as any).initial;
    (service as any).store = { urlStorage: {} };
    const previous = mock.method(
      Upload.prototype,
      "findPreviousUploads",
      async () => [],
    );
    let callbacks: Upload["options"];
    let aborts = 0;
    const abort = mock.method(Upload.prototype, "abort", async () => {
      aborts++;
    });
    const start = mock.method(
      Upload.prototype,
      "start",
      function (this: Upload) {
        callbacks = this.options;
        void Promise.resolve(
          this.options.onBeforeRequest!({ setHeader: () => headers++ } as any),
        ).then(
          () => this.options.onSuccess!({} as any),
          (error) => this.options.onError!(error),
        );
      },
    );
    try {
      const transfer = (service as any).send(
        new Blob(["audio"]),
        {
          id: "file",
          user_id: "owner",
          app: "soundglow",
          fingerprint: "test",
          mime: "audio/wav",
        } as CloudFile,
        "owner",
        (service as any).epoch,
        "local",
      );
      await requested;
      const rejected = assert.rejects(transfer);
      if (action === "logout") user = "";
      else (service as any).stopTransfers();
      release({
        data: {
          session: { access_token: "must-not-be-sent", user: { id: "owner" } },
        },
        error: null,
      });
      await rejected;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(
        headers,
        0,
        "credentials must not be attached after logout/cancellation",
      );
      if (action === "cancel") {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const previousAborts = aborts;
        callbacks!.onProgress!(1, 2);
        t.mock.timers.tick(60000);
        assert.equal(
          aborts,
          previousAborts,
          "late progress cannot restart a cancelled transfer's timeout",
        );
      }
    } finally {
      t.mock.timers.reset();
      abort.mock.restore();
      start.mock.restore();
      previous.mock.restore();
      queue.mock.restore();
      if (descriptor)
        Object.defineProperty(globalThis, "navigator", descriptor);
      else delete (globalThis as any).navigator;
    }
  });

test("failed sync storage and a failed library refresh cannot become an unhandled initialization error", async () => {
  const queue = mock.method(FileStore, "open", async () => {
    throw Error("blocked");
  });
  const codes: string[] = [];
  try {
    const service = new CloudFiles(
      {
        getSnapshot: () => ({ user: "owner", status: "synced" }),
        subscribe: () => () => {},
      } as any,
      "soundglow",
      {
        report: (code: string) => codes.push(code),
        changed: async () => {
          throw Error("cache unavailable");
        },
      } as any,
    );
    await (service as any).initial;
    assert.deepEqual(codes, [
      "files.queue_unavailable",
      "files.library_refresh_failed",
    ]);
  } finally {
    queue.mock.restore();
  }
});

test("an account change before the queue opens still restores its offline catalogue", async () => {
  const saved = new Map(
    ["window", "document", "navigator"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries({
    window: { addEventListener() {} },
    document: { addEventListener() {}, hidden: false },
    navigator: { onLine: false },
  }))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  const interval = mock.method(
    globalThis,
    "setInterval",
    () => ({ unref() {} }) as any,
  );
  let release!: (value: any) => void, notify!: () => void;
  const queue = mock.method(
    FileStore,
    "open",
    () => new Promise((resolve) => (release = resolve)),
  );
  try {
    const service = new CloudFiles(
      {
        getSnapshot: () => ({ user: "owner", status: "offline" }),
        subscribe: (fn: () => void) => {
          notify = fn;
          return () => {};
        },
      } as any,
      "soundglow",
      { changed: async () => {}, report() {} } as any,
    );
    notify();
    await new Promise((resolve) => setImmediate(resolve));
    release({ get: async () => ({ rows: [{ id: "offline-catalogue" }] }) });
    await (service as any).initial;
    assert.equal(service.rows[0]?.id, "offline-catalogue");
  } finally {
    queue.mock.restore();
    interval.mock.restore();
    for (const [name, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as any)[name];
  }
});
