import { hymnSystemLayout } from "./hymn-system-layout";
import { abcPlaybackStaves, hidePlaybackStaves, restoreDeclaredStaffTitles } from "./hymn-playback-staves";
import { attachPianoChordDiagrams } from "./piano-chord-triggers";
import {editionTempoLabel,isGuitarPositionMark} from "./edition-score";
import type {CapoChoice} from "./guitar-capo";
import {showChordsOnly,spaceGuitarSymbols} from "./chords-only";
import {chordEdition,capoAudio,type ChordEditionId} from "./chord-editions";
import { drawBeginnerFingerings, separateBeginnerFingerings, alignSimultaneousTab, normalizeGuitarRests, beginnerSystems, drawRhythmicTab, normalizeBeginnerLandmarks, type BeginnerInstrument } from "./beginner-score";
import { preserveFingerstyleTab, showOnlyTab, normalizeFingerstyleTab } from "./fingerstyle-tab";
import { attachChordDiagrams } from "./guitar-chord-diagram";
import { scoreChordPassages } from "./chord-passage-fingering";
import { drawGuitarFingerings } from "./guitar-fingering-view";
import { hasSwing, swingAudio, swingBeat } from "./hymn-swing";
import { drawHymnFingerings } from "./hymn-fingering";
import {
  hymnLyricsAbc,
  compactHymnLyrics,
  type HymnLyricsSelection,
} from "./hymn-lyrics";
import {
  scorePosition,
  scoreBarSpan,
  type ScorePosition,
} from "./passage-selection";
import { STAFF_LINE_GAP, ABC_STAFF_LINE_GAP } from "./notation-metrics";
import abcjs, {
  type NoteTimingEvent,
  type TuneObject,
  type AudioTracks,
  type MidiPitch,
  type AbsoluteElement,
} from "abcjs";
import { scoreSpellings, type PitchSpellings } from "./sight-feedback";
import { applyHymnOttava, drawHymnOttava, fitHymnOttava } from "./hymn-ottava";
import { initialHymnSignatures } from "./hymn-signatures";
export type PracticeEvent = NoteTimingEvent & {
  spellings?: PitchSpellings;
  scorePosition?: ScorePosition;
  scoreBarSpan?: { start: number; end: number };
  sustainedPitches?: number[];
};
/** Recover tied continuations from each voice's original MIDI spelling, without changing engraving or playback. */
export function tiedContinuations(tune: TuneObject): Map<number, MidiPitch[]> {
  const result = new Map<number, MidiPitch[]>(),
    voices = new Map<string, Map<number, MidiPitch>>();
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries())
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const key = `${si}:${vi}`,
          previous = voices.get(key) || new Map<number, MidiPitch>();
        voices.set(key, previous);
        for (const note of voice) {
          if (note.el_type !== "note") continue;
          const attacks = [...(note.midiPitches || [])],
            continuations: MidiPitch[] = [];
          for (const pitch of note.pitches || []) {
            const midi = pitch.endTie
              ? previous.get(pitch.pitch)
              : attacks.shift();
            if (!midi) continue;
            previous.set(pitch.pitch, midi);
            if (pitch.endTie) continuations.push(midi);
          }
          if (continuations.length && note.startChar !== undefined)
            result.set(note.startChar, continuations);
        }
      }
  return result;
}
export function drawPracticeScore(
  paper: HTMLElement,
  abc: string,
  width: number,
  options: {
    fitHymnSystems?: boolean;
    scale?: number;
    staffScale?: number;
    fingerings?: boolean;
    guitarTab?: boolean;
    guitarMidiOffset?: number;
    fingerstyleTab?: boolean;
    beginnerEdition?: BeginnerInstrument;
    hymnEdition?: ChordEditionId;
    fromBar?: number;
    tabOnly?: boolean;
    chordTab?: boolean;
    chordsOnly?: boolean;
    lyrics?: HymnLyricsSelection;
    transpose?: number;
    compact?: boolean;
    rhythmGrid?: boolean;
    reattackTies?: boolean;
    octaveNotation?: boolean;
    printedScore?: boolean;
    hiddenStaves?: readonly number[];
    showChordSymbols?: boolean;
    initialSignatures?: boolean;
    guitarSetup?: { capo: number; key: string };
    capoChoice?: CapoChoice;
    capoAccompaniment?: boolean;
    guitarAccompaniment?: {capo:number;positionFor:NonNullable<Parameters<typeof scoreChordPassages>[1]>["positionFor"]};
    playback?: (audio: AudioTracks) => void;
  } = {},
): PracticeEvent[] {
  const sourceProfile=options.hymnEdition?chordEdition({id:options.hymnEdition}):undefined;
  const profile=sourceProfile && options.beginnerEdition === "guitar" && options.guitarSetup
    ? {...sourceProfile,capo:options.guitarSetup.capo,
      position:options.capoChoice ? (pitch:number,chord:boolean,transpose=0,group?:readonly number[])=>{
        if(options.capoAccompaniment && options.capoChoice!.scoreSetting)return sourceProfile.position(pitch,chord,transpose);
        const grip=options.capoAccompaniment && group ? options.capoChoice!.accompaniment?.get(group.map(p=>p-transpose).sort((a,b)=>a-b).join(",")) : undefined;
        const positions=grip?.positions || options.capoChoice!.positions;
        return positions.get(`${pitch-transpose}:${chord?1:0}`) || positions.get(`${pitch-transpose}:${chord?0:1}`);
      } : sourceProfile.position,
      fingers:(instrument:BeginnerInstrument,bar:number,voice:number,pitches:number[],force?:boolean)=>{
        const raw=pitches.map(p=>p-options.guitarSetup!.capo);
        const grip=options.capoAccompaniment ? options.capoChoice?.accompaniment?.get([...raw].sort((a,b)=>a-b).join(",")) : undefined;
        return options.capoChoice && !options.capoChoice.scoreSetting
          ? raw.map(p=>(grip?.fingers || options.capoChoice!.fingers).get(`${p}:${pitches.length>1?1:0}`) ?? null)
          : sourceProfile.fingers(instrument,bar,voice,pitches.map(p=>p-options.guitarSetup!.capo+sourceProfile.capo),force);
      }}
    : sourceProfile;
  if(options.guitarSetup) abc=abc.replace(/^(Q:)"Capo \d+"\s*/gm,"$1");
  if(options.capoChoice && !options.capoChoice.scoreSetting) abc=abc.replace(/"\^([IVX]+)"/g,(all,label)=>isGuitarPositionMark(label)?"":all);
  if (options.lyrics) abc = hymnLyricsAbc(abc, options.lyrics);
  const staffScale = options.staffScale ?? 1;
  const scale =
    (STAFF_LINE_GAP / ABC_STAFF_LINE_GAP) * (options.scale ?? 1) * staffScale;
  const transpose = options.transpose ?? 0;
  let restoreSignatures: (() => void) | undefined;
  // abcjs rounds font sizes to whole SVG pixels. Reserve enough lyric space,
  // then restore the exact font size below so staff tuning never resizes words.
  const vocalFont = (Math.ceil(16 / staffScale) * 3) / 4;
  const source =
    (!options.fitHymnSystems && (options.guitarTab || options.fingerstyleTab) && !options.beginnerEdition && !profile ? `%%barsperstaff ${width < 600 ? 2 : 4}\n` : "") +
    `%%vocalfont sans-serif ${vocalFont}\n` +
    (options.fitHymnSystems ? "%%stretchlast 0\n" : "") +
    (options.beginnerEdition ? "%%staffsep 24\n%%sysstaffsep 28\n%%musicspace 4\n" + (!options.fitHymnSystems ? "%%stretchlast 1\n" : "") : "") + (!options.fitHymnSystems && options.beginnerEdition && !profile ? beginnerSystems(abc, width < 600 ? 1 : width < 1100 ? 2 : 4) : abc);
  const prepareTune = (tune: TuneObject) => {
    restoreDeclaredStaffTitles(tune,source);
    if (options.hiddenStaves?.length) hidePlaybackStaves(tune, options.hiddenStaves);
    if (options.printedScore)
      tune.lines.slice(1).forEach(line => line.staff?.forEach(staff => { delete (staff as typeof staff & {title?: unknown}).title; }));
    if (options.showChordSymbols === false)
      for (const line of tune.lines) for (const staff of line.staff || []) for (const voice of staff.voices || [])
        for (const item of voice) if (item.el_type === "note") item.chord = item.chord?.filter((chord:{position?:string}) => chord.position !== "default");
    // abcjs's multi-system tab layout dereferences empty-staff placeholders.
    // Keep the melody staff's placeholder as an explicit no-op plugin.
    if (options.chordTab) {
      const tabs = (
        tune as typeof tune & {
          tablatures?: ({
            params: object;
            instance: { render(): void };
          } | null)[];
        }
      ).tablatures;
      if (tabs && !tabs[0])
        tabs[0] = { params: {}, instance: { render() {} } };
    }

    if (options.fingerstyleTab) preserveFingerstyleTab(tune, transpose, profile?.position);
    if (options.octaveNotation) applyHymnOttava(tune);
    if (options.initialSignatures)
      restoreSignatures = initialHymnSignatures(tune);
    if (options.lyrics) compactHymnLyrics(tune);
    for (const line of tune.lines)
      for (const staff of line.staff || [])
        for (const voice of staff.voices || [])
          for (const item of voice)
            if (item.el_type === "note")
              for (const lyric of item.lyric || [])
                lyric.syllable =
                  "\u2002" + lyric.syllable.replace(/\u2002/g, "") + "\u2002";
    return tune;
  };
  const staffwidth = Math.max(140, width / scale - 24);
  // Optional finger numbers must not move measures when toggled. Reserve their
  // small annotation allowance for every practice score, including when hidden.
  const lineBreaks = options.fitHymnSystems ? hymnSystemLayout(source, {
    visualTranspose: transpose, initialClef: options.initialSignatures,
    minPadding: options.beginnerEdition ? 4 : undefined,
    afterParsing: prepareTune,
  }, staffwidth, !options.printedScore || !!options.guitarTab, [options.hiddenStaves, options.showChordSymbols, options.initialSignatures, options.octaveNotation, options.printedScore]) : undefined;
  const tune = abcjs.renderAbc(paper, source, {
    lineBreaks,
    add_classes: true,
    tablature: options.chordTab
      ? [{ instrument: "" }, { instrument: "guitar" }]
      : options.guitarTab
        ? [{ instrument: "guitar" }]
        : undefined,
    initialClef: options.initialSignatures,
    visualTranspose: transpose,
    // Reserve breathing room around lyrics before abcjs computes note positions.
    // Remove these measurement-only spaces from the SVG after engraving.
    afterParsing: prepareTune,
    responsive: "resize",
    oneSvgPerLine: true,
    staffwidth,
    minPadding: options.beginnerEdition ? 4 : undefined,
    // SongAlong supplies measured breaks. Legacy tablature avoids automatic
    // wrapping, whose reparse drops the plugin; other exercises keep wrapping.
    wrap:
      options.fitHymnSystems || options.rhythmGrid || options.guitarTab || options.fingerstyleTab || (options.beginnerEdition && !profile)
        ? undefined
        : { minSpacing: 2, maxSpacing: 2.6, preferredMeasuresPerLine: 0 },
    timeBasedLayout: options.rhythmGrid
      ? { minPadding: 8, minWidth: Math.max(100, width / scale - 24) }
      : undefined,
    paddingtop: 12,
    paddingbottom: 18,
    paddingleft: 12,
    paddingright: 12,
  })[0] as TuneObject & { noteTimings: NoteTimingEvent[] };
  if (options.chordTab)
    for (const line of tune.lines)
      for (const voice of line.staff?.[1]?.voices || [])
        for (const item of voice) {
          const absolute = (item as typeof item & { abselem?: AbsoluteElement })
            .abselem;
          for (const element of absolute?.elemset || []) element.remove();
        }
  if (options.chordTab)
    for (const svg of paper.querySelectorAll("svg")) {
      const staves = [
        ...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff"),
      ].sort((a, b) => a.getBBox().y - b.getBBox().y);
      if (staves.length !== 3) continue;
      const hidden = staves[1].getBBox(),
        tab = staves[2].getBBox();
      const gap = tab.y - hidden.y;
      staves[1].remove();
      svg
        .querySelectorAll(".abcjs-staff-extra.abcjs-v1")
        .forEach((element) => element.remove());
      for (const bar of svg.querySelectorAll<SVGGraphicsElement>(
        ".abcjs-bar.abcjs-v1",
      )) {
        const bounds = bar.getBBox();
        const line = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "line",
        );
        line.setAttribute("x1", String(bounds.x));
        line.setAttribute("x2", String(bounds.x));
        line.setAttribute("y1", String(tab.y - gap));
        line.setAttribute("y2", String(tab.y + tab.height - gap));
        line.setAttribute("stroke", "currentColor");
        bar.parentElement?.appendChild(line);
        bar.remove();
      }
      for (const element of svg.querySelectorAll(".abcjs-v2,.abcjs-tabNumber"))
        element.setAttribute(
          "transform",
          `translate(0, ${-gap}) ${element.getAttribute("transform") || ""}`,
        );
      const box = svg.viewBox.baseVal;
      svg.setAttribute(
        "viewBox",
        `${box.x} ${box.y} ${box.width} ${box.height - gap}`,
      );
    }
  restoreSignatures?.();
  if (!tune || tune.warnings?.length)
    throw Error("Practice notation could not be read");
  if (options.octaveNotation) drawHymnOttava(applyHymnOttava(tune));
  paper.querySelectorAll(".abcjs-lyric").forEach((lyric) => {
    if (staffScale !== 1)
      lyric.setAttribute("font-size", String(16 / staffScale));
    const walker = document.createTreeWalker(lyric, NodeFilter.SHOW_TEXT);
    while (walker.nextNode())
      walker.currentNode.textContent = walker.currentNode.textContent!.replace(
        /\u2002/g,
        "",
      );
    // An empty lyric at SVG origin expands its parent note's bounding box
    // across every preceding system. It has no ink or musical meaning.
    if (!lyric.textContent?.trim()) lyric.remove();
  });
  // abcjs keeps audio at source pitch unless both transpositions are specified.
  // Use the same shift so notation, spellings and MIDI grading agree.
  const swinging = hasSwing(abc);
  const audioOptions = {
    // Guitar tab uses the conventional written octave, sounding one octave lower.
    midiTranspose: transpose + (options.guitarMidiOffset ?? (options.guitarTab ? -12 : 0)),
    ...(options.playback ? { qpm: 60, chordsOff: true } : {}),
    ...(options.printedScore ? { chordsOff: true } : {}),
  };
  const visibleAudio = tune.setUpAudio(audioOptions);
  let audio = swingAudio(options.hiddenStaves?.length
    ? abcjs.parseOnly(source)[0].setUpAudio(audioOptions) : visibleAudio, swinging);
  if (profile && options.beginnerEdition === "guitar") {
    audio = capoAudio(audio,profile.capo);
    for (const line of tune.lines) for (const staff of line.staff || [])
      for (const voice of staff.voices || []) for (const note of voice)
        if (note.el_type === "note") for (const pitch of note.midiPitches || []) pitch.pitch += profile.capo;
  }
  if (!(options.fingerstyleTab && options.guitarTab)) options.playback?.(audio);
  // Playback uses quarter-note BPM, including compound meters.
  tune.setTiming(options.playback ? (60 * 0.25) / tune.getBeatLength() : 60, 0);
  const chordPassages = options.guitarAccompaniment
    ? scoreChordPassages(tune,{...options.guitarAccompaniment,staffIndexes:[1]})
    : options.guitarTab || options.beginnerEdition === "guitar"
    ? scoreChordPassages(tune, { positionFor: profile?.position, capo: profile?.capo, transpose })
    : [];
  paper
    .querySelectorAll(".abcjs-title,.abcjs-subtitle")
    .forEach((e) => e.remove());
  paper.querySelectorAll("svg").forEach((svg) => {
    if (!svg.querySelector(".abcjs-staff")) {
      const wrapper = svg.parentElement;
      svg.remove();
      if (wrapper !== paper && wrapper?.classList.contains("abcjs-container"))
        wrapper.remove();
    }
  });
  if (options.beginnerEdition === "guitar") normalizeGuitarRests(tune, options.fromBar || 0);
  if (options.fingerstyleTab && options.guitarTab) normalizeFingerstyleTab(paper, !!profile && tune.lines[0]?.staff?.[0]?.voices?.length === 1);
  if (options.beginnerEdition) normalizeBeginnerLandmarks(paper, tune, options.fromBar || 0, profile?.pickup ?? false);
  if (options.guitarTab && !!profile) alignSimultaneousTab(tune, options.fromBar || 0);
  if (options.guitarTab && options.fingerstyleTab) drawRhythmicTab(tune, paper, options.fromBar || 0, transpose, profile ? (pitch,chord,shift,group)=>profile.position(pitch-profile.capo,chord,shift,group?.map(p=>p-profile.capo)) : undefined, !!options.tabOnly, !!profile);
  // Measure editorial annotations even when hidden, so the score keeps its
  // geometry when fingerings are toggled. Remove the provisional marks below.
  if (options.beginnerEdition)
    drawBeginnerFingerings(tune, options.beginnerEdition, options.fromBar || 0, transpose, !!options.tabOnly, profile ? (instrument,bar,voice,pitches)=>profile.fingers(instrument,bar,voice,pitches,bar===(options.fromBar||0)) : undefined, !profile, !!profile);
  if (options.beginnerEdition) separateBeginnerFingerings(paper);
  if (!!profile && options.beginnerEdition === "guitar" && !options.chordsOnly) spaceGuitarSymbols(paper);
  if (options.tabOnly) showOnlyTab(paper, profile ? editionTempoLabel({...profile,capo:options.guitarSetup ? 0 : profile.capo},tune.lines.flatMap(line=>line.staff?.flatMap(staff=>staff.voices?.flatMap(voice=>voice.flatMap(note=>note.el_type==='part'?[note.title]:[]))||[])||[])) : undefined, profile ? 58 : undefined);
  if (options.chordsOnly) showChordsOnly(paper,tune);
  // Explicit physical size prevents short systems and responsive wrappers from
  // stretching staff lines and glyphs differently in each exercise.
  paper.querySelectorAll("svg").forEach((svg) => {
    if (options.octaveNotation) fitHymnOttava(svg);
    if (options.compact) {
      const group = svg.querySelector<SVGGraphicsElement>(
        ".abcjs-staff-wrapper",
      );
      if (group) {
        const ink = group.getBBox();
        const box = svg.viewBox.baseVal;
        svg.setAttribute(
          "viewBox",
          `${box.x} ${box.y} ${Math.min(box.width, Math.ceil(ink.x + ink.width + 12))} ${box.height}`,
        );
      }
      svg.style.marginInline = "auto";
    }
    // abcjs's per-system SVG can end exactly at the last lyric's ink bounds.
    // Reserve space inside the viewBox so lower stanzas don't touch its edge.
    const screen = svg.getScreenCTM();
    if (screen && options.lyrics) {
      const inverse = screen.inverse();
      const box = svg.viewBox.baseVal;
      let bottom = box.y + box.height;
      for (const lyric of svg.querySelectorAll<SVGGraphicsElement>(
        ".abcjs-lyric",
      )) {
        const transform = lyric.getScreenCTM();
        if (!transform) continue;
        const bounds = lyric.getBBox();
        const matrix = inverse.multiply(transform);
        for (const x of [bounds.x, bounds.x + bounds.width])
          bottom = Math.max(
            bottom,
            new DOMPoint(x, bounds.y + bounds.height).matrixTransform(matrix)
              .y + 12,
          );
      }
      if (bottom > box.y + box.height)
        svg.setAttribute(
          "viewBox",
          `${box.x} ${box.y} ${box.width} ${bottom - box.y}`,
        );
    }
    if (options.guitarTab || options.fingerstyleTab || options.beginnerEdition) {
      // abcjs can place chord labels outside a per-system SVG's viewBox.
      const screen = svg.getScreenCTM();
      if (screen) {
        const inverse = screen.inverse(),
          box = svg.viewBox.baseVal;
        let top = options.beginnerEdition ? Infinity : box.y,
          bottom = options.beginnerEdition ? -Infinity : box.y + box.height;
        for (const ink of svg.querySelectorAll<SVGGraphicsElement>(
          options.chordsOnly ? ".abcjs-lyric,.abcjs-chord,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.chord-chart-bars,.chord-chart-fermata" : options.tabOnly
            ? ".guitar-fermata,.guitar-position,.abcjs-lyric,.abcjs-staff,.fingerstyle-tab-clef,.fingerstyle-tab-bars,.tab-rhythm-continuation,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.abcjs-chord,.abcjs-tabNumber,.tab-rhythm,.tab-rhythm-stem,.tab-rhythm-rest,.tab-rhythm-flag,.tab-rhythm-tie,.beginner-fingering,.beginner-picking,.beginner-string"
            : ".abcjs-annotation,.guitar-position,.abcjs-staff,.abcjs-staff-extra,.abcjs-bar,.abcjs-bar-number,.abcjs-part,.abcjs-tempo,.abcjs-clef,.abcjs-chord,.abcjs-tabNumber,.abcjs-note,.abcjs-beam,.abcjs-slur,.beginner-fingering,.beginner-picking,.beginner-string",
        )) {
          if (getComputedStyle(ink).visibility === "hidden") continue;
          const matrix = ink.getScreenCTM();
          if (!matrix) continue;
          const bounds = ink.getBBox(),
            transform = inverse.multiply(matrix);
          if (!bounds.width && !bounds.height) continue;
          top = Math.min(
            top,
            new DOMPoint(bounds.x, bounds.y).matrixTransform(transform).y - 12,
          );
          bottom = Math.max(
            bottom,
            new DOMPoint(
              bounds.x + bounds.width,
              bounds.y + bounds.height,
            ).matrixTransform(transform).y + 12,
          );
        }
        if (Number.isFinite(top) && Number.isFinite(bottom))
          svg.setAttribute(
            "viewBox",
            `${box.x} ${top} ${box.width} ${bottom - top}`,
          );
      }
    }
    if (options.printedScore) {
      // A narrow choir/organ system can exceed abcjs's requested staff width.
      // Fit all printed ink rather than cropping a pickup or its lyric rows.
      const ink = svg.getBBox();
      if (ink.width && ink.height) {
        const box = svg.viewBox.baseVal;
        const left = Math.min(box.x, ink.x - 8);
        const right = Math.max(box.x + box.width, ink.x + ink.width + 8);
        const top = Math.min(box.y, ink.y - 8);
        const bottom = Math.max(box.y + box.height, ink.y + ink.height + 8);
        svg.setAttribute("viewBox", `${left} ${top} ${right - left} ${bottom - top}`);
      }
    }
    const box = svg.viewBox.baseVal;
    const fittedScale = Math.min(scale, width / box.width);
    svg.style.display = "block";
    svg.style.width = `${box.width * fittedScale}px`;
    svg.style.height = `${box.height * fittedScale}px`;
    svg.style.maxWidth = "100%";
  });
  if (options.hiddenStaves?.length && abcPlaybackStaves(abc).every(staff=>options.hiddenStaves!.includes(staff.index)))
    paper.querySelectorAll<SVGSVGElement>('svg').forEach(svg=>svg.style.display='none');
  if (options.guitarSetup) {
    const heading=document.createElement("div");
    heading.className="hymn-score-setup";
    heading.textContent=`${options.guitarSetup.capo ? `Capo ${options.guitarSetup.capo}` : "No capo"} · Sounding key: ${options.guitarSetup.key} major`;
    paper.prepend(heading);
  }
  if (!options.fingerings) paper.querySelectorAll(".beginner-fingering,.beginner-picking,.beginner-string").forEach(mark=>mark.remove());
  attachChordDiagrams(paper, chordPassages);
  if (options.printedScore && !options.guitarAccompaniment) attachPianoChordDiagrams(paper, tune);
  if (options.fingerings && !options.beginnerEdition) {
    if (options.guitarTab) drawGuitarFingerings(tune, !!options.chordTab);
    else drawHymnFingerings(tune);
  }
  // abcjs timings reference staff glyphs but omit their engraved tab clones.
  const tabElements = new Map<number, HTMLElement[]>();
  if (options.guitarTab)
    for (const line of tune.lines)
      for (const staff of (line.staff || []).filter(staff => String(staff.clef?.type) !== "TAB"))
        for (const voice of staff.voices || [])
          for (const item of voice) {
            if (item.el_type !== "note" || item.startChar === undefined)
              continue;
            const absolute = (
              item as typeof item & {
                abselem?: AbsoluteElement & {
                  cloned?: { elemset?: HTMLElement[] };
                };
              }
            ).abselem;
            const elements = absolute?.cloned?.elemset;
            if (elements?.length) tabElements.set(item.startChar, elements);
          }
  if (options.fingerstyleTab && options.guitarTab) {
    // abcjs's multi-voice tab layout mutates its timing data at system breaks.
    // Build the musical timeline from the notation edition, then attach its
    // events to the visible notation/tab glyphs by source position.
    const elements = new Map<number, HTMLElement[]>();
    for (const line of tune.lines)
      for (const staff of (line.staff || []).filter(staff => String(staff.clef?.type) !== "TAB"))
        for (const voice of staff.voices || [])
          for (const note of voice) {
            if (note.el_type !== "note" || note.startChar === undefined) continue;
            const absolute = (note as typeof note & { abselem?: AbsoluteElement }).abselem;
            elements.set(note.startChar, [
              ...((options.tabOnly ? [] : absolute?.elemset || []) as unknown as HTMLElement[]),
              ...(tabElements.get(note.startChar) || []),
            ]);
          }
    const musical = drawPracticeScore(document.createElement("div"), abc, width, {
      ...options,
      lyrics: undefined, // Already applied above, retaining identical source positions.
      guitarTab: false,
      tabOnly: false,
    });
    return musical.map(event => ({
      ...event,
      elements: (event.startCharArray || [event.startChar!]).map(start => elements.get(start) || []),
    }));
  }
  const spellings = scoreSpellings(tune, options.beginnerEdition === "guitar" ? options.guitarSetup?.key : undefined);
  const continuations = options.reattackTies
    ? tiedContinuations(tune)
    : new Map<number, MidiPitch[]>();
  const sounding = audio.tracks.flat().filter((n) => n.cmd === "note");
  const meter = tune.getMeterFraction();
  const barLength = tune.getBarLength() * 4;
  const pickup = tune.getPickupLength() * 4;
  const pulse =
    meter.den === 8 && meter.num > 3 && meter.num % 3 === 0
      ? 1.5
      : 4 / (meter.den || 4);
  let heldTab: HTMLElement[] = [];
  return tune.noteTimings
    .filter((e) => e.type === "event")
    .map((e) => {
      const currentTab = (e.startCharArray || [e.startChar!]).flatMap(
        (start) => tabElements.get(start) || [],
      );
      if (currentTab.length) heldTab = currentTab;
      const milliseconds = swinging ? swingBeat(e.milliseconds / 1000) * 1000 : e.milliseconds;
      return {
        ...e,
        milliseconds,
        elements: options.guitarTab
          ? [...(e.elements || []), options.chordTab ? heldTab : currentTab]
          : e.elements,
        scorePosition:
          options.playback && barLength > 0 && Number.isFinite(barLength)
            ? scorePosition(e.milliseconds / 1000, barLength, pickup, pulse)
            : undefined,
        scoreBarSpan:
          options.playback && barLength > 0 && Number.isFinite(barLength)
            ? scoreBarSpan(e.milliseconds / 1000, barLength, pickup)
            : undefined,
        midiPitches: [
          ...(e.midiPitches || []),
          ...(e.startCharArray || [e.startChar!]).flatMap(
            (start) => continuations.get(start) || [],
          ),
        ],
        // Hymn timings use quarter-note seconds (qpm 60). Only notes still sounding
        // before this onset are recovery notes; releases exactly on it are excluded.
        sustainedPitches: options.playback
          ? [
              ...new Set(
                sounding
                  .filter(
                    (n) =>
                      n.start * 4000 < milliseconds - 1 &&
                      (n.start + n.duration) * 4000 > milliseconds + 1,
                  )
                  .map((n) => n.pitch),
              ),
            ]
          : [],
        spellings: Object.assign(
          {},
          ...(e.startCharArray || [e.startChar!]).map(
            (start) => spellings.get(start) || {},
          ),
        ),
      };
    })
    .filter((e) => e.midiPitches.length);
}
export function highlightScore(
  paper: HTMLElement,
  event: NoteTimingEvent | undefined,
  viewport: HTMLElement,
  scroll = false,
  playhead = false,
  paused = false,
) {
  paper
    .querySelectorAll(".sight-current")
    .forEach((e) => e.classList.remove("sight-current"));
  const elements = (event?.elements || []).flat().filter(Boolean);
  elements.forEach((e) => e.classList.add("sight-current"));
  paper.classList.toggle("score-playback-position", playhead);
  paper.querySelectorAll(".score-playhead").forEach(node => node.remove());
  if (playhead && paused && elements[0]) {
    const element = elements[0] as unknown as SVGGraphicsElement;
    const svg = element.closest("svg");
    const head = element.querySelector<SVGGraphicsElement>(".abcjs-notehead") || element;
    const inverse = svg?.getScreenCTM()?.inverse(), matrix = head.getScreenCTM();
    if (svg && inverse && matrix) {
      const box = head.getBBox();
      const point = new DOMPoint(box.x + box.width / 2, box.y).matrixTransform(inverse.multiply(matrix));
      const cursor = document.createElementNS("http://www.w3.org/2000/svg", "g");
      cursor.classList.add("score-playhead");
      cursor.classList.toggle("is-paused", paused);
      cursor.setAttribute("aria-hidden", "true");
      const staves = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")].flatMap(staff => {
        const matrix = staff.getScreenCTM();
        if (!matrix) return [];
        const box = staff.getBBox(), transform = inverse.multiply(matrix);
        return [new DOMPoint(box.x,box.y).matrixTransform(transform).y,
          new DOMPoint(box.x,box.y+box.height).matrixTransform(transform).y];
      });
      if (staves.length) {
        const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const scale = svg.getScreenCTM()?.a || 1;
        const width = 48 / scale, padding = 44 / scale;
        const ns = "http://www.w3.org/2000/svg";
        const id = `score-position-${crypto.randomUUID()}`;
        const defs = document.createElementNS(ns,"defs");
        for (const [axis, color, stops] of [
          ["vertical","#10b981",[[0,0],[0.12,0.25],[0.88,0.25],[1,0]]],
          ["horizontal","white",[[0,0],[0.18,1],[0.82,1],[1,0]]],
        ] as const) {
          const gradient=document.createElementNS(ns,"linearGradient");
          gradient.id=`${id}-${axis}`;
          gradient.setAttribute("x2",axis === "horizontal" ? "100%" : "0%");
          gradient.setAttribute("y2",axis === "vertical" ? "100%" : "0%");
          for (const [offset,opacity] of stops) {
            const stop=document.createElementNS(ns,"stop");
            stop.setAttribute("offset",String(offset));stop.setAttribute("stop-color",color);
            stop.setAttribute("stop-opacity",String(opacity));gradient.append(stop);
          }
          defs.append(gradient);
        }
        const mask=document.createElementNS(ns,"mask");
        mask.id=`${id}-mask`;mask.setAttribute("maskContentUnits","objectBoundingBox");
        const maskFill=document.createElementNS(ns,"rect");
        maskFill.setAttribute("width","1");maskFill.setAttribute("height","1");
        maskFill.style.fill=`url(#${id}-horizontal)`;mask.append(maskFill);defs.append(mask);
        cursor.append(defs);
        band.style.fill=`url(#${id}-vertical)`;
        band.setAttribute("mask",`url(#${id}-mask)`);
        band.setAttribute("x", String(point.x - 3 - width / 2));
        band.setAttribute("y", String(Math.min(...staves) - padding));
        band.setAttribute("width", String(width));
        band.setAttribute("height", String(Math.max(...staves) - Math.min(...staves) + 2 * padding));
        band.setAttribute("rx", "4");
        cursor.append(band);
      }
      svg.insertBefore(cursor, svg.firstChild);
    }
  }
  if (scroll && elements[0]) {
    const note = (
      elements[0].closest("svg") || elements[0]
    ).getBoundingClientRect();
    const box = viewport.getBoundingClientRect();
    if (note.top < box.top || note.bottom > box.bottom)
      viewport.scrollTop += note.top - box.top - 12;
  }
}
export function eventSteps(events: PracticeEvent[], recoverSustains = false) {
  return events.map((e) => ({
    pitches: [...new Set(e.midiPitches!.map((p) => p.pitch))],
    ...(recoverSustains
      ? {
          retryPitches: [
            ...new Set([
              ...e.midiPitches!.map((p) => p.pitch),
              ...(e.sustainedPitches || []),
            ]),
          ],
        }
      : {}),
  }));
}
export function keyboardRange(events: NoteTimingEvent[]): [number, number] {
  const pitches = events.flatMap((e) => e.midiPitches!.map((p) => p.pitch));
  return [
    Math.floor(Math.min(...pitches) / 12) * 12,
    Math.ceil((Math.max(...pitches) + 1) / 12) * 12 - 1,
  ];
}
