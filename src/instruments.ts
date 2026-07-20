import { frequencyFromMidi, noteLabelFromMidi } from './audio/notes';

export type InstrumentString = {
  id: string;
  label: string;
  midi: number;
};

export type InstrumentCategory =
  | 'general'
  | 'guitar'
  | 'bass'
  | 'ukulele'
  | 'banjo'
  | 'orchestral';

export type Instrument = {
  id: string;
  name: string;
  shortName: string;
  category: InstrumentCategory;
  /** Empty = full chromatic (piano / voice / auto) */
  strings: InstrumentString[];
  icon: 'chromatic' | 'guitar' | 'ukulele' | 'piano' | 'bass' | 'violin' | 'cello' | 'mandolin' | 'banjo';
};

export const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  general: 'General',
  guitar: 'Guitar',
  bass: 'Bass',
  ukulele: 'Ukulele',
  banjo: 'Banjo',
  orchestral: 'Orchestral',
};

export const CATEGORY_ORDER: InstrumentCategory[] = [
  'general',
  'guitar',
  'bass',
  'ukulele',
  'banjo',
  'orchestral',
];

function note(midi: number, stringLabel?: string): InstrumentString {
  const { noteName, octave } = noteLabelFromMidi(midi);
  return {
    id: `${noteName}${octave}-${midi}`,
    label: stringLabel ?? `${noteName}${octave}`,
    midi,
  };
}

function stdGuitar(
  id: string,
  name: string,
  shortName: string,
  ...midis: [number, string][]
): Instrument {
  return {
    id,
    name,
    shortName,
    category: 'guitar',
    icon: 'guitar',
    strings: midis.map(([m, l]) => note(m, l)),
  };
}

function stdBass(
  id: string,
  name: string,
  shortName: string,
  ...midis: [number, string][]
): Instrument {
  return {
    id,
    name,
    shortName,
    category: 'bass',
    icon: 'bass',
    strings: midis.map(([m, l]) => note(m, l)),
  };
}

