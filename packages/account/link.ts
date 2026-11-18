type LinkEnvironment = {
  location?: { pathname: string; hash: string };
  history: { replaceState(state: unknown, title: string, url: string): void };
  __soundtoolsAccountLink?: string | null;
};
/** Self-contained so classic-script apps can run this before telemetry/bootstrap.
 * The account client consumes and removes the short-lived token immediately. */
export function captureAccountLink(
  env: LinkEnvironment = globalThis as unknown as LinkEnvironment,
): string | null {
  if (env.location?.pathname === "/auth/confirm") {
    env.__soundtoolsAccountLink = new URLSearchParams(
      env.location.hash.slice(1),
    ).get("token_hash");
    env.history.replaceState(null, "", "/");
  }
  return env.__soundtoolsAccountLink || null;
}
export function consumeAccountLink() {
  const token = captureAccountLink();
  delete (globalThis as unknown as LinkEnvironment).__soundtoolsAccountLink;
  return token;
}
