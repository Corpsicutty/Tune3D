const icons: Record<string, string> = {
  chromatic: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
      <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`,
  guitar: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 3.5l6 6M13 5l6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M9.2 9.8c-2.2-.2-4.4 1.4-4.6 3.8-.2 2.8 2 5 4.8 4.8 2.3-.2 4-2.4 3.8-4.6" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="10.2" cy="14.2" r="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <path d="M12.2 11.5L19 4.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
  ukulele: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 8.5c-2.4 0-4.2 1.9-4.2 4.2S7.6 17 10 17s4.2-1.9 4.2-4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="10" cy="12.8" r="1.3" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M13.5 10.2L19 4.7M18 5.7l1.8 1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.2 9.2c.6-.7 1.5-1 2.3-.9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  piano: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <path d="M7 6v7.5M10.5 6v7.5M14 6v7.5M17.5 6v7.5M3.5 13.5h17" stroke="currentColor" stroke-width="1.4"/>
    </svg>`,
  bass: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 10c-2.6 0-4.5 2-4.5 4.4S6 19 8.7 19c2.4 0 4.2-1.8 4.3-4" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="9" cy="14.5" r="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12.2 12L19.5 4.8M18.3 6l1.8 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M7 12.2h3.2M7 14.5h3.2M7 16.8h3.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  violin: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 14.5c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5c0-1.4-.7-2.5-1.6-3.3.9-.8 1.6-1.9 1.6-3.3C17 5.9 15 4 12.5 4S8 5.9 8 8.2c0 1.4.7 2.5 1.6 3.3-.9.8-1.6 1.9-1.6 3" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12.5 7.5v9M10.2 12.5h4.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M15.8 5.2l3.5-2.2M16.8 6.5l2.2 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`,
  cello: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 13c0 2.8 2.2 5 5 5s5-2.2 5-5c0-1.5-.7-2.8-1.8-3.6.9-.8 1.5-2 1.5-3.3 0-2.5-2-4.5-4.7-4.5S8.8 3.6 8.8 6.1c0 1.3.6 2.5 1.5 3.3-1.1.8-1.8 2.1-1.8 3.6z" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="M13.5 7v10M11 12.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M12 19.5v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  mandolin: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9.5" cy="13.5" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="9.5" cy="13.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M13.2 10.2L20 3.5M18.8 4.7l1.7 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M7.5 11.2h4M7.5 13.5h4M7.5 15.8h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  banjo: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="13" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <circle cx="10" cy="13" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M14 9.5L20.2 3.8M19 5l1.8 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8 13h4M10 11v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
};

export function instrumentIconSvg(icon: string): string {
  return icons[icon] ?? icons.chromatic;
}
