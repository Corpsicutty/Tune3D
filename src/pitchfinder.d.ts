declare module 'pitchfinder' {
  export type PitchDetector = (float32AudioBuffer: Float32Array) => number | null;

  export function YIN(params?: {
    threshold?: number;
    sampleRate?: number;
    probabilityThreshold?: number;
  }): PitchDetector;

  export function AMDF(params?: {
    sampleRate?: number;
    minFrequency?: number;
    maxFrequency?: number;
    sensitivity?: number;
    ratio?: number;
  }): PitchDetector;
}
