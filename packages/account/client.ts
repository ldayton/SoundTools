import { nextStamp, type EditStamp } from "./clock";
import { RequestLifetime } from "./request-lifetime";
import { SyncLeader } from "./leader";
import { failureKind, retryDelay, retryAfter } from "./retry";
import { consumeAccountLink } from "./link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AccountStore } from "./store";
import { SyncEngine, changes, type Cloud } from "./sync";
import {
  AccountDataError,
  same,
  type Json,
  type Records,
  type CloudRow,
} from "./model";
export type { Json, Records } from "./model";
export type AccountStatus =
  "guest" | "loading" | "syncing" | "synced" | "offline" | "reauth" | "error";
export type AccountSnapshot = {
  status: AccountStatus;
  email: string;
  user: string;
  pending: number;
  error: string;
  updates: boolean;
  conflicts: string[];
  link: boolean;
  blocked?: number;
  retryCount?: number;
  oldestPendingAt?: number;
  lastSyncedAt?: number;
  lastSyncMs?: number;
  persistentStorage?: boolean;
};
export interface AccountBinding {
  read(): Records;
  apply(records: Records | null): void | Promise<void>;
  pause(): void;
  canApply(): boolean;
  validate?(records: Records): void;
  applyPartial?(records: Records, keys: string[]): Promise<string[]>;
}
const env =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {};
// Fragments never reach Vercel logs. Strip before diagnostics or app routing can
// observe them, and redeem only after a human presses the confirmation button.
let linkToken = consumeAccountLink();
export class Account {
  private snapshot: AccountSnapshot = {
    status: "guest",
    email: "",
    user: "",
    pending: 0,
    error: "",
    updates: false,
    conflicts: [],
    link: !!linkToken,
  };
  private listeners = new Set<() => void>();
  private binding?: AccountBinding;
  private engine?: SyncEngine;
  private captured: Records = {};
  private intentClock?: EditStamp;
  private applied: Records = {};
  private applying = false;
  private bound = false;
  private generation = 0;
  private debounce?: ReturnType<typeof setTimeout>;
  private syncing?: Promise<void>;
  private syncAgain = false;
  private leader?: SyncLeader;
  private realtime?: ReturnType<SupabaseClient["channel"]>;
  private nextNetworkAt = 0;
  private networkFailures = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAfterMs = 0;
  private notificationTimer?: ReturnType<typeof setTimeout>;
  private started = false;
  private channel?: BroadcastChannel;
  private writes = Promise.resolve();
  private volatile = new Map<
    string,
    { key: string; value: Json; previous: Json; stamp?: EditStamp }
  >();
  private client?: SupabaseClient;
  private requests = new RequestLifetime();
  readonly configured: boolean;
  constructor(
    readonly app: string,
    private report: (
      code: string,
      error?: unknown,
      details?: Record<string, unknown>,
    ) => void = () => {},
  ) {
    this.configured = !!(
      env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    );
    if (this.configured)
      this.client = createClient(
        env.VITE_SUPABASE_URL,
        env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
            storageKey: `soundtools:${app}:auth`,
          },
          global: {
            fetch: async (input, init) => {
              const response = await this.requests.fetch(input, init);
              if (response.status === 429 || response.status === 503)
                this.retryAfterMs = Math.max(
                  this.retryAfterMs,
                  retryAfter(response.headers.get("retry-after")),
                );
              return response;
            },
          },
        },
      );
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  get signedIn() {
    return !!this.snapshot.user;
  }
  /** Native Supabase services share this account's session and refresh lock. */
  get native() {
    return this.client && this.snapshot.user
      ? {
          client: this.client,
          url: env.VITE_SUPABASE_URL,
          key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
        }
      : null;
  }
  private set(patch: Partial<AccountSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private remembered(value?: { user: string; email: string } | null) {
    const key = `soundtools:${this.app}:account`;
    try {
      if (value === null) localStorage.removeItem(key);
      else if (value) localStorage.setItem(key, JSON.stringify(value));
      else
        return JSON.parse(localStorage.getItem(key) || "null") as {
          user: string;
          email: string;
        } | null;
    } catch {}
    return null;
  }
  async start(binding: AccountBinding) {
    if (this.started) return;
    this.started = true;
    this.binding = binding;
    this.captured = structuredClone(binding.read());
    if (!this.client) return;
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      // Do not await Supabase inside its auth lock.
      setTimeout(() => {
        if (session)
          void this.connect(session.user.id, session.user.email ?? "");
        else if (this.signedIn) {
          if (event === "SIGNED_OUT") void this.externalSignOut();
          else this.set({ status: "reauth" });
        }
      }, 0);
    });
    const remembered = this.remembered();
    if (remembered) await this.connect(remembered.user, remembered.email, true);
    try {
      const { data } = await this.client.auth.getSession();
      if (data.session)
        await this.connect(data.session.user.id, data.session.user.email ?? "");
    } catch {
      if (this.signedIn) this.set({ status: "offline" });
    }
    const retry = () => {
      if (!document.hidden) void this.sync();
      else this.leader?.close();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    setInterval(() => {
      if (document.hidden || !this.engine || this.snapshot.status === "reauth")
        return;
      if (!this.leader?.active)
        void this.leader?.claim().then((active) => {
          if (active) void this.sync();
        });
      if (Date.now() >= this.nextNetworkAt) void this.sync();
    }, 1000);
    window.addEventListener("pagehide", () => this.leader?.close());
    // Applying remote state waits only for a safe point, never a user button.
    setInterval(() => {
      if (!document.hidden && this.snapshot.updates)
        void this.apply().catch((error) => this.report("apply_failed", error));
    }, 500);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`soundtools:${this.app}:account`);
      this.channel.onmessage = (event) => {
        if (
          (event.data === "changed" || event.data === "request") &&
          this.leader?.active
        )
          void this.sync();
        else void this.reloadCache(event.data === "synced");
      };
    }
  }
  private async reloadCache(confirmed = false) {
    const engine = this.engine;
    if (!engine) return;
    try {
      await engine.load();
      if (this.engine === engine) {
        if (confirmed)
          this.set({
            status: engine.pending ? "syncing" : "synced",
            lastSyncedAt: Date.now(),
          });
        await this.apply();
      }
    } catch (error) {
      if (this.engine === engine)
        this.set({
          status: "error",
          error:
            "Account data could not be read on this device. Keep this page open; recovery is automatic.",
        });
      this.report("storage_failed", error);
    }
  }
  private async connect(user: string, email: string, cached = false) {
    if (!this.binding || !this.client) return;
    if (this.snapshot.user === user && this.engine) {
      if (!cached) {
        this.nextNetworkAt = 0;
        this.networkFailures = 0;
        void this.sync();
      }
      return;
    }
    const generation = ++this.generation;
    this.leader?.close();
    this.nextNetworkAt = 0;
    this.networkFailures = 0;
    this.captured = structuredClone(this.binding.read());
    this.applied = structuredClone(this.captured);
    this.engine?.close();
    this.bound = false;
    this.binding.pause();
    this.set({ user, email, status: "loading", error: "" });
    try {
      const client = this.client;
      const app = this.app;
      const thisAccount = this;
      async function rpc<T>(name: string, args: object): Promise<T> {
        const { data, error, status } = await client.rpc(name, args);
        if (error)
          throw Object.assign(error, {
            status,
            retryAfterMs: thisAccount.retryAfterMs,
          });
        return data as T;
      }
      const cloud: Cloud = {
        read: (since) =>
          rpc("account_snapshot_v2", { p_app: app, p_since: since ?? null }),
        initialize: (records, device) =>
          rpc<CloudRow[]>("account_initialize", {
            p_app: app,
            p_records: records,
            p_device: device,
          }),
        write: (key, value, revision, operation, device, stamp) =>
          rpc("account_write_v2", {
            p_app: app,
            p_key: key,
            p_value: value,
            p_revision: revision,
            p_operation: operation,
            p_device: device,
            p_stamp: stamp ?? null,
          }),
      };
      const engine = new SyncEngine(
        await AccountStore.open(app),
        user,
        cloud,
        () => {
          if (this.engine !== engine) return;
          if (
            this.intentClock &&
            this.intentClock.time >
              Date.now() + (engine.state.timeOffset || 0) + 60000
          )
            this.intentClock = engine.state.clock;
          this.set({
            pending: engine.pending,
            ...engine.diagnostics,
            conflicts: engine.conflicts.map(([key]) => key),
            ...(engine.pending && this.snapshot.status === "synced"
              ? { status: "syncing" as const }
              : {}),
          });
        },
        (records) => this.binding?.validate?.(records),
        (error, details) => this.report("write_failed", error, details),
      );
      if (generation !== this.generation) return;
      this.engine = engine;
      this.leader = new SyncLeader(
        `soundtools-sync:${app}:${user}`,
        (active) => {
          if (active && this.engine === engine) {
            this.subscribeRealtime(user);
            this.channel?.postMessage("leader");
          } else if (!active) this.unsubscribeRealtime();
        },
      );
      await engine.load();
      if (navigator.storage?.persisted)
        void navigator.storage
          .persisted()
          .then((persistentStorage) => {
            if (this.engine === engine) this.set({ persistentStorage });
          })
          .catch(() => {});
      if (generation !== this.generation) return;
      if (engine.state.initialized) await this.apply(true);
      this.remembered({ user, email });
      if (cached) this.set({ status: "offline" });
      else if (this.syncing) this.syncAgain = true;
      else await this.sync();
    } catch (error) {
      if (generation !== this.generation) return;
      this.engine?.close();
      this.engine = undefined;
      this.set({
        status: "error",
        error:
          error instanceof AccountDataError
            ? error.message
            : "Account storage could not open. Your existing data is preserved.",
      });
      this.report(
        error instanceof AccountDataError
          ? "data_version_failed"
          : "storage_failed",
        error,
      );
    }
  }
  /** Called by app persistence, not by renders. Only explicit local differences
   * enter the outbox, so unapplied cloud changes cannot be overwritten wholesale. */
  changed(): Promise<void> {
    if (!this.binding || this.applying) return Promise.resolve();
    const next = structuredClone(this.binding.read());
    const patch = changes(this.captured, next);
    this.captured = next;
    for (const change of patch) this.applied[change.key] = change.value;
    if (!this.engine) return Promise.resolve();
    if (patch.length && this.snapshot.status === "synced")
      this.set({ status: "syncing" });
    for (const change of patch) {
      this.intentClock = nextStamp(
        this.engine.state.device,
        [this.intentClock, this.engine.state.clock],
        Date.now() + (this.engine.state.timeOffset || 0),
      );
      this.volatile.set(change.key, {
        stamp: this.intentClock,
        ...change,
        previous: this.volatile.get(change.key)?.previous ?? change.previous,
      });
    }
    const engine = this.engine;
    this.writes = this.writes
      .then(async () => {
        if (this.engine !== engine) return;
        const batch = [...this.volatile.values()];
        if (!batch.length) return;
        await engine.change(batch);
        for (const change of batch)
          if (this.volatile.get(change.key) === change)
            this.volatile.delete(change.key);
        this.channel?.postMessage("changed");
        // A bounded coalescing window: checkpoint saves must not keep pushing
        // the upload deadline into the future.
        if (!this.debounce)
          this.debounce = setTimeout(() => {
            this.debounce = undefined;
            void this.sync();
          }, 200);
      })
      .catch((error) => {
        this.set({
          status: "error",
          error:
            "Changes could not be saved on this device. Keep this page open; recovery is automatic.",
        });
        this.report("save_failed", error);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => void this.sync(), 1000);
      });
    return this.writes;
  }
  async apply(force = false) {
    const engine = this.engine;
    await this.writes;
    if (
      !engine ||
      this.engine !== engine ||
      !engine.state.initialized ||
      !this.binding ||
      this.applying ||
      this.volatile.size
    )
      return;
    const records = engine.records;
    if (this.bound && same(records, this.applied)) {
      this.set({ updates: false });
      return;
    }
    if (
      this.bound &&
      !force &&
      this.binding.applyPartial &&
      !document.activeElement?.closest(
        'input,select,textarea,[role="slider"],[role="spinbutton"]',
      )
    ) {
      const keys = changes(this.applied, records).map((change) => change.key);
      this.applying = true;
      try {
        const accepted = await this.binding.applyPartial(records, keys);
        for (const key of accepted) {
          if (key in records) this.applied[key] = records[key];
          else delete this.applied[key];
        }
        if (accepted.length)
          this.captured = structuredClone(this.binding.read());
      } finally {
        this.applying = false;
      }
      if (same(records, this.applied)) {
        this.set({ updates: false });
        return;
      }
    }
    if (this.bound && !force && !this.binding.canApply()) {
      this.set({ updates: true });
      return;
    }
    this.applying = true;
    try {
      this.binding.pause();
      await this.binding.apply(structuredClone(records));
      this.bound = true;
      this.applied = structuredClone(records);
      this.captured = structuredClone(this.binding.read());
      this.set({ updates: false });
    } finally {
      this.applying = false;
    }
  }
  sync(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      do {
        this.syncAgain = false;
        await this.synchronize();
      } while (
        this.syncAgain &&
        this.engine &&
        !["offline", "reauth", "error"].includes(this.snapshot.status)
      );
    })().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }
  private async synchronize() {
    if (typeof document !== "undefined" && document.hidden) return;
    const engine = this.engine;
    if (!engine) {
      if (this.snapshot.user)
        await this.connect(this.snapshot.user, this.snapshot.email);
      return;
    }
    // Realtime subscription and foreground timers can wake while the initial
    // durable replica is still loading. The connect path schedules sync after load.
    if (!engine.state) return;
    await this.writes;
    if (this.volatile.size) {
      await this.changed();
      if (this.volatile.size) return;
    }
    if (
      this.engine !== engine ||
      (Date.now() < this.nextNetworkAt && this.networkFailures > 0)
    )
      return;
    if (this.leader && !(await this.leader.claim())) {
      this.channel?.postMessage("request");
      await this.reloadCache();
      this.nextNetworkAt = Date.now() + 5000;
      return;
    }
    const started = performance.now();
    this.set({ status: "syncing", error: "" });
    try {
      await engine.sync(this.captured);
      await this.writes;
      if (this.engine !== engine || this.volatile.size) return;
      this.networkFailures = 0;
      this.retryAfterMs = 0;
      const diagnostics = engine.diagnostics;
      this.nextNetworkAt =
        diagnostics.nextRetryAt ?? Date.now() + 25000 + Math.random() * 10000;
      clearTimeout(this.retryTimer);
      if (engine.pending)
        this.retryTimer = setTimeout(
          () => void this.sync(),
          Math.max(100, this.nextNetworkAt - Date.now()),
        );
      this.set({
        status: diagnostics.blocked
          ? "error"
          : engine.pending
            ? "syncing"
            : "synced",
        error: diagnostics.blocked
          ? "Some changes are saved locally and delayed; other settings continue syncing automatically."
          : "",
        ...diagnostics,
        lastSyncedAt: Date.now(),
        lastSyncMs: Math.round(performance.now() - started),
      });
      await this.apply();
      this.channel?.postMessage("synced");
    } catch (error) {
      if (this.engine !== engine) return;
      const code = String(
        (error as { code?: string; status?: number }).code ??
          (error as { status?: number }).status ??
          "",
      );
      if (error instanceof AccountDataError) {
        this.set({ status: "error", error: error.message });
        this.nextNetworkAt = Date.now() + 86400000;
        this.networkFailures = 1;
        this.report("data_version_failed", error);
        return;
      }
      const kind = failureKind(error);
      const reauth = kind === "auth";
      this.networkFailures++;
      this.nextNetworkAt = reauth
        ? Infinity
        : Date.now() +
          (kind === "permanent"
            ? 86400000
            : retryDelay(this.networkFailures, this.retryAfterMs));
      clearTimeout(this.retryTimer);
      if (!reauth)
        this.retryTimer = setTimeout(
          () => void this.sync(),
          Math.max(100, this.nextNetworkAt - Date.now()),
        );
      this.set({
        status: reauth
          ? "reauth"
          : kind === "permanent" || kind === "storage"
            ? "error"
            : "offline",
        error:
          kind === "storage"
            ? "Device storage is unavailable. Changes remain in memory and will save automatically when storage recovers."
            : "",
      });
      if (!reauth)
        this.report("sync_failed", error, {
          failureKind: kind,
          attempt: this.networkFailures,
          pendingCount: engine.pending,
        });
      if (reauth) {
        this.leader?.close();
        this.report("authentication_required", error, { failureKind: kind });
      }
    }
  }
  private unsubscribeRealtime() {
    clearTimeout(this.notificationTimer);
    if (this.realtime) void this.client?.removeChannel(this.realtime);
    this.realtime = undefined;
    this.notificationTimer = undefined;
  }
  private subscribeRealtime(user: string) {
    this.unsubscribeRealtime();
    const channel = this.client?.channel(`account:${user}:${this.app}`, {
      config: { private: true },
    });
    if (!channel) return;
    this.realtime = channel;
    channel
      .on("broadcast", { event: "changed" }, () => {
        if (this.snapshot.user !== user) return;
        if (!this.notificationTimer)
          this.notificationTimer = setTimeout(() => {
            this.notificationTimer = undefined;
            if (!this.networkFailures) this.nextNetworkAt = 0;
            void this.sync();
          }, 100);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && this.snapshot.user === user) {
          if (!this.networkFailures) this.nextNetworkAt = 0;
          void this.sync();
        }
      });
  }
  async send(email: string) {
    if (!this.client)
      throw Error("Cloud sign-in is not configured for this build.");
    this.binding?.pause();
    const response = await fetch("/api/account/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        result.error || "Could not send the sign-in email. Try again.",
      );
  }
  /** Updates may reload offline, but only after the outbox is durable. */
  async flush() {
    await this.writes;
    if (this.volatile.size) {
      await this.changed();
      if (this.volatile.size)
        throw Error("Account changes have not been saved on this device.");
    }
  }
  async verify(email: string, token: string) {
    if (!this.client)
      throw Error("Cloud sign-in is not configured for this build.");
    const { data, error } = await this.client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.replace(/\s/g, ""),
      type: "email",
    });
    if (error && (!error.status || error.status >= 500 || error.status === 429))
      throw Error(
        "Could not connect to sign in. Check your connection and try again.",
      );
    if (error || !data.session)
      throw Error("That code has expired or is invalid. Request a new email.");
    await this.connect(data.session.user.id, data.session.user.email ?? "");
  }
  async confirmLink() {
    if (!this.client || !linkToken)
      throw Error("This link is invalid. Request a new email.");
    const token_hash = linkToken;
    const { data, error } = await this.client.auth.verifyOtp({
      token_hash,
      type: "email",
    });
    if (error && (!error.status || error.status >= 500 || error.status === 429))
      throw Error(
        "Could not connect to sign in. Check your connection and try again.",
      );
    linkToken = null;
    this.set({ link: false });
    if (error || !data.session)
      throw Error(
        "That link has expired or was already used. Request a new email.",
      );
    await this.connect(data.session.user.id, data.session.user.email ?? "");
  }
  /** Capture intent before asynchronous disk/network work, including file metadata. */
  issueStamp(observed?: EditStamp) {
    if (!this.engine) return undefined;
    this.intentClock = nextStamp(
      this.engine.state.device,
      [this.intentClock, this.engine.state.clock, observed],
      Date.now() + (this.engine.state.timeOffset || 0),
    );
    return this.intentClock;
  }
  /** Opaque replica identity, for bounded per-device cumulative counters. */
  get device() {
    return this.engine?.state.device;
  }
  async signOut() {
    await this.writes;
    if (this.engine?.pending || this.volatile.size)
      throw Error(
        "Changes are still saving. They will sync automatically when connected; try signing out again shortly.",
      );
    const result = await this.client?.auth.signOut({ scope: "local" });
    if (result?.error)
      throw Error(
        "Could not sign out. Reconnect and try again. Your account data is preserved.",
      );
    await this.restoreGuest();
  }
  private async externalSignOut() {
    this.nextNetworkAt = Infinity;
    this.networkFailures = 1;
    this.leader?.close();
    this.unsubscribeRealtime();
    await this.writes;
    if (!this.signedIn) return;
    if (this.engine?.pending || this.volatile.size) {
      this.set({
        status: "reauth",
        error: "Sign in again to sync the changes saved on this device.",
      });
      return;
    }
    try {
      await this.restoreGuest();
    } catch {
      this.set({
        status: "error",
        error: "Could not restore guest settings. Reload to try again.",
      });
    }
  }
  private async restoreGuest() {
    ++this.generation;
    this.leader?.close();
    this.leader = undefined;
    clearTimeout(this.retryTimer);
    this.unsubscribeRealtime();
    this.engine?.close();
    this.engine = undefined;
    this.bound = false;
    this.binding?.pause();
    this.remembered(null);
    this.applying = true;
    try {
      await this.binding?.apply(null);
    } finally {
      this.applying = false;
    }
    this.captured = structuredClone(this.binding?.read() ?? {});
    this.set({
      user: "",
      email: "",
      status: "guest",
      pending: 0,
      error: "",
      conflicts: [],
      updates: false,
    });
  }
}
