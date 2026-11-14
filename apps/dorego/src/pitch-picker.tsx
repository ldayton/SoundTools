import { PitchField } from '@ldayton/ui/pitch-field';
import { noteChoiceLabel } from './note-spelling';
const choices = Array.from({ length: 73 }, (_, index) => {
  const value = index + 24;
  return {
    value,
    label: noteChoiceLabel(value),
    octave: Math.floor(value / 12) - 1,
    column: value % 12,
  };
});
export function PitchPicker(
  props: Omit<Parameters<typeof PitchField>[0], 'choices' | 'columns' | 'optional'>
) {
  return <PitchField {...props} choices={choices} />;
}
