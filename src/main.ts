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

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const noteBarEl = document.getElementById('noteBar')!;
const noteEl = document.getElementById('note')!;
const freqEl = document.getElementById('freq')!;
const centsEl = document.getElementById('cents')!;
const directionEl = document.getElementById('direction')!;
const statusEl = document.getElementById('status')!;
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
  });
  const scene = new Scene(engine);

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
      noteEl.textContent = '—';
      noteBarEl.style.width = '18%';
      noteBarEl.className = 'note-bar idle';
      freqEl.textContent = 'Hz';
      centsEl.textContent = '—';
      directionEl.textContent = selection.pinnedString
        ? `Play ${selection.pinnedString.label}`
        : 'Play a note';
      directionEl.className = 'direction idle';
      if (volume > 0.0015) {
        statusEl.textContent = 'Hearing sound — hold the note';
      } else {
        statusEl.textContent = 'Waiting for input';
      }
      menu.setActiveString(selection.pinnedString?.id ?? null);
      tunerVisual.updateFromCents(null, volume);
      return;
    }

    const { reading, activeStringId } = resolveReading(chromatic, selection);
    menu.setActiveString(activeStringId);
    tunerVisual.updateFromCents(reading.cents, volume);

    const { noteName, octave, frequency, targetFrequency, cents } = reading;
    const stringHint =
      selection.instrument.strings.length > 0 && activeStringId
        ? selection.instrument.strings.find((s) => s.id === activeStringId)?.label
        : null;

    noteEl.textContent = `${noteName}${octave}`;
    noteBarEl.style.width = `${Math.min(95, 35 + Math.abs(cents) * 1.1)}%`;
    freqEl.textContent = `${frequency.toFixed(1)} Hz`;
    centsEl.textContent = stringHint
      ? `${formatCents(cents)} ¢ · ${stringHint}`
      : `${formatCents(cents)} ¢`;

    const dir = centsDirection(cents);
    noteBarEl.className = 'note-bar';
    if (dir === 'in-tune') {
      noteBarEl.classList.add('in-tune');
      directionEl.textContent = stringHint
        ? `${stringHint} in tune ✓`
        : `Centered on ${noteName}${octave} ✓`;
      directionEl.className = 'direction in-tune';
    } else if (dir === 'sharp') {
      noteBarEl.classList.add('sharp');
      directionEl.textContent = stringHint
        ? `${stringHint} — sharp ♯`
        : `${noteName}${octave} — sharp ♯`;
      directionEl.className = 'direction sharp';
    } else {
      noteBarEl.classList.add('flat');
      directionEl.textContent = stringHint
        ? `${stringHint} — flat ♭`
        : `${noteName}${octave} — a bit flat ♭`;
      directionEl.className = 'direction flat';
    }

    statusEl.textContent = selection.pinnedString
      ? `Locked · ${selection.instrument.shortName}`
      : selection.instrument.strings.length > 0
        ? `Strings · ${selection.instrument.shortName}`
        : 'Chromatic auto';
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
