import { PracticeSession } from "./session";
import type { Card } from "./model";
import type { GuitarCard } from "./guitar";
import type { FlashcardMode } from "./exercise-catalog";
import type { Profile } from "./exercise-settings";
import type { Progress } from "./progress";
type Session = PracticeSession<Card | GuitarCard>;
/** Owns suspended flashcard rounds. Navigation never copies session state into a second state machine. */
export class FlashcardSessions {
  private rounds = new Map<
    FlashcardMode,
    { session: Session; settings: string }
  >();
  create(
    mode: FlashcardMode,
    pool: (Card | GuitarCard)[],
    progress: Progress,
    profile: Profile,
    checkpoint?: unknown,
    rejected?: (checkpoint: unknown) => void,
  ) {
    const prefix = (mode === "piano" ? "piano-staff" : mode) + ":";
    const saved = checkpoint as
      { version?: number; settings?: string; session?: unknown } | undefined;
    const restored =
      saved?.version === 1 && saved.settings === JSON.stringify(profile)
        ? PracticeSession.restore(pool, progress, prefix, saved.session)
        : null;
    if (saved && saved.settings === JSON.stringify(profile) && !restored)
      rejected?.(checkpoint);
    const session = restored || new PracticeSession(pool, progress, prefix);
    this.remember(mode, session, profile);
    return session;
  }
  remember(mode: FlashcardMode, session: Session, profile: Profile) {
    this.rounds.set(mode, { session, settings: JSON.stringify(profile) });
  }
  restore(mode: FlashcardMode, profile: Profile, length: number) {
    const saved = this.rounds.get(mode);
    if (
      !saved ||
      saved.settings !== JSON.stringify(profile) ||
      saved.session.length !== length
    )
      return undefined;
    return { session: saved.session, phase: saved.session.status };
  }
  invalidate(mode: FlashcardMode) {
    this.rounds.delete(mode);
  }
  invalidateAll() {
    this.rounds.clear();
  }
}
