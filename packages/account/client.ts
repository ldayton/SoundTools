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
};
export interface AccountBinding {
  read(): Records;
  apply(records: Records | null): void | Promise<void>;
  pause(): void;
  canApply(): boolean;
  validate?(records: Records): void;
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
  private applied: Records = {};
  private applying = false;
  private bound = false;
  private generation = 0;
  private debounce?: ReturnType<typeof setTimeout>;
  private syncing?: Promise<void>;
  private syncAgain = false;
  private started = false;
  private channel?: BroadcastChannel;
  private writes = Promise.resolve();
  private volatile = new Map<
    string,
    { key: string; value: Json; previous: Json }
  >();
  private client?: SupabaseClient;
  readonly configured: boolean;
  constructor(
    readonly app: string,
    private report: (code: string) => void = () => {},
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
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                signal: AbortSignal.any([
                  AbortSignal.timeout(12000),
                  ...(init?.signal ? [init.signal] : []),
                ]),
              }),
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
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    setInterval(retry, 5000);
    // Applying remote state waits only for a safe point, never a user button.
    setInterval(() => {
      if (!document.hidden && this.snapshot.updates)
        void this.apply().catch(() => this.report("apply_failed"));
    }, 500);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`soundtools:${this.app}:account`);
      this.channel.onmessage = () => {
        void this.reloadCache();
      };
    }
  }
  private async reloadCache() {
    const engine = this.engine;
    if (!engine) return;
    try {
      await engine.load();
      if (this.engine === engine) await this.apply();
    } catch {
      if (this.engine === engine)
        this.set({
          status: "error",
          error:
            "Account data could not be read on this device. Keep this page open and retry.",
        });
      this.report("storage_failed");
    }
  }
  private async connect(user: string, email: string, cached = false) {
    if (!this.binding || !this.client) return;
    if (this.snapshot.user === user && this.engine) {
      if (!cached) void this.sync();
      return;
    }
    const generation = ++this.generation;
    this.captured = structuredClone(this.binding.read());
    this.applied = structuredClone(this.captured);
    this.engine?.close();
    this.bound = false;
    this.binding.pause();
    this.set({ user, email, status: "loading", error: "" });
    try {
      const client = this.client;
      const app = this.app;
      async function rpc<T>(name: string, args: object): Promise<T> {
        const { data, error } = await client.rpc(name, args);
        if (error) throw error;
        return data as T;
      }
      const cloud: Cloud = {
        read: () => rpc("account_snapshot", { p_app: app }),
        initialize: (records, device) =>
          rpc<CloudRow[]>("account_initialize", {
            p_app: app,
            p_records: records,
            p_device: device,
          }),
        write: (key, value, revision, operation, device) =>
          rpc("account_write", {
            p_app: app,
            p_key: key,
            p_value: value,
            p_revision: revision,
            p_operation: operation,
            p_device: device,
          }),
      };
      const engine = new SyncEngine(
        await AccountStore.open(app),
        user,
        cloud,
        () => {
          if (this.engine !== engine) return;
          this.set({
            pending: engine.pending,
            conflicts: engine.conflicts.map(([key]) => key),
            ...(engine.pending && this.snapshot.status === "synced"
              ? { status: "syncing" as const }
              : {}),
          });
        },
        (records) => this.binding?.validate?.(records),
      );
      if (generation !== this.generation) return;
      this.engine = engine;
      await engine.load();
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
    for (const change of patch)
      this.volatile.set(change.key, {
        ...change,
        previous: this.volatile.get(change.key)?.previous ?? change.previous,
      });
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
      .catch(() => {
        this.set({
          status: "error",
          error:
            "Changes could not be saved on this device. Keep this page open and retry.",
        });
        this.report("save_failed");
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
    const engine = this.engine;
    if (!engine) {
      if (this.snapshot.user)
        await this.connect(this.snapshot.user, this.snapshot.email);
      return;
    }
    await this.writes;
    if (this.volatile.size) {
      await this.changed();
      if (this.volatile.size) return;
    }
    if (this.engine !== engine) return;
    this.set({ status: "syncing", error: "" });
    try {
      await engine.sync(this.captured);
      await this.writes;
      if (this.engine !== engine || this.volatile.size) return;
      this.set({ status: engine.pending ? "syncing" : "synced" });
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
        this.report("data_version_failed");
        return;
      }
      const reauth = ["401", "403", "PGRST301", "PGRST303", "42501"].includes(
        code,
      );
      this.set({ status: reauth ? "reauth" : "offline", error: "" });
      if (reauth) this.report("authentication_required");
    }
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
  async resolve(key: string, choice: "device" | "cloud") {
    await this.engine?.resolve(key, choice);
    await this.apply(true);
    await this.sync();
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
