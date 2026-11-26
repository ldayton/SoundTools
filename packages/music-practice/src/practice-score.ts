import {restoreSystemBarNumbers} from "./score-markings";
import {prepareScoreMarkings,addSwingHelp} from "./score-markings";
import { prepareHymnMelismas } from "./hymn-melismas";
import { AbcScoreLayout, prepareScoreLayoutSource } from "./score-layout/abc";
import { abcHasChordSymbols, abcPlaybackStaves, hidePlaybackStaves, restoreDeclaredStaffTitles } from "./hymn-playback-staves";
import { attachPianoChordDiagrams } from "./piano-chord-triggers";
import {isGuitarPositionMark} from "./edition-score";
import type {CapoChoice} from "./guitar-capo";
import {showChordsOnly,spaceGuitarSymbols} from "./chords-only";
import {chordEdition,capoAudio,type ChordEditionId} from "./chord-editions";
import { drawBeginnerFingerings, separateBeginnerFingerings, alignSimultaneousTab, normalizeGuitarRests, drawRhythmicTab, normalizeBeginnerLandmarks, type BeginnerInstrument } from "./beginner-score";
import { preserveFingerstyleTab, showOnlyTab, normalizeFingerstyleTab } from "./fingerstyle-tab";
import { attachChordDiagrams } from "./guitar-chord-diagram";
import { scoreChordPassages } from "./chord-passage-fingering";
import { drawGuitarFingerings } from "./guitar-fingering-view";
import { hasSwing, swingAudio, swingBeat } from "./hymn-swing";
import { drawHymnFingerings } from "./hymn-fingering";
import {
  hymnLyricsAbc,
  hymnLyricRows,
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
import { applyHymnOttava, drawHymnOttava } from "./hymn-ottava";
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
    barNumbers?: boolean;
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
      }
    : sourceProfile;
  if(options.guitarSetup) abc=abc.replace(/^(Q:)"Capo \d+"\s*/gm,"$1");
  if(options.capoChoice && !options.capoChoice.scoreSetting) abc=abc.replace(/"\^([IVX]+)"/g,(all,label)=>isGuitarPositionMark(label)?"":all);
  if (options.lyrics) abc = hymnLyricsAbc(abc, options.lyrics);
  const chordsOnly = options.chordsOnly || options.showChordSymbols !== false && abcHasChordSymbols(abc) && !!options.hiddenStaves?.length &&
    abcPlaybackStaves(abc).every(staff=>options.hiddenStaves!.includes(staff.index));
  const staffScale = options.staffScale ?? 1;
  const scale =
    (STAFF_LINE_GAP / ABC_STAFF_LINE_GAP) * (options.scale ?? 1) * staffScale;
  const transpose = options.transpose ?? 0;
  const initialSignatures=options.initialSignatures ?? !!options.fitHymnSystems;
  let restoreSignatures: (() => void) | undefined;
  const melismaSpace = options.lyrics && hymnLyricRows(options.lyrics).some(row => row.some(token => token.split(/\s+/).includes("_")));
  const source=prepareScoreLayoutSource(abc,{staffScale,melismas:!!melismaSpace,compactStaves:!!options.beginnerEdition});
  const prepareTune = (tune: TuneObject) => {
    prepareScoreMarkings(tune, options.barNumbers);
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
    if (initialSignatures)
      restoreSignatures = initialHymnSignatures(tune);
    if (options.lyrics) compactHymnLyrics(tune);
    return tune;
  };
  const layout = new AbcScoreLayout({
    source, width, scale,
    mode: options.rhythmGrid ? "rhythm" : options.fitHymnSystems || options.guitarTab || options.fingerstyleTab || options.beginnerEdition ? "reflow" : "wrap",
    annotations: !options.printedScore || !!options.guitarTab,
    presentation: {compact:options.compact,octaveNotation:options.octaveNotation,lyrics:!!options.lyrics,
      tablature:!!(options.guitarTab||options.fingerstyleTab),beginner:!!options.beginnerEdition,
      view:chordsOnly?"chords":options.tabOnly?"tab":"notation"},
    measurementContext: [options.hiddenStaves, options.showChordSymbols, initialSignatures, options.octaveNotation, options.printedScore, options.barNumbers,
      options.hymnEdition, options.guitarSetup, options.capoChoice?.scoreSetting,
      options.capoChoice ? [...options.capoChoice.positions] : undefined],
    params: {
    add_classes: true,
    tablature: options.chordTab
      ? [{ instrument: "" }, { instrument: "guitar" }]
      : options.guitarTab
        ? [{ instrument: "guitar" }]
        : undefined,
    visualTranspose: transpose,
    // Reserve breathing room around lyrics before abcjs computes note positions.
    // Remove these measurement-only spaces from the SVG after engraving.
    afterParsing: prepareTune,
    minPadding: options.beginnerEdition ? 4 : undefined,
    },
  });
  const tune = layout.render(paper) as TuneObject & { noteTimings: NoteTimingEvent[] };
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
    if (staffScale !== 1 || melismaSpace)
      lyric.setAttribute("font-size", String(16 / staffScale));
    // abcjs combines all stanza rows into one <text>. Isolate each row so
    // Hebrew cannot reverse an English row's punctuation. Syllable underlay
    // follows the music left-to-right; complete chord-view phrases read RTL.
    for (const fragment of lyric.querySelectorAll("tspan")) {
      if (!fragment.textContent?.trim()) fragment.textContent = "\u00a0";
      if (melismaSpace && fragment.hasAttribute("dy")) fragment.setAttribute("dy", "1.5em");
      if (!/\p{Script=Hebrew}/u.test(fragment.textContent || "")) continue;
      fragment.setAttribute("direction", /\s/u.test(fragment.textContent?.trim() || "") ? "rtl" : "ltr");
      fragment.setAttribute("unicode-bidi", "isolate");
      fragment.setAttribute("lang", "he");
    }
  });
  const drawMelismas = prepareHymnMelismas(tune);
  paper.querySelectorAll(".abcjs-lyric").forEach(lyric => {
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
  const fingeringTune=options.beginnerEdition === 'guitar' && options.hiddenStaves?.length ? abcjs.parseOnly(source)[0] : tune;
  if(fingeringTune!==tune)fingeringTune.setUpAudio(audioOptions);
  let audio = swingAudio(options.hiddenStaves?.length
    ? abcjs.parseOnly(source)[0].setUpAudio(audioOptions) : visibleAudio, swinging);
  if (profile && options.beginnerEdition === "guitar") {
    audio = capoAudio(audio,profile.capo);
    for (const score of new Set([tune,fingeringTune]))for (const line of score.lines) for (const staff of line.staff || [])
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
    drawBeginnerFingerings(tune, options.beginnerEdition, options.fromBar || 0, transpose, !!options.tabOnly, profile ? (instrument,bar,voice,pitches)=>profile.fingers(instrument,bar,voice,pitches,bar===(options.fromBar||0)) : undefined, !profile, !!profile, profile ? (pitch,chord,shift,group)=>profile.position(pitch-profile.capo,chord,shift,group?.map(p=>p-profile.capo)) : undefined, fingeringTune, profile?.capo || 0);
  if (options.beginnerEdition) separateBeginnerFingerings(paper);
  if (!!profile && options.beginnerEdition === "guitar" && !chordsOnly) spaceGuitarSymbols(paper);
  if (options.tabOnly) showOnlyTab(paper, profile ? 58 : undefined);
  if (chordsOnly) showChordsOnly(paper,tune);
  drawMelismas();
  // Remove the now-empty marker text, whose zero-origin box would otherwise
  // stretch note hit targets across preceding systems.
  paper.querySelectorAll(".abcjs-lyric").forEach(lyric => {
    if (!lyric.textContent?.trim()) lyric.remove();
  });
  // Explicit physical size prevents short systems and responsive wrappers from
  // stretching staff lines and glyphs differently in each exercise.
  if (options.fingerings && !options.beginnerEdition) {
    if (options.guitarTab) drawGuitarFingerings(tune, !!options.chordTab);
    else drawHymnFingerings(tune);
  }
  if(options.barNumbers)restoreSystemBarNumbers(tune,paper);
  paper.querySelectorAll("svg").forEach((svg) => {
    layout.fit(svg);
  });
  if (chordsOnly && options.showChordSymbols === false || !chordsOnly && options.hiddenStaves?.length && abcPlaybackStaves(abc).every(staff=>options.hiddenStaves!.includes(staff.index)))
    paper.querySelectorAll<SVGSVGElement>('svg').forEach(svg=>svg.style.display='none');
  if (options.guitarSetup) {
    const heading=document.createElement("div");
    heading.className="hymn-score-setup";
    heading.textContent=`${options.guitarSetup.capo ? `Capo ${options.guitarSetup.capo} · ` : ""}Sounding key: ${options.guitarSetup.key} major`;
    paper.prepend(heading);
  }
  if (swinging) addSwingHelp(paper);
  paper.querySelectorAll(".abcjs-part,.abcjs-tempo").forEach(mark=>mark.remove());
  layout.finish();
  if (!options.fingerings) paper.querySelectorAll(".beginner-fingering,.beginner-picking,.beginner-string").forEach(mark=>mark.remove());
  attachChordDiagrams(paper, chordPassages);
  if (options.printedScore && !options.guitarAccompaniment) attachPianoChordDiagrams(paper, tune);
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
