import './ui/tokens.css';
import './ui/components.css';

import {
  ArcRotateCamera,
  Engine,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { Box3DPlugin } from '@frsource/babylon-box3d';
import Box3D from 'box3d-wasm/standard';
import { MicPitchDetector } from './audio/pitchDetector';
import {
  analyzePitchAgainstMidi,
  centsDirection,
  formatCents,
  frequencyFromMidi,
  type PitchReading,
} from './audio/notes';
import { nearestString } from './instruments';
import { createTunerVisual, setupTunerBloom, setupTunerLighting } from './scene/tunerVisual';
import { createInstrumentMenu, type InstrumentSelection } from './ui/instrumentMenu';
import { setReadoutActive, setReadoutIdle, type ReadoutElements } from './ui/readout';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const readoutEls: ReadoutElements = {
  noteBar: document.getElementById('noteBar')!,
  note: document.getElementById('note')!,
  freq: document.getElementById('freq')!,
  cents: document.getElementById('cents')!,
  direction: document.getElementById('direction')!,
  status: document.getElementById('status')!,
};
const statusEl = readoutEls.status;
const startBtn = document.getElementById('startBtn')!;
const overlay = document.getElementById('overlay')!;
const overlayError = document.getElementById('overlayError');

function showBootError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  if (overlayError) overlayError.textContent = message;
  statusEl.textContent = message;
  overlay.classList.remove('hidden');
  startBtn.textContent = 'Reload page';
  startBtn.onclick = () => location.reload();
}

function resolveReading(
  chromatic: PitchReading,
  selection: InstrumentSelection,
): { reading: PitchReading; activeStringId: string | null } {
  const { instrument, pinnedString } = selection;

  if (pinnedString) {
    return {
      reading: analyzePitchAgainstMidi(chromatic.frequency, pinnedString.midi),
      activeStringId: pinnedString.id,
    };
  }

  if (instrument.strings.length > 0) {
    const match = nearestString(chromatic.frequency, instrument.strings);
    if (match) {
      return {
        reading: analyzePitchAgainstMidi(chromatic.frequency, match.midi),
        activeStringId: match.id,
      };
    }
  }

  return { reading: chromatic, activeStringId: null };
}

try {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
    premultipliedAlpha: false,
  });
  const scene = new Scene(engine);
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;

  const camera = new ArcRotateCamera(
    'cam',
    -Math.PI / 2,
    Math.PI / 2,
    7,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.lowerRadiusLimit = 5.5;
  camera.upperRadiusLimit = 12;
  camera.attachControl(canvas, true);
  camera.inputs.clear();

  setupTunerLighting(scene);
  setupTunerBloom(scene, camera);

  const box3d = await Box3D();
  const plugin = new Box3DPlugin(box3d);
  scene.enablePhysics(new Vector3(0, 0, 0), plugin);

  const tunerVisual = await createTunerVisual(scene);
  const detector = new MicPitchDetector();

  function applyFrequencyHints(selection: InstrumentSelection): void {
    const { instrument, pinnedString } = selection;
    if (pinnedString) {
      detector.setFrequencyHints([frequencyFromMidi(pinnedString.midi)]);
      return;
    }
    if (instrument.strings.length > 0) {
      detector.setFrequencyHints(instrument.strings.map((s) => frequencyFromMidi(s.midi)));
      return;
    }
    // Chromatic / piano — favor typical voice + fretted range
    detector.setFrequencyHints([]);
  }

  const menu = createInstrumentMenu({
    onChange(selection) {
      applyFrequencyHints(selection);
    },
  });
  applyFrequencyHints(menu.getSelection());

  detector.onUpdate = ({ reading: chromatic, volume }) => {
    const selection = menu.getSelection();

    if (!chromatic) {
      setReadoutIdle(readoutEls, {
        directionText: selection.pinnedString ? `Play ${selection.pinnedString.label}` : 'Play a note',
        statusText: 'Waiting for input',
        hearingSound: volume > 0.0015,
      });
      menu.setActiveString(selection.pinnedString?.id ?? null);
      tunerVisual.updateFromCents(null, volume);
      return;
    }

    const { reading, activeStringId } = resolveReading(chromatic, selection);
    menu.setActiveString(activeStringId);
    tunerVisual.updateFromCents(reading.cents, volume);

    const { noteName, octave, frequency, cents } = reading;
    const stringHint =
      selection.instrument.strings.length > 0 && activeStringId
        ? selection.instrument.strings.find((s) => s.id === activeStringId)?.label
        : null;

    const dir = centsDirection(cents);
    const centsLabel = `${formatCents(cents)} ¢`;
    const directionText =
      dir === 'in-tune'
        ? stringHint
          ? `${stringHint} in tune ✓`
          : `Centered on ${noteName}${octave} ✓`
        : stringHint
          ? `${stringHint} · ${centsLabel}`
          : centsLabel;

    setReadoutActive(readoutEls, {
      noteText: `${noteName}${octave}`,
      freqText: `${frequency.toFixed(1)} Hz`,
      centsText: stringHint ? `${formatCents(cents)} ¢ · ${stringHint}` : `${formatCents(cents)} ¢`,
      direction: dir,
      directionText,
      statusText: selection.pinnedString
        ? `Locked · ${selection.instrument.shortName}`
        : selection.instrument.strings.length > 0
          ? `Strings · ${selection.instrument.shortName}`
          : 'Chromatic auto',
      barWidthPct: Math.min(95, 35 + Math.abs(cents) * 1.1),
    });
  };

  startBtn.addEventListener('click', async () => {
    startBtn.textContent = 'Starting…';
    startBtn.setAttribute('disabled', 'true');
    if (overlayError) overlayError.textContent = '';
    try {
      await detector.start();
      overlay.classList.add('hidden');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      startBtn.textContent = 'Try again';
      startBtn.removeAttribute('disabled');
      statusEl.textContent = message;
      if (overlayError) overlayError.textContent = message;
      console.error('Mic start failed:', err);
    }
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
} catch (err) {
  showBootError(err);
}