/** Standard MIDI: C4 = 60, A4 = 69 */
export const INSTRUMENTS: Instrument[] = [
  {
    id: 'chromatic',
    name: 'Chromatic',
    shortName: 'Auto',
    category: 'general',
    icon: 'chromatic',
    strings: [],
  },
  {
    id: 'piano',
    name: 'Piano',
    shortName: 'Piano',
    category: 'general',
    icon: 'piano',
    strings: [],
  },

  stdGuitar('guitar', 'Guitar · Standard', 'Std', [40, 'E2'], [45, 'A2'], [50, 'D3'], [55, 'G3'], [59, 'B3'], [64, 'E4']),
  stdGuitar('guitar-drop-d', 'Guitar · Drop D', 'Drop D', [38, 'D2'], [45, 'A2'], [50, 'D3'], [55, 'G3'], [59, 'B3'], [64, 'E4']),
  stdGuitar('guitar-drop-c', 'Guitar · Drop C', 'Drop C', [36, 'C2'], [43, 'G2'], [48, 'C3'], [53, 'F3'], [57, 'A3'], [62, 'D4']),
  stdGuitar('guitar-open-g', 'Guitar · Open G', 'Open G', [38, 'D2'], [43, 'G2'], [50, 'D3'], [55, 'G3'], [59, 'B3'], [62, 'D4']),
  stdGuitar('guitar-open-d', 'Guitar · Open D', 'Open D', [38, 'D2'], [45, 'A2'], [50, 'D3'], [54, 'F♯3'], [57, 'A3'], [62, 'D4']),
  stdGuitar('guitar-open-e', 'Guitar · Open E', 'Open E', [40, 'E2'], [47, 'B2'], [52, 'E3'], [56, 'G♯3'], [59, 'B3'], [64, 'E4']),
  stdGuitar('guitar-open-a', 'Guitar · Open A', 'Open A', [40, 'E2'], [45, 'A2'], [49, 'C♯3'], [52, 'E3'], [57, 'A3'], [64, 'E4']),
  stdGuitar('guitar-dadgad', 'Guitar · DADGAD', 'DADGAD', [38, 'D2'], [45, 'A2'], [50, 'D3'], [55, 'G3'], [57, 'A3'], [62, 'D4']),
  stdGuitar('guitar-half-down', 'Guitar · ½ Step Down', '−½', [39, 'E♭2'], [44, 'A♭2'], [49, 'D♭3'], [54, 'G♭3'], [58, 'B♭3'], [63, 'E♭4']),
  stdGuitar('guitar-full-down', 'Guitar · Full Step Down', '−1', [38, 'D2'], [43, 'G2'], [48, 'C3'], [53, 'F3'], [57, 'A3'], [62, 'D4']),

  stdBass('bass', 'Bass · Standard 4', '4-str', [28, 'E1'], [33, 'A1'], [38, 'D2'], [43, 'G2']),
  stdBass('bass-5', 'Bass · Standard 5', '5-str', [23, 'B0'], [28, 'E1'], [33, 'A1'], [38, 'D2'], [43, 'G2']),
  stdBass('bass-drop-d', 'Bass · Drop D', 'Drop D', [26, 'D1'], [33, 'A1'], [38, 'D2'], [43, 'G2']),
  stdBass('bass-half-down', 'Bass · ½ Step Down', '−½', [27, 'E♭1'], [32, 'A♭1'], [37, 'D♭2'], [42, 'G♭2']),

  {
    id: 'uke-standard',
    name: 'Ukulele · Standard C',
    shortName: 'Std C',
    category: 'ukulele',
    icon: 'ukulele',
    strings: [note(67, 'G4'), note(60, 'C4'), note(64, 'E4'), note(69, 'A4')],
  },
  {
    id: 'uke-low-g',
    name: 'Ukulele · Low G',
    shortName: 'Low G',
    category: 'ukulele',
    icon: 'ukulele',
    strings: [note(55, 'G3'), note(60, 'C4'), note(64, 'E4'), note(69, 'A4')],
  },
  {
    id: 'uke-tenor',
    name: 'Ukulele · Tenor',
    shortName: 'Tenor',
    category: 'ukulele',
    icon: 'ukulele',
    strings: [note(55, 'G3'), note(67, 'G4'), note(60, 'C4'), note(64, 'E4'), note(69, 'A4')],
  },
  {
    id: 'uke-baritone',
    name: 'Ukulele · Baritone',
    shortName: 'Baritone',
    category: 'ukulele',
    icon: 'ukulele',
    strings: [note(50, 'D3'), note(55, 'G3'), note(59, 'B3'), note(64, 'E4')],
  },
  {
    id: 'uke-d-tuning',
    name: 'Ukulele · D Tuning',
    shortName: 'D tune',
    category: 'ukulele',
    icon: 'ukulele',
    strings: [note(57, 'A3'), note(62, 'D4'), note(66, 'F♯4'), note(71, 'B4')],
  },

  {
    id: 'banjo-open-g',
    name: 'Banjo · Open G',
    shortName: 'Open G',
    category: 'banjo',
    icon: 'banjo',
    strings: [note(62, 'D4'), note(59, 'B3'), note(55, 'G3'), note(50, 'D3'), note(67, 'G4')],
  },
  {
    id: 'banjo-double-c',
    name: 'Banjo · Double C',
    shortName: 'Dbl C',
    category: 'banjo',
    icon: 'banjo',
    strings: [note(62, 'D4'), note(60, 'C4'), note(55, 'G3'), note(48, 'C3'), note(67, 'G4')],
  },
  {
    id: 'banjo-open-d',
    name: 'Banjo · Open D',
    shortName: 'Open D',
    category: 'banjo',
    icon: 'banjo',
    strings: [note(62, 'D4'), note(57, 'A3'), note(54, 'F♯3'), note(50, 'D3'), note(69, 'A4')],
  },

  {
    id: 'violin',
    name: 'Violin',
    shortName: 'Violin',
    category: 'orchestral',
    icon: 'violin',
    strings: [note(55, 'G3'), note(62, 'D4'), note(69, 'A4'), note(76, 'E5')],
  },
  {
    id: 'viola',
    name: 'Viola',
    shortName: 'Viola',
    category: 'orchestral',
    icon: 'violin',
    strings: [note(48, 'C3'), note(55, 'G3'), note(62, 'D4'), note(69, 'A4')],
  },
  {
    id: 'cello',
    name: 'Cello',
    shortName: 'Cello',
    category: 'orchestral',
    icon: 'cello',
    strings: [note(36, 'C2'), note(43, 'G2'), note(50, 'D3'), note(57, 'A3')],
  },
  {
    id: 'mandolin',
    name: 'Mandolin',
    shortName: 'Mando',
    category: 'orchestral',
    icon: 'mandolin',
    strings: [note(55, 'G3'), note(62, 'D4'), note(69, 'A4'), note(76, 'E5')],
  },
];

export function findInstrument(id: string): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export function nearestString(
  frequency: number,
  strings: InstrumentString[],
): InstrumentString | null {
  if (strings.length === 0) return null;

  let best = strings[0];
  let bestDist = Infinity;
  for (const s of strings) {
    const targetHz = frequencyFromMidi(s.midi);
    const cents = 1200 * Math.log2(frequency / targetHz);
    const dist = Math.abs(cents);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}
