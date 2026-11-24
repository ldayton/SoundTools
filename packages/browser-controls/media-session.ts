const owners = new WeakMap<object, object>();

type Session = Pick<
  MediaSession,
  "setActionHandler" | "playbackState" | "metadata"
> &
  Partial<Pick<MediaSession, "setPositionState">>;

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
  },
) {
  const handlers: Partial<
    Record<MediaSessionAction, MediaSessionActionHandler>
  > = {
    play: actions.play,
    pause: actions.pause,
    ...(actions.seek
      ? {
          seekto: (details: MediaSessionActionDetails) => {
            if (
              typeof details.seekTime === "number" &&
              Number.isFinite(details.seekTime)
            )
              actions.seek!(details.seekTime);
          },
        }
      : {}),
    ...(actions.previous ? { previoustrack: actions.previous } : {}),
    ...(actions.next ? { nexttrack: actions.next } : {}),
  };
  const owner = {};
  const supported = [
    "play",
    "pause",
    "seekto",
    "previoustrack",
    "nexttrack",
  ] as const;
  function claim() {
    if (!session || owners.get(session) === owner) return;
    if (owners.has(session)) {
      try {
        session.setPositionState?.();
      } catch {
        /* Optional timeline. */
      }
    }
    owners.set(session, owner);
    lastTitle = undefined;
    lastPosition = lastDuration = NaN;
    for (const action of supported) {
      try {
        const handler = handlers[action];
        session.setActionHandler(
          action,
          handler
            ? (details) => {
                if (owners.get(session) === owner && lastTitle)
                  handler(details);
              }
            : null,
        );
      } catch {
        /* Unsupported actions must not break in-app playback. */
      }
    }
  }
  let lastTitle: string | undefined;
  let lastPosition = NaN,
    lastDuration = NaN;
  return (
    title: string,
    mode: string,
    timeline?: { position: number; duration: number; force?: boolean },
  ) => {
    if (!session) return;
    if (title) claim();
    else if (owners.get(session) !== owner) return;
    if (!title) {
      owners.delete(session);
      for (const action of supported) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* Optional API. */
        }
      }
    }
    const state =
      title && mode === "playing"
        ? "playing"
        : title && mode === "paused"
          ? "paused"
          : "none";
    const changedState = session.playbackState !== state;
    if (title !== lastTitle) {
      lastTitle = title;
      try {
        session.metadata = title ? metadata(title) : null;
      } catch {
        // Metadata is optional; transport actions must remain usable.
      }
    }
    try {
      if (changedState) session.playbackState = state;
    } catch {
      // System integration must not prevent in-app playback.
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
      const position = Math.max(
        0,
        Math.min(timeline.duration, timeline.position),
      );
      if (
        timeline.force ||
        changedState ||
        lastDuration !== timeline.duration ||
        position < lastPosition ||
        Math.abs(position - lastPosition) >= 1 ||
        !Number.isFinite(lastPosition)
      ) {
        session.setPositionState?.({
          duration: timeline.duration,
          position,
          playbackRate: 1,
        });
        lastPosition = position;
        lastDuration = timeline.duration;
      }
    } catch {
      // Position reporting is an independent, optional browser capability.
    }
  };
}
