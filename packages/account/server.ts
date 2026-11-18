import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
export type AccountEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ACCOUNT_APPROVED_EMAIL?: string;
  ACCOUNT_APP_URL?: string;
};
/** Shared by Vercel functions and local Vite middleware. No admin key is used. */
export function loginHandler(env: AccountEnvironment) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    const respond = (status: number, error?: string) => {
      res.statusCode = status;
      res.end(JSON.stringify(error ? { error } : { ok: true }));
    };
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return respond(405, "Use the sign-in form.");
    }
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.ACCOUNT_APPROVED_EMAIL ||
      !env.ACCOUNT_APP_URL
    )
      return respond(503, "Cloud sign-in is not configured for this build.");
    let appURL: URL;
    try {
      appURL = new URL(env.ACCOUNT_APP_URL);
    } catch {
      return respond(503, "Cloud sign-in is not configured for this build.");
    }
    if (req.headers.origin !== appURL.origin) {
      // Dev servers are commonly opened as either localhost or 127.0.0.1.
      // Production origins remain exact; request bodies never control redirects.
      try {
        const requested = new URL(req.headers.origin || "");
        const local = ["localhost", "127.0.0.1"];
        if (
          appURL.protocol !== "http:" ||
          requested.protocol !== "http:" ||
          !local.includes(appURL.hostname) ||
          !local.includes(requested.hostname) ||
          appURL.port !== requested.port
        )
          return respond(403, "Open the app to sign in.");
        appURL = requested;
      } catch {
        return respond(403, "Open the app to sign in.");
      }
    }
    try {
      let text = "";
      const parsed = (req as IncomingMessage & { body?: unknown }).body;
      if (parsed === undefined)
        for await (const chunk of req) {
          text += chunk;
          if (Buffer.byteLength(text) > 1024)
            return respond(413, "Enter only your email address.");
        }
      else text = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      if (Buffer.byteLength(text) > 1024)
        return respond(413, "Enter only your email address.");
      const email = JSON.parse(text).email;
      if (
        typeof email !== "string" ||
        email.trim().toLowerCase() !==
          env.ACCOUNT_APPROVED_EMAIL.trim().toLowerCase()
      )
        return respond(403, "Not on approved list.");
      const client = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_PUBLISHABLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) =>
              fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
          },
        },
      );
      const { error } = await client.auth.signInWithOtp({
        email: env.ACCOUNT_APPROVED_EMAIL.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL("/auth/confirm", appURL).href,
        },
      });
      if (error)
        return respond(
          error.status === 429 ? 429 : 503,
          error.status === 429
            ? "Please wait before requesting another email."
            : "Could not send the sign-in email. Try again.",
        );
      respond(200);
    } catch {
      respond(
        400,
        "Could not send the sign-in email. Check your connection and try again.",
      );
    }
  };
}
