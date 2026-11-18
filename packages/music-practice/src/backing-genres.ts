import catalog from "./backing-musical-catalog.json";
/** Central musical definitions. Sounds/mix remain independently selected. */
export type BackingGenreId = keyof typeof BACKING_GENRES;
export type GenreChord = { degree: number; minor: boolean; seventh?: number };
export type GenreDefinition = {
  id: string;
  label: string;
  meter: readonly [number, number];
  tempo: { preferred: number; range: readonly [number, number] };
  harmony: {
    barsPerChord: number;
    major: readonly GenreChord[];
    minor: readonly GenreChord[];
  };
  rhythm: {
    feel: "shuffle" | "straight";
    subdivision: 2 | 3 | 4;
    strategy:
      | "recorded-story"
      | "two-step"
      | "one-drop"
      | "syncopated-funk"
      | "soul-pocket"
      | "gentle-folk";
    kick: readonly number[];
    backbeat: readonly number[];
  };
  roles: {
    bass:
      "sparse-foundation" | "alternating-root-fifth" | "syncopated-foundation";
    guitar: "sustained-support" | "offbeat-comping" | "muted-comping";
    percussion: "light";
    bassBeats: readonly number[];
    guitarBeats: readonly number[];
    keysBeats?: readonly number[];
  };
  articulations: readonly string[];
  interaction: {
    bassFollowsKick: boolean;
    guitar: "support";
    maxBassAttacksPerBar: 2;
  };
  form: {
    bars: number;
    phraseBars: number;
    sections: readonly {
      name: string;
      bars: number;
      db: readonly [number, number];
      texture: string;
    }[];
  };
  activity: {
    steady: { fillsEveryBars: number; guitarDurationBeats?: number };
    active: { fillsEveryBars: number; guitarDurationBeats?: number };
  };
  instrumentation: {
    preset:
      "approved-electric-band" | "warm-electric-piano" | "steel-acoustic-band";
    bass: "electric-finger";
    guitar: "clean-electric" | "steel-acoustic" | "none";
    keys?: "electric-piano";
    drums: "virtuosity";
    mix: "approved-drum-forward";
  };
};
const chord = (degree: number, minor = false): GenreChord => ({
  degree,
  minor,
});
const instruments: GenreDefinition["instrumentation"] = {
  preset: "approved-electric-band",
  bass: "electric-finger",
  guitar: "clean-electric",
  drums: "virtuosity",
  mix: "approved-drum-forward",
};
const interaction: GenreDefinition["interaction"] = {
  bassFollowsKick: true,
  guitar: "support",
  maxBassAttacksPerBar: 2,
};
export function recordedGenreStory(
  style: "blues" | "rock",
  mode: "steady" | "active",
) {
  return catalog[`${style}-${mode}`];
}
function recordedSections(
  style: "blues" | "rock",
): GenreDefinition["form"]["sections"] {
  const sections: {
    name: string;
    bars: number;
    db: [number, number];
    texture: string;
  }[] = [];
  for (const b of recordedGenreStory(style, "steady").bars) {
    const previous = sections.at(-1);
    if (previous?.name === b.section) {
      previous.bars++;
      previous.db[1] = b.db;
    } else
      sections.push({
        name: b.section,
        bars: 1,
        db: [b.db, b.db],
        texture: b.texture,
      });
  }
  return sections;
}
export const BACKING_GENRES = {
  blues: {
    id: "blues",
    label: "Blues",
    meter: [4, 4],
    tempo: { preferred: 90, range: [60, 125] },
    harmony: {
      barsPerChord: 1,
      major: [0, 5, 0, 0, 5, 5, 0, 2, 7, 5, 0, 7].map((d) => chord(d, d === 2)),
      minor: [0, 5, 0, 0, 5, 5, 0, 8, 7, 5, 0, 7].map((d) => chord(d, d !== 8)),
    },
    rhythm: {
      feel: "shuffle",
      subdivision: 3,
      strategy: "recorded-story",
      kick: [0, 2],
      backbeat: [1, 3],
    },
    roles: {
      bass: "sparse-foundation",
      guitar: "sustained-support",
      percussion: "light",
      bassBeats: [0, 2],
      guitarBeats: [0],
    },
    articulations: ["cross-stick", "off-centre", "sustained-brush"],
    interaction,
    form: { bars: 72, phraseBars: 12, sections: recordedSections("blues") },
    activity: { steady: { fillsEveryBars: 12 }, active: { fillsEveryBars: 4 } },
    instrumentation: instruments,
  },
  rock: {
    id: "rock",
    label: "Rock",
    meter: [4, 4],
    tempo: { preferred: 100, range: [70, 150] },
    harmony: {
      barsPerChord: 2,
      major: [chord(0), chord(5), chord(9, true), chord(7)],
      minor: [chord(0, true), chord(8), chord(3), chord(10)],
    },
    rhythm: {
      feel: "straight",
      subdivision: 2,
      strategy: "recorded-story",
      kick: [0, 2],
      backbeat: [1, 3],
    },
    roles: {
      bass: "sparse-foundation",
      guitar: "sustained-support",
      percussion: "light",
      bassBeats: [0, 2],
      guitarBeats: [0],
    },
    articulations: ["cross-stick", "rimshot", "muted-brush"],
    interaction,
    form: { bars: 64, phraseBars: 8, sections: recordedSections("rock") },
    activity: { steady: { fillsEveryBars: 8 }, active: { fillsEveryBars: 4 } },
    instrumentation: instruments,
  },
  country: {
    id: "country",
    label: "Country",
    meter: [4, 4],
    tempo: { preferred: 104, range: [80, 136] },
    harmony: {
      barsPerChord: 2,
      major: [
        chord(0),
        chord(5),
        chord(9, true),
        chord(7),
        chord(0),
        chord(5),
        chord(7),
        chord(0),
      ],
      minor: [
        chord(0, true),
        chord(10),
        chord(8),
        chord(5, true),
        chord(0, true),
        chord(8),
        chord(7, true),
        chord(0, true),
      ],
    },
    rhythm: {
      feel: "straight",
      subdivision: 2,
      strategy: "two-step",
      kick: [0, 2],
      backbeat: [1, 3],
    },
    roles: {
      bass: "alternating-root-fifth",
      guitar: "offbeat-comping",
      percussion: "light",
      bassBeats: [0, 2],
      guitarBeats: [1, 3],
    },
    articulations: ["cross-stick", "light-snare", "short-clean-brush"],
    interaction,
    form: {
      bars: 64,
      phraseBars: 8,
      sections: [
        { name: "Opening", bars: 8, db: [-5, -4], texture: "crossstick" },
        { name: "Settled", bars: 16, db: [-3, -2], texture: "hat" },
        { name: "First lift", bars: 16, db: [-1, 0.5], texture: "ride" },
        { name: "Pull back", bars: 8, db: [-7, -5], texture: "crossstick" },
        { name: "Return", bars: 8, db: [-3, 0], texture: "hat" },
        { name: "Home", bars: 8, db: [-2, -5], texture: "hat" },
      ],
    },
    activity: { steady: { fillsEveryBars: 16 }, active: { fillsEveryBars: 8 } },
    instrumentation: instruments,
  },
  reggae: {
    id: "reggae",
    label: "Reggae",
    meter: [4, 4],
    tempo: { preferred: 78, range: [64, 96] },
    harmony: {
      barsPerChord: 2,
      major: [chord(0), chord(7), chord(9, true), chord(5)],
      minor: [chord(0, true), chord(8), chord(5, true), chord(10)],
    },
    rhythm: {
      feel: "straight",
      subdivision: 2,
      strategy: "one-drop",
      kick: [2],
      backbeat: [2],
    },
    roles: {
      bass: "syncopated-foundation",
      guitar: "offbeat-comping",
      percussion: "light",
      bassBeats: [0, 2.75],
      guitarBeats: [0.5, 1.5, 2.5, 3.5],
    },
    articulations: ["cross-stick", "ringing-offbeat-chords", "held-bass"],
    interaction,
    form: {
      bars: 64,
      phraseBars: 8,
      sections: [
        { name: "Opening", bars: 8, db: [-5, -4], texture: "crossstick" },
        { name: "Pocket", bars: 16, db: [-3, -2], texture: "hat" },
        { name: "First lift", bars: 16, db: [-1, 0], texture: "hat" },
        { name: "Breathe", bars: 8, db: [-7, -5], texture: "crossstick" },
        { name: "Return", bars: 8, db: [-3, -1], texture: "hat" },
        { name: "Home", bars: 8, db: [-2, -5], texture: "hat" },
      ],
    },
    activity: {
      steady: { fillsEveryBars: 16, guitarDurationBeats: 0.78 },
      active: { fillsEveryBars: 8, guitarDurationBeats: 0.66 },
    },
    instrumentation: instruments,
  },
  funk: {
    id: "funk",
    label: "Funk",
    meter: [4, 4],
    tempo: { preferred: 104, range: [84, 120] },
    harmony: {
      barsPerChord: 2,
      major: [chord(0), chord(9, true), chord(2, true), chord(7)],
      minor: [chord(0, true), chord(5, true), chord(8), chord(7, true)],
    },
    rhythm: {
      feel: "straight",
      subdivision: 4,
      strategy: "syncopated-funk",
      kick: [0, 0.75, 2.5],
      backbeat: [1, 3],
    },
    roles: {
      bass: "syncopated-foundation",
      guitar: "muted-comping",
      percussion: "light",
      bassBeats: [0, 2.5],
      guitarBeats: [0.5, 2.5],
    },
    articulations: [
      "damped-ringing-chords",
      "staccato-bass",
      "off-centre-ghost-snare",
      "closed-hat",
    ],
    interaction,
    form: {
      bars: 64,
      phraseBars: 8,
      sections: [
        { name: "Opening", bars: 8, db: [-5, -4], texture: "crossstick" },
        { name: "Pocket", bars: 16, db: [-3, -2], texture: "hat" },
        { name: "First lift", bars: 16, db: [-1, 0.5], texture: "ride" },
        { name: "Break", bars: 8, db: [-7, -5], texture: "crossstick" },
        { name: "Return", bars: 8, db: [-3, 0], texture: "hat" },
        { name: "Home", bars: 8, db: [-2, -5], texture: "hat" },
      ],
    },
    activity: {
      steady: { fillsEveryBars: 16, guitarDurationBeats: 0.6 },
      active: { fillsEveryBars: 8, guitarDurationBeats: 0.48 },
    },
    instrumentation: instruments,
  },
  soul: {
    id: "soul",
    label: "Soul",
    meter: [4, 4],
    tempo: { preferred: 84, range: [68, 104] },
    harmony: {
      barsPerChord: 2,
      major: [
        { degree: 0, minor: false, seventh: 11 },
        { degree: 9, minor: true, seventh: 10 },
        { degree: 2, minor: true, seventh: 10 },
        { degree: 7, minor: false, seventh: 10 },
      ],
      minor: [
        { degree: 0, minor: true, seventh: 10 },
        { degree: 8, minor: false, seventh: 11 },
        { degree: 5, minor: true, seventh: 10 },
        { degree: 7, minor: true, seventh: 10 },
      ],
    },
    rhythm: {
      feel: "straight",
      subdivision: 2,
      strategy: "soul-pocket",
      kick: [0, 2.5],
      backbeat: [1, 3],
    },
    roles: {
      bass: "sparse-foundation",
      guitar: "sustained-support",
      percussion: "light",
      bassBeats: [0, 2.5],
      guitarBeats: [],
      keysBeats: [0],
    },
    articulations: [
      "warm-electric-piano",
      "sustained-seventh-voicings",
      "laid-back-snare",
    ],
    interaction,
    form: {
      bars: 64,
      phraseBars: 8,
      sections: [
        { name: "Opening", bars: 8, db: [-5, -4], texture: "crossstick" },
        { name: "Pocket", bars: 16, db: [-3, -2], texture: "hat" },
        { name: "First lift", bars: 16, db: [-1, 0.5], texture: "ride" },
        { name: "Breathe", bars: 8, db: [-7, -5], texture: "crossstick" },
        { name: "Return", bars: 8, db: [-3, 0], texture: "hat" },
        { name: "Home", bars: 8, db: [-2, -5], texture: "hat" },
      ],
    },
    activity: { steady: { fillsEveryBars: 16 }, active: { fillsEveryBars: 8 } },
    instrumentation: {
      preset: "warm-electric-piano",
      bass: "electric-finger",
      guitar: "none",
      keys: "electric-piano",
      drums: "virtuosity",
      mix: "approved-drum-forward",
    },
  },
  folk: {
    id: "folk",
    label: "Folk",
    meter: [4, 4],
    tempo: { preferred: 88, range: [64, 112] },
    harmony: {
      barsPerChord: 2,
      major: [chord(0), chord(5), chord(9, true), chord(7)],
      minor: [chord(0, true), chord(8), chord(3), chord(10)],
    },
    rhythm: {
      feel: "straight",
      subdivision: 2,
      strategy: "gentle-folk",
      kick: [0, 2],
      backbeat: [1, 3],
    },
    roles: {
      bass: "alternating-root-fifth",
      guitar: "sustained-support",
      percussion: "light",
      bassBeats: [0, 2],
      guitarBeats: [0],
    },
    articulations: [
      "soft-steel-string",
      "long-ringing-chords",
      "soft-cross-stick",
    ],
    interaction,
    form: {
      bars: 64,
      phraseBars: 8,
      sections: [
        { name: "Opening", bars: 8, db: [-5, -4], texture: "crossstick" },
        { name: "Settled", bars: 16, db: [-3, -2], texture: "hat" },
        { name: "First lift", bars: 16, db: [-1, 0], texture: "hat" },
        { name: "Breathe", bars: 8, db: [-7, -5], texture: "crossstick" },
        { name: "Return", bars: 8, db: [-3, -1], texture: "hat" },
        { name: "Home", bars: 8, db: [-2, -5], texture: "hat" },
      ],
    },
    activity: { steady: { fillsEveryBars: 16 }, active: { fillsEveryBars: 8 } },
    instrumentation: {
      preset: "steel-acoustic-band",
      bass: "electric-finger",
      guitar: "steel-acoustic",
      drums: "virtuosity",
      mix: "approved-drum-forward",
    },
  },
} as const satisfies Record<string, GenreDefinition>;
export const backingGenres = Object.values(BACKING_GENRES);
export function backingGenre(input: unknown) {
  return typeof input === "string" && Object.hasOwn(BACKING_GENRES, input)
    ? BACKING_GENRES[input as BackingGenreId]
    : BACKING_GENRES.blues;
}
export function genreChord(
  style: BackingGenreId,
  quality: "major" | "minor",
  bar: number,
): GenreChord {
  const h = BACKING_GENRES[style].harmony,
    sequence = h[quality];
  return sequence[Math.floor(bar / h.barsPerChord) % sequence.length];
}
