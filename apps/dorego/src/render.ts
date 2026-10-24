import {
  noteName,
  notePitchAt,
  PATTERNS,
  solfege,
  stateAt,
  practiceAt,
  type PracticeRound,
  type Exercise,
} from './music';

import { keyboardView, whiteKeyPosition, vocalPhraseNotes, practiceRange } from './keyboard-layout';

const C = {
  paper: '#faf9f4',
  ink: '#29382b',
  muted: '#82877a',
  line: '#e5e7dd',
  green: '#d9eb9b',
  accent: '#ec8052',
  white: '#ffffff',
};
export const WIDTH = 1600;
export const HEIGHT = 900;
export const MOBILE_HEIGHT = 1600;
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = C.ink,
  weight = 500,
  align: CanvasTextAlign = 'center'
) {
  ctx.font = `${weight} ${size}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}
// Center the visible glyphs rather than the font's em box or advance width.
function centeredGlyphs(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.font = `500 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(value);
  const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  ctx.fillStyle = color;
  ctx.fillText(
    value,
    x + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2,
    y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  );
  return { left: x - width / 2, top: y - height / 2, width, height };
}
export function drawExercise(
  canvas: HTMLCanvasElement,
  exercise: Exercise,
  seconds: number,
  mobile = false,
  reducedMotion = false,
  standalone = false
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.');
  const { spec, notes } = exercise;
  const scene = stateAt(exercise, seconds);
  const practice = practiceAt(exercise, seconds);
  const keyboard = keyboardView(exercise, seconds, mobile, reducedMotion);
  const keyboardWidth = mobile ? 1480 : Math.min(1300, keyboard.count * 91);
  const keyboardNotes = mobile ? vocalPhraseNotes(exercise, practice.current) : notes;
  const sounding = new Set(
    keyboardNotes
      .filter((n) => n.onsetBeat <= scene.beat && scene.beat < n.onsetBeat + n.durationBeats)
      .map((n) => Math.round(notePitchAt(n, scene.beat)))
  );
  if (scene.phase === 'ready') {
    sounding.clear();
    for (const n of keyboardNotes)
      if (n.onsetBeat === keyboardNotes[0].onsetBeat) sounding.add(n.midi);
  }
  ctx.save();
  ctx.scale(canvas.width / WIDTH, canvas.height / (mobile ? MOBILE_HEIGHT : HEIGHT));
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, WIDTH, mobile ? MOBILE_HEIGHT : HEIGHT);
  const inset = (WIDTH - keyboardWidth) / 2;
  if (standalone)
    text(ctx, exercise.title ?? PATTERNS[spec.pattern].name, inset, 64, 22, C.ink, 600, 'left');
  const labels = {
    ready: 'READY',
    countin: `${Math.ceil(spec.countIn / 4)}-BAR COUNT-IN`,
    note: `ROUND ${practice.current.id + 1} OF ${exercise.rounds.length}`,
    rest: 'REST',
    complete: 'COMPLETE',
  };
  text(
    ctx,
    labels[scene.phase],
    standalone ? 800 : inset,
    standalone ? 128 : mobile ? 96 : 64,
    mobile ? 40 : 20,
    C.muted,
    600,
    standalone ? 'center' : 'left'
  );
  text(
    ctx,
    `${spec.bpm} BPM`,
    WIDTH - inset,
    mobile ? 96 : 64,
    mobile ? 40 : 20,
    C.muted,
    500,
    'right'
  );
  if (scene.phase === 'countin') {
    const currentBeat = Math.floor(scene.beat),
      currentBar = Math.floor(currentBeat / 4);
    const bars = Math.ceil(spec.countIn / 4);
    text(
      ctx,
      String(scene.count),
      800,
      mobile ? 365 : 295,
      mobile ? 260 : 174,
      scene.count === 1 ? C.accent : C.ink,
      500
    );
    text(
      ctx,
      `BAR ${currentBar + 1} OF ${bars} · 4/4`,
      800,
      mobile ? 510 : 399,
      mobile ? 34 : 22,
      C.muted,
      500
    );
    const cardWidth = mobile ? 540 : 264,
      gap = mobile ? 40 : 20,
      left = 800 - (bars * cardWidth + (bars - 1) * gap) / 2;
    for (let bar = 0; bar < bars; bar++) {
      const x = left + bar * (cardWidth + gap),
        active = bar === currentBar,
        complete = bar < currentBar;
      rounded(
        ctx,
        x,
        mobile ? 565 : 432,
        cardWidth,
        mobile ? 145 : 88,
        14,
        active ? '#edf1e3' : C.paper,
        active ? '#acbf86' : C.line
      );
      text(
        ctx,
        `BAR ${bar + 1}${complete ? ' · DONE' : active ? ' · NOW' : ''}`,
        x + cardWidth / 2,
        mobile ? 601 : 452,
        mobile ? 26 : 15,
        active ? C.ink : C.muted,
        600
      );
      const beats = Math.min(4, spec.countIn - bar * 4);
      for (let beat = 0; beat < beats; beat++) {
        const absoluteBeat = bar * 4 + beat,
          now = absoluteBeat === currentBeat,
          past = absoluteBeat < currentBeat;
        const cx = x + cardWidth / 2 + (beat - (beats - 1) / 2) * (mobile ? 96 : 48);
        const pulse = now ? 1 - (scene.beat - currentBeat) : 0;
        ctx.beginPath();
        ctx.arc(cx, mobile ? 660 : 488, (mobile ? 26 : 15) + 3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = now ? C.accent : past ? C.green : '#e5e8dd';
        ctx.fill();
        if (beat === 0) {
          ctx.strokeStyle = active ? C.accent : '#b6c59a';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        text(
          ctx,
          String(beat + 1),
          cx,
          mobile ? 660 : 488,
          mobile ? 28 : 16,
          now ? C.white : past ? C.ink : C.muted,
          now ? 700 : 500
        );
      }
    }
  } else if (scene.phase === 'complete') {
    centeredGlyphs(ctx, '✓', 800, mobile ? 528 : 350, mobile ? 260 : 150, '#779c40');
  }
  // The notes share an optical centerline. Their labels and the progress track
  // are placed from measured ink bounds, independently of the note's spelling.
  const compact = scene.phase === 'countin';
  const noteY = compact ? (mobile ? 820 : 560) : mobile ? 528 : 350;
  const currentSize = compact ? (mobile ? 48 : 28) : mobile ? 250 : 148;
  const nextSize = compact ? currentSize : mobile ? 190 : 110;
  const noteLabel = (round: PracticeRound | null) =>
    round ? (spec.solfege ? solfege(round.degree) : noteName(round.midi, spec.key)) : '—';
  ctx.font = `500 ${currentSize}px Arial, sans-serif`;
  const primaryMetrics = ctx.measureText(noteLabel(practice.current));
  const primaryHeight =
    primaryMetrics.actualBoundingBoxAscent + primaryMetrics.actualBoundingBoxDescent;
  const labelY = compact ? (mobile ? 764 : 524) : noteY - primaryHeight / 2 - (mobile ? 56 : 34);
  const currentX = compact ? 650 : 520;
  const nextX = compact ? 950 : 1080;
  if (scene.phase !== 'complete') {
    text(
      ctx,
      'CURRENT',
      currentX,
      labelY,
      compact ? (mobile ? 26 : 14) : mobile ? 40 : 20,
      C.muted,
      600
    );
    text(ctx, 'NEXT', nextX, labelY, compact ? (mobile ? 26 : 14) : mobile ? 40 : 20, C.muted, 600);
    const current = centeredGlyphs(
      ctx,
      noteLabel(practice.current),
      currentX,
      noteY,
      currentSize,
      C.ink
    );
    centeredGlyphs(ctx, noteLabel(practice.next), nextX, noteY, nextSize, C.muted);
    const rangeY = current.top + current.height + (compact ? (mobile ? 36 : 22) : mobile ? 54 : 30);
    for (const [round, x] of [
      [practice.current, currentX],
      [practice.next, nextX],
    ] as const) {
      if (!round) continue;
      const range = practiceRange(exercise, round);
      text(
        ctx,
        `${noteName(range.low, spec.key)} – ${noteName(range.high, spec.key)}`,
        x,
        rangeY,
        compact ? (mobile ? 28 : 14) : mobile ? 44 : 22,
        C.muted,
        400
      );
    }
    if (!compact) {
      const progressY = rangeY + (mobile ? 42 : 26);
      rounded(ctx, current.left, progressY, current.width, 4, 2, C.line);
      rounded(ctx, current.left, progressY, current.width * practice.progress, 4, 2, C.accent);
      const hint =
        scene.phase === 'rest'
          ? `Next round in ${scene.count}`
          : scene.phase === 'ready' && spec.countIn
            ? `${spec.countIn % 4 === 0 ? `${spec.countIn / 4}-bar` : `${spec.countIn}-beat`} count-in`
            : '';
      if (hint) text(ctx, hint, 800, mobile ? 820 : 550, mobile ? 36 : 20, C.muted);
    }
  }
  const { low, high, left, count } = keyboard;
  const whites: number[] = [];
  for (let n = low; n <= high; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  const width = keyboardWidth,
    x0 = (WIDTH - width) / 2,
    keyW = width / count,
    y0 = mobile ? 930 : 637,
    keyH = mobile ? 500 : 170;
  rounded(ctx, x0 - 8, y0 - 8, width + 16, keyH + 16, 16, '#dde1d6');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, width, keyH);
  ctx.clip();
  for (const n of whites) {
    const i = whiteKeyPosition(n) - left;
    const active = sounding.has(n);
    const inRange = n >= spec.low && n <= spec.high;
    rounded(
      ctx,
      x0 + i * keyW + 1,
      y0,
      keyW - 2,
      keyH,
      7,
      active ? C.green : inRange ? C.white : '#f1f2eb',
      '#dce0d4'
    );
    if (n % 12 === 0 || active)
      text(
        ctx,
        noteName(n, spec.key),
        x0 + (i + 0.5) * keyW,
        y0 + keyH - (mobile ? 48 : 25),
        Math.min(mobile ? 42 : 18, keyW * (mobile ? 0.48 : 0.3)),
        active ? C.ink : C.muted,
        active ? 700 : 400
      );
  }
  for (let n = low; n <= high; n++) {
    if (![1, 3, 6, 8, 10].includes(n % 12)) continue;
    const prevIndex = whiteKeyPosition(n - 1) - left;
    const active = sounding.has(n);
    rounded(
      ctx,
      x0 + (prevIndex + 1) * keyW - keyW * 0.3,
      y0,
      keyW * 0.6,
      keyH * 0.61,
      5,
      active ? '#a8c769' : C.ink
    );
  }
  ctx.restore();
  const glide = scene.phase === 'note' && scene.note?.glideSpan ? scene.note : null;
  if (glide) {
    const keyCenter = (midi: number) =>
      whiteKeyPosition(midi) + ([1, 3, 6, 8, 10].includes(midi % 12) ? 1 : 0.5);
    const xAt = (midi: number) => {
      const lower = Math.floor(midi),
        fraction = midi - lower;
      return (
        x0 + (keyCenter(lower) * (1 - fraction) + keyCenter(lower + 1) * fraction - left) * keyW
      );
    };
    const y = y0 - (mobile ? 36 : 24);
    rounded(
      ctx,
      Math.min(xAt(glide.midi), xAt(glide.midi + glide.glideSpan!)),
      y - 2,
      Math.abs(xAt(glide.midi + glide.glideSpan!) - xAt(glide.midi)),
      4,
      2,
      C.line
    );
    ctx.beginPath();
    ctx.arc(xAt(notePitchAt(glide, scene.beat)), y, mobile ? 14 : 8, 0, Math.PI * 2);
    ctx.fillStyle = C.accent;
    ctx.fill();
  }
  if (spec.transition !== null && spec.transition >= low && spec.transition <= high) {
    const black = [1, 3, 6, 8, 10].includes(spec.transition % 12);
    const index = whiteKeyPosition(spec.transition) - left;
    const x = x0 + (index + (black ? 1 : 0.5)) * keyW;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0 - 25);
    ctx.lineTo(x, y0 + keyH + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, 'YOUR TRANSITION', x, y0 - 42, 14, C.accent, 600);
  }
  text(
    ctx,
    `${noteName(spec.low, spec.key)} — ${noteName(spec.high, spec.key)}`,
    inset,
    mobile ? 1510 : 850,
    mobile ? 40 : 18,
    C.muted,
    500,
    'left'
  );
  ctx.restore();
  return { keyboardInsetPercent: (inset / WIDTH) * 100 };
}
