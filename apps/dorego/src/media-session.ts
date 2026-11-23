type Session = Pick<MediaSession, 'setActionHandler' | 'playbackState' | 'metadata'> &
  Partial<Pick<MediaSession, 'setPositionState'>>;

/** System controls share the active exercise's transport. */
export function bindMediaSession(
  session: Session | undefined,
  metadata: (title: string) => MediaMetadata,
  actions: {
    play(): void;
    pause(): void;
    seek?(seconds: number): void;
    previous?(): void;
    next?(): void;
  }
) {
  const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
    play: actions.play,
    pause: actions.pause,
    ...(actions.seek
      ? {
          seekto: (details: MediaSessionActionDetails) => {
            if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime))
              actions.seek!(details.seekTime);
          },
        }
      : {}),
    ...(actions.previous ? { previoustrack: actions.previous } : {}),
    ...(actions.next ? { nexttrack: actions.next } : {}),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session?.setActionHandler(action as MediaSessionAction, handler!);
    } catch {
      // Individual system actions are not supported by every browser.
    }
  }
  let lastTitle: string | undefined;
  let lastPosition = NaN,
    lastDuration = NaN;
  return (
    title: string,
    mode: string,
    timeline?: { position: number; duration: number; force?: boolean }
  ) => {
    if (!session) return;
    const state = mode === 'playing' ? 'playing' : mode === 'paused' ? 'paused' : 'none';
    const changedState = session.playbackState !== state;
    try {
      if (title !== lastTitle) {
        session.metadata = title ? metadata(title) : null;
        lastTitle = title;
      }
      if (changedState) session.playbackState = state;
    } catch {
      // System integration must not prevent the in-app controls from working.
    }
    try {
      if (
        !title ||
        !timeline ||
        !Number.isFinite(timeline.duration) ||
        timeline.duration <= 0 ||
        !Number.isFinite(timeline.position)
      ) {
        if (Number.isFinite(lastPosition)) session.setPositionState?.();
        lastPosition = lastDuration = NaN;
        return;
      }
      const position = Math.max(0, Math.min(timeline.duration, timeline.position));
      if (
        timeline.force ||
        changedState ||
        lastDuration !== timeline.duration ||
        position < lastPosition ||
        Math.abs(position - lastPosition) >= 1 ||
        !Number.isFinite(lastPosition)
      ) {
        session.setPositionState?.({ duration: timeline.duration, position, playbackRate: 1 });
        lastPosition = position;
        lastDuration = timeline.duration;
      }
    } catch {
      // Position reporting is an independent, optional browser capability.
    }
  };
}
