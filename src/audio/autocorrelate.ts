/**
 * Normalize RMS so quiet phone mics / soft plucks still reach the detector.
 */
export function normalizeBuffer(input: Float32Array, output: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) {
    output.set(input);
    return 0;
  }
  const gain = Math.min(12, 0.35 / peak);
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] * gain;
  }
  return peak;
}

/**
 * Autocorrelation pitch guess. Better than YIN alone for mid-range plucked notes.
 */
export function detectPitchAutocorrelate(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 70,
  maxHz = 1200,
): number | null {
  const size = buffer.length;
  const maxLag = Math.min(Math.floor(sampleRate / minHz), size - 1);
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxLag <= minLag + 2) return null;

  let bestLag = -1;
  let bestCorr = 0;

  // Skip the zero-lag peak; find first strong secondary peak
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let normA = 0;
    let normB = 0;
    const n = size - lag;
    for (let i = 0; i < n; i++) {
      const a = buffer[i];
      const b = buffer[i + lag];
      corr += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA * normB);
    if (denom < 1e-9) continue;
    const score = corr / denom;
    if (score > bestCorr) {
      bestCorr = score;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorr < 0.35) return null;

  // Parabolic interpolation around best lag
  const lag = bestLag;
  const y0 = lag > minLag ? corrAt(buffer, lag - 1) : bestCorr;
  const y1 = bestCorr;
  const y2 = lag < maxLag ? corrAt(buffer, lag + 1) : bestCorr;
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = Math.abs(denom) > 1e-9 ? (y0 - y2) / denom : 0;
  const refinedLag = lag + Math.max(-0.5, Math.min(0.5, shift));
  return sampleRate / refinedLag;
}

function corrAt(buffer: Float32Array, lag: number): number {
  const size = buffer.length;
  const n = size - lag;
  let corr = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i++) {
    const a = buffer[i];
    const b = buffer[i + lag];
    corr += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA * normB);
  return denom < 1e-9 ? 0 : corr / denom;
}

/**
 * When instrument strings are known, score lags near each target frequency.
 * Much more reliable for ukulele / guitar plucks than open chromatic search.
 */
export function detectPitchNearHints(
  buffer: Float32Array,
  sampleRate: number,
  hintsHz: number[],
  centsWindow = 120,
): number | null {
  if (hintsHz.length === 0) return null;

  let bestHz = 0;
  let bestScore = 0;

  for (const hint of hintsHz) {
    const minHz = hint * 2 ** (-centsWindow / 1200);
    const maxHz = hint * 2 ** (centsWindow / 1200);
    const maxLag = Math.min(Math.floor(sampleRate / minHz), buffer.length - 1);
    const minLag = Math.max(2, Math.floor(sampleRate / maxHz));

    for (let lag = minLag; lag <= maxLag; lag++) {
      const score = corrAt(buffer, lag);
      if (score > bestScore) {
        bestScore = score;
        bestHz = sampleRate / lag;
      }
    }
  }

  return bestScore >= 0.28 ? bestHz : null;
}
