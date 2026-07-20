import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  findInstrument,
  INSTRUMENTS,
  type Instrument,
  type InstrumentString,
} from '../instruments';
import { instrumentIconSvg } from './icons';

export type InstrumentSelection = {
  instrument: Instrument;
  /** When set, tune only this string */
  pinnedString: InstrumentString | null;
};

type MenuCallbacks = {
  onChange: (selection: InstrumentSelection) => void;
};

export function createInstrumentMenu(callbacks: MenuCallbacks): {
  setActiveString: (stringId: string | null) => void;
  getSelection: () => InstrumentSelection;
} {
  const toggleBtn = document.getElementById('menuToggle')!;
  const closeBtn = document.getElementById('menuClose')!;
  const drawer = document.getElementById('instrumentDrawer')!;
  const backdrop = document.getElementById('menuBackdrop')!;
  const list = document.getElementById('instrumentList')!;
  const stringsSection = document.getElementById('drawerStrings')!;
  const stringsEl = document.getElementById('stringList')!;
  const labelEl = document.getElementById('instrumentLabel')!;

  let selection: InstrumentSelection = {
    instrument: findInstrument('chromatic'),
    pinnedString: null,
  };

  let isOpen = false;

  function setOpen(open: boolean): void {
    isOpen = open;
    drawer.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    toggleBtn.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('menu-open', open);
  }

  function renderStrings(): void {
    stringsEl.innerHTML = '';
    const { instrument, pinnedString } = selection;

    if (instrument.strings.length === 0) {
      stringsSection.hidden = true;
      return;
    }

    stringsSection.hidden = false;
    for (const s of instrument.strings) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'string-chip';
      btn.dataset.stringId = s.id;
      btn.textContent = s.label;
      if (pinnedString?.id === s.id) btn.classList.add('pinned');
      btn.addEventListener('click', () => {
        selection = {
          ...selection,
          pinnedString: pinnedString?.id === s.id ? null : s,
        };
        renderStrings();
        callbacks.onChange(selection);
      });
      stringsEl.appendChild(btn);
    }
  }

  function selectInstrument(id: string, closeMenu = true): void {
    selection = {
      instrument: findInstrument(id),
      pinnedString: null,
    };
    labelEl.textContent = selection.instrument.name.toUpperCase();

    for (const btn of list.querySelectorAll<HTMLButtonElement>('.instrument-item')) {
      btn.classList.toggle('active', btn.dataset.id === id);
    }

    renderStrings();
    callbacks.onChange(selection);
    if (closeMenu) setOpen(false);
  }

  list.innerHTML = '';
  for (const category of CATEGORY_ORDER) {
    const items = INSTRUMENTS.filter((i) => i.category === category);
    if (items.length === 0) continue;

    const heading = document.createElement('div');
    heading.className = 'instrument-category';
    heading.textContent = CATEGORY_LABELS[category];
    list.appendChild(heading);

    for (const instrument of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'instrument-item';
      btn.dataset.id = instrument.id;
      const sub =
        instrument.strings.length > 0
          ? `${instrument.strings.length} strings`
          : 'Chromatic';
      btn.innerHTML = `
        <span class="instrument-item-icon">${instrumentIconSvg(instrument.icon)}</span>
        <span class="instrument-item-text">
          <span class="instrument-item-name">${instrument.name}</span>
          <span class="instrument-item-sub">${sub}</span>
        </span>
      `;
      btn.addEventListener('click', () => selectInstrument(instrument.id));
      list.appendChild(btn);
    }
  }

  toggleBtn.addEventListener('click', () => setOpen(!isOpen));
  closeBtn.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });

  selectInstrument('chromatic', false);

  return {
    getSelection: () => selection,
    setActiveString(stringId: string | null) {
      for (const chip of stringsEl.querySelectorAll<HTMLButtonElement>('.string-chip')) {
        chip.classList.toggle('hearing', !!stringId && chip.dataset.stringId === stringId);
      }
    },
  };
}
