import { generateExercise, type Exercise, type ExerciseSpec } from './music';
import { drawExercise } from './render';
import { renderAudio } from './audio';

let exercise: Exercise;
const canvas = document.querySelector<HTMLCanvasElement>('#render')!;
const renderer = {
  init(spec: ExerciseSpec, width: number, height: number) {
    exercise = generateExercise(spec);
    canvas.width = width;
    canvas.height = height;
    drawExercise(canvas, exercise, 0, false, false, true);
  },
  frame(time: number) {
    drawExercise(canvas, exercise, time, false, false, true);
  },
  async audio() {
    const bytes = await renderAudio(exercise);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  },
};
declare global {
  interface Window {
    doregoRenderer: typeof renderer;
  }
}
window.doregoRenderer = renderer;
