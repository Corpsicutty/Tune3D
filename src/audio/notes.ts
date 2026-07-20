const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export type PitchReading = {
  frequency: number;
  noteName: string;
  octave: number;
  midi: number;
  cents: number;
  targetFrequency: number;
  /** 0 = at note edge, 1 = dead center */
  accuracy: number;
  confidence: number;
};

/** A4 reference only — not a target note. */
export const CONCERT_PITCH_HZ = 440;

export function midiFromFrequency(frequency: number, reference = CONCERT_PITCH_HZ): number {
  return 12 * Math.log2(frequency / reference) + 69;
}

export function frequencyFromMidi(midi: number, reference = CONCERT_PITCH_HZ): number {
  return reference * 2 ** ((midi - 69) / 12);
}

export function noteLabelFromMidi(midi: number): { noteName: string; octave: number } {
  const nearest = Math.round(midi);
  const noteIndex = ((nearest % 12) + 12) % 12;
  return {
    noteName: NOTE_NAMES[noteIndex],
    octave: Math.floor(nearest / 12) - 1,
  };
}

/**
 * Chromatic auto-detect: lock to whichever note you're nearest,
 * with hysteresis so it doesn't flicker at the halfway point.
 */
export function analyzePitchAgainstLockedNote(
  frequency: number,
  lockedMidi: number | null,
  reference = CONCERT_PITCH_HZ,
  hysteresisCents = 55,
): { reading: PitchReading; lockedMidi: number } {
  const continuousMidi = midiFromFrequency(frequency, reference);

  let nextLocked = lockedMidi ?? Math.round(continuousMidi);
  if (lockedMidi !== null) {
    const centsFromLocked = (continuousMidi - lockedMidi) * 100;
    if (centsFromLocked > hysteresisCents) {
      nextLocked = lockedMidi + 1;
    } else if (centsFromLocked < -hysteresisCents) {
      nextLocked = lockedMidi - 1;
    }
  }

  const cents = (continuousMidi - nextLocked) * 100;
  const { noteName, octave } = noteLabelFromMidi(nextLocked);
  const accuracy = 1 - Math.min(Math.abs(cents), 50) / 50;

  return {
    lockedMidi: nextLocked,
    reading: {
      frequency,
      noteName,
      octave,
      midi: nextLocked,
      cents,
      targetFrequency: frequencyFromMidi(nextLocked, reference),
      accuracy,
      confidence: 1,
    },
  };
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

export function centsDirection(cents: number): 'sharp' | 'flat' | 'in-tune' {
  if (Math.abs(cents) < 5) return 'in-tune';
  return cents > 0 ? 'sharp' : 'flat';
}

/** Measure pitch against a specific MIDI note center (instrument string). */
export function analyzePitchAgainstMidi(
  frequency: number,
  targetMidi: number,
  reference = CONCERT_PITCH_HZ,
): PitchReading {
  const continuousMidi = midiFromFrequency(frequency, reference);
  const cents = (continuousMidi - targetMidi) * 100;
  const { noteName, octave } = noteLabelFromMidi(targetMidi);
  const accuracy = 1 - Math.min(Math.abs(cents), 50) / 50;

  return {
    frequency,
    noteName,
    octave,
    midi: targetMidi,
    cents,
    targetFrequency: frequencyFromMidi(targetMidi, reference),
    accuracy,
    confidence: 1,
  };
}
