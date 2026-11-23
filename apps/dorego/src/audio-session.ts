/** Request media playback behavior, including sound in iPhone Silent Mode.
 * Unsupported browsers retain their existing audio behavior.
 */
export function configurePlaybackSession(host: { audioSession?: { type: string } }): boolean {
  try {
    const session = host.audioSession;
    if (!session) return false;
    session.type = 'playback';
    return session.type === 'playback';
  } catch {
    // An unavailable or restricted experimental API must not prevent playback.
    return false;
  }
}
