export type TuneDirection = 'idle' | 'in-tune' | 'sharp' | 'flat';

export type ReadoutElements = {
  noteBar: HTMLElement;
  note: HTMLElement;
  freq: HTMLElement;
  cents: HTMLElement;
  direction: HTMLElement;
  status: HTMLElement;
};

export function setReadoutIdle(
  els: ReadoutElements,
  opts: { directionText: string; statusText: string; hearingSound: boolean },
): void {
  els.note.textContent = '—';
  els.noteBar.style.width = '18%';
  els.noteBar.className = 'note-bar idle';
  els.freq.textContent = 'Hz';
  els.cents.textContent = '—';
  els.direction.textContent = opts.directionText;
  els.direction.className = 'direction idle';
  els.status.textContent = opts.hearingSound ? 'Hearing sound — hold the note' : opts.statusText;
}

export function setReadoutActive(
  els: ReadoutElements,
  opts: {
    noteText: string;
    freqText: string;
    centsText: string;
    direction: TuneDirection;
    directionText: string;
    statusText: string;
    barWidthPct: number;
  },
): void {
  els.note.textContent = opts.noteText;
  els.noteBar.style.width = `${opts.barWidthPct}%`;
  els.freq.textContent = opts.freqText;
  els.cents.textContent = opts.centsText;
  els.direction.textContent = opts.directionText;
  els.direction.className = `direction ${opts.direction}`;
  els.status.textContent = opts.statusText;
  els.noteBar.className = 'note-bar';
  if (opts.direction !== 'idle') {
    els.noteBar.classList.add(opts.direction);
  }
}
