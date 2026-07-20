import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  findInstrument,
  INSTRUMENTS,
  type Instrument,
  type InstrumentCategory,
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

const GROUPED_CATEGORIES = new Set<InstrumentCategory>([
  'guitar',
  'bass',
  'ukulele',
  'banjo',
  'orchestral',
]);

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
  let expandedCategory: InstrumentCategory | null = null;

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

  function syncActiveStates(): void {
    const activeId = selection.instrument.id;

    for (const btn of list.querySelectorAll<HTMLButtonElement>('.instrument-item, .preset-item')) {
      btn.classList.toggle('active', btn.dataset.id === activeId);
    }

    for (const group of list.querySelectorAll<HTMLElement>('.instrument-group')) {
      const category = group.dataset.category as InstrumentCategory;
      const items = INSTRUMENTS.filter((i) => i.category === category);
      const activeInGroup = items.some((i) => i.id === activeId);
      const toggle = group.querySelector<HTMLButtonElement>('.instrument-group-toggle')!;
      const sub = group.querySelector<HTMLElement>('.instrument-group-active')!;
      group.classList.toggle('has-active', activeInGroup);
      sub.textContent = activeInGroup
        ? selection.instrument.shortName
        : `${items.length} presets`;
    }
  }

  function setExpanded(category: InstrumentCategory | null): void {
    expandedCategory = category;
    for (const group of list.querySelectorAll<HTMLElement>('.instrument-group')) {
      const cat = group.dataset.category as InstrumentCategory;
      const open = cat === category;
      group.classList.toggle('open', open);
      const toggle = group.querySelector<HTMLButtonElement>('.instrument-group-toggle')!;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function selectInstrument(id: string, closeMenu = true): void {
    selection = {
      instrument: findInstrument(id),
      pinnedString: null,
    };
    labelEl.textContent = selection.instrument.name.toUpperCase();

    if (GROUPED_CATEGORIES.has(selection.instrument.category)) {
      expandedCategory = selection.instrument.category;
      setExpanded(expandedCategory);
    }

    syncActiveStates();
    renderStrings();
    callbacks.onChange(selection);
    if (closeMenu) setOpen(false);
  }

  function buildPresetButton(instrument: Instrument): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-item';
    btn.dataset.id = instrument.id;
    btn.textContent = instrument.shortName;
    btn.addEventListener('click', () => selectInstrument(instrument.id));
    return btn;
  }

  function buildFlatButton(instrument: Instrument): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'instrument-item';
    btn.dataset.id = instrument.id;
    const sub = instrument.strings.length > 0 ? `${instrument.strings.length} strings` : 'Chromatic';
    btn.innerHTML = `
      <span class="instrument-item-icon">${instrumentIconSvg(instrument.icon)}</span>
      <span class="instrument-item-text">
        <span class="instrument-item-name">${instrument.name}</span>
        <span class="instrument-item-sub">${sub}</span>
      </span>
    `;
    btn.addEventListener('click', () => selectInstrument(instrument.id));
    return btn;
  }

  function buildGroup(category: InstrumentCategory, items: Instrument[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'instrument-group';
    group.dataset.category = category;

    const icon = items[0]?.icon ?? 'chromatic';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'instrument-group-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `
      <span class="instrument-item-icon">${instrumentIconSvg(icon)}</span>
      <span class="instrument-item-text">
        <span class="instrument-item-name">${CATEGORY_LABELS[category]}</span>
        <span class="instrument-item-sub instrument-group-active">${items.length} presets</span>
      </span>
      <span class="instrument-group-chevron" aria-hidden="true"></span>
    `;
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setExpanded(expandedCategory === category ? null : category);
    });

    const panel = document.createElement('div');
    panel.className = 'instrument-group-panel';
    for (const instrument of items) {
      panel.appendChild(buildPresetButton(instrument));
    }

    group.append(toggle, panel);
    return group;
  }

  list.innerHTML = '';
  for (const category of CATEGORY_ORDER) {
    const items = INSTRUMENTS.filter((i) => i.category === category);
    if (items.length === 0) continue;

    if (category === 'general') {
      const heading = document.createElement('div');
      heading.className = 'instrument-category';
      heading.textContent = CATEGORY_LABELS[category];
      list.appendChild(heading);
      for (const instrument of items) {
        list.appendChild(buildFlatButton(instrument));
      }
      continue;
    }

    list.appendChild(buildGroup(category, items));
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
