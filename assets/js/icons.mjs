/**
 * Gantt Studio interaction icons.
 * Lucide-style 24px outline glyphs, embedded locally (no CDN, framework or runtime dependency).
 * Geometry adapted from the Lucide icon family (ISC License): https://lucide.dev/license
 * Functional Gantt notation (milestone, gate, baseline, progress, dependencies) is deliberately separate.
 */
const PATHS = Object.freeze({
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'trash-2': '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/>',
  'pencil': '<path d="m16 5 3 3M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20Z"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'x': '<path d="M18 6 6 18M6 6l12 12"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevrons-down-up': '<path d="m7 10 5-5 5 5M7 14l5 5 5-5"/>',
  'chevrons-up-down': '<path d="m7 5 5 5 5-5M7 19l5-5 5 5"/>',
  'grip-vertical': '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  'external-link': '<path d="M15 3h6v6M10 14 21 3"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
  'filter': '<path d="M4 4h16l-6 7v7l-4 2v-9L4 4Z"/>',
  'sliders-horizontal': '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4M12 17h.01"/>',
  'circle-alert': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  'loader-circle': '<path d="M21 12a9 9 0 1 1-9-9"/>',
  'calendar-days': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
  'chart-gantt': '<path d="M3 3v18h18M7 8h8v4H7zM11 15h10v4H11z"/>',
  'palette': '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 22a10 10 0 1 1 10-10c0 2.5-1.5 4-4 4h-2a2 2 0 0 0-2 2c0 2-1 4-2 4Z"/>',
  'file-json': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M9 13c-2 0-2 1-2 2s0 2-2 2c2 0 2 1 2 2s0 2 2 2m6-8c2 0 2 1 2 2s0 2 2 2c-2 0-2 1-2 2s0 2-2 2"/>',
  'file-spreadsheet': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h8M12 13v8"/>',
  'printer': '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v6H6zM18 12h.01"/>',
  'arrow-right-to-line': '<path d="M17 12H3m8-6 6 6-6 6M21 4v16"/>',
});

/** A decorative SVG; the enclosing control retains its real accessible name. */
export function icon(name) {
  const geometry = PATHS[name];
  if (!geometry) throw new Error(`Unbekanntes UI-Icon: ${name}`);
  return `<svg class="ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${geometry}</svg>`;
}

/** Hydrate inert placeholders only; never replace event-bound buttons or row nodes. */
export function hydrateIcons(root = document) {
  const nodes = root.matches?.('[data-icon]')
    ? [root, ...root.querySelectorAll('[data-icon]')]
    : [...root.querySelectorAll('[data-icon]')];
  for (const node of nodes) {
    if (node.dataset.iconRendered === node.dataset.icon) continue;
    node.innerHTML = icon(node.dataset.icon);
    node.dataset.iconRendered = node.dataset.icon;
  }
}
