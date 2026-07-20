import { AMDF, YIN } from 'pitchfinder';
import {
  detectPitchAutocorrelate,
  detectPitchNearHints,
  normalizeBuffer,
} from './autocorrelate';
import {
  analyzePitchAgainstLockedNote,
  CONCERT_PITCH_HZ,
  type PitchReading,
} from './notes';

export type PitchUpdate = {
  reading: PitchReading | null;
  volume: number;
};

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
}

export class MicPitchDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private floatBuffer: Float32Array<ArrayBuffer> | null = null;
  private workBuffer: Float32Array<ArrayBuffer> | null = null;
  private byteBuffer: Uint8Array<ArrayBuffer> | null = null;
  private yin: ((signal: Float32Array) => number | null) | null = null;
  private amdf: ((signal: Float32Array) => number | null) | null = null;
  private rafId = 0;
  private running = false;
  private smoothedFrequency = 0;
  private hasFrequency = false;
  private lockedMidi: number | null = null;
  private referenceHz = CONCERT_PITCH_HZ;
  private useByteFallback = false;
  private silentFrames = 0;
  private holdFrames = 0;
  private lastReading: PitchReading | null = null;
  private hintFrequencies: number[] = [];
  private sampleRate = 44100;

  onUpdate: (update: PitchUpdate) => void = () => {};

  /** Bias detection toward these Hz values (open strings). */
  setFrequencyHints(hz: number[]): void {
    this.hintFrequencies = hz.filter((f) => f > 40 && f < 2000);
  }

  async start(referenceHz = CONCERT_PITCH_HZ): Promise<void> {
    if (this.running) return;
    this.referenceHz = referenceHz;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API not available (needs HTTPS on iOS)');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          // Soft boost helps quiet phone mics hear ukulele plucks
          autoGainControl: true,
        },
      });
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    this.audioContext = createAudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.sampleRate = this.audioContext.sampleRate;

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    // Longer window = better mid/low pitch (uke C4 / guitar)
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.2;
    source.connect(this.analyser);

    this.floatBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.workBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.byteBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    this.yin = YIN({
      sampleRate: this.sampleRate,
      threshold: 0.15,
      probabilityThreshold: 0.05,
    });
    this.amdf = AMDF({
      sampleRate: this.sampleRate,
      minFrequency: 70,
      maxFrequency: 1200,
      sensitivity: 0.5,
    });

    try {
      this.analyser.getFloatTimeDomainData(this.floatBuffer);
      this.useByteFallback = false;
    } catch {
      this.useByteFallback = true;
    }

    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.floatBuffer = null;
    this.workBuffer = null;
    this.byteBuffer = null;
    this.yin = null;
    this.amdf = null;
    this.hasFrequency = false;
    this.lockedMidi = null;
    this.silentFrames = 0;
    this.holdFrames = 0;
    this.lastReading = null;
  }

  private fillFloatBuffer(): void {
    if (!this.analyser || !this.floatBuffer) return;

    if (this.useByteFallback && this.byteBuffer) {
      this.analyser.getByteTimeDomainData(this.byteBuffer);
      for (let i = 0; i < this.byteBuffer.length; i++) {
        this.floatBuffer[i] = (this.byteBuffer[i] - 128) / 128;
      }
      return;
    }

    this.analyser.getFloatTimeDomainData(this.floatBuffer);
  }

  private estimateFrequency(): number | null {
    if (!this.floatBuffer || !this.workBuffer || !this.yin || !this.amdf) return null;

    normalizeBuffer(this.floatBuffer, this.workBuffer);

    // 1) Prefer string-biased search when an instrument is selected
    const hinted = detectPitchNearHints(
      this.workBuffer,
      this.sampleRate,
      this.hintFrequencies,
      140,
    );
    if (hinted) return hinted;

    // 2) YIN
    const yinHz = this.yin(this.workBuffer);
    if (yinHz && yinHz > 70 && yinHz < 1400) return yinHz;

    // 3) Autocorrelation
    const acfHz = detectPitchAutocorrelate(this.workBuffer, this.sampleRate, 70, 1200);
    if (acfHz) return acfHz;

    // 4) AMDF fallback
    const amdfHz = this.amdf(this.workBuffer);
    if (amdfHz && amdfHz > 70 && amdfHz < 1400) return amdfHz;

    return null;
  }

  private loop = (): void => {
    if (!this.running || !this.analyser || !this.floatBuffer) return;

    this.fillFloatBuffer();

    let volume = 0;
    for (let i = 0; i < this.floatBuffer.length; i++) {
      volume += this.floatBuffer[i] * this.floatBuffer[i];
    }
    volume = Math.sqrt(volume / this.floatBuffer.length);

    let reading: PitchReading | null = null;

    // Very low gate — phone mics often report ~0.01 on soft uke plucks
    if (volume > 0.0015) {
      const frequency = this.estimateFrequency();
      if (frequency && Number.isFinite(frequency) && frequency > 70 && frequency < 1400) {
        this.silentFrames = 0;
        this.holdFrames = 24;

        if (!this.hasFrequency) {
          this.smoothedFrequency = frequency;
          this.hasFrequency = true;
        } else {
          // Faster lock for plucks; still smooth enough to avoid jitter
          const jump = Math.abs(frequency - this.smoothedFrequency) / this.smoothedFrequency;
          const alpha = jump > 0.06 ? 0.55 : 0.3;
          this.smoothedFrequency += (frequency - this.smoothedFrequency) * alpha;
        }

        const result = analyzePitchAgainstLockedNote(
          this.smoothedFrequency,
          this.lockedMidi,
          this.referenceHz,
        );
        this.lockedMidi = result.lockedMidi;
        reading = result.reading;
        this.lastReading = reading;
      } else {
        this.silentFrames++;
      }
    } else {
      this.silentFrames++;
    }

    // Hold last pitch briefly through pluck decay
    if (!reading && this.holdFrames > 0 && this.lastReading) {
      this.holdFrames--;
      reading = this.lastReading;
    }

    if (this.silentFrames > 30) {
      this.hasFrequency = false;
      this.lockedMidi = null;
      this.lastReading = null;
      this.holdFrames = 0;
      reading = null;
    }

    this.onUpdate({ reading, volume });
    this.rafId = requestAnimationFrame(this.loop);
  };
}
