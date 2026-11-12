import { NoteWheel as SharedNoteWheel } from '@ldayton/browser-controls/note-wheel';
import { noteChoiceLabel } from './note-spelling';

export class NoteWheel extends SharedNoteWheel {
  constructor(element: HTMLElement, commit: (midi: number) => void) {
    super(element, commit, { low: 24, high: 96, label: noteChoiceLabel });
  }
}
