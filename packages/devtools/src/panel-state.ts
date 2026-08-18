// The panel's own persisted UI state.
//
// Its OWN key, never the activation key: remembering that the drawer was open
// is not consent to record, and writing `kai-devtools` would turn a layout
// preference into a signal that starts capture on the next load.
const UI_KEY = 'kai-devtools:ui';

export interface UiState {
  open: boolean;
  height: number;
  /** Which evidence disclosures are expanded. Absent means collapsed, which is
   *  the default: findings first, evidence on demand. */
  sections: Record<string, boolean>;
}

/** ~40% of the viewport. First-run only; a height the developer chose wins. */
export function defaultHeight(): number {
  if (typeof window === 'undefined') return 320;
  return Math.round(window.innerHeight * 0.4);
}

export const MIN_HEIGHT = 180;
export const maxHeight = (): number =>
  Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.85);

export function loadUi(): UiState {
  // Default OPEN on first activation: somebody who just set the signal and
  // reloaded is looking for the panel, and a dot to hunt for reads as broken.
  const fallback: UiState = { open: true, height: defaultHeight(), sections: {} };
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      open: typeof parsed.open === 'boolean' ? parsed.open : fallback.open,
      height: typeof parsed.height === 'number' ? parsed.height : fallback.height,
      sections: parsed.sections && typeof parsed.sections === 'object' ? { ...parsed.sections } : {},
    };
  } catch {
    return fallback; // storage throws in private mode; a devtool must not
  }
}

export function saveUi(state: UiState): void {
  try {
    window.localStorage.setItem(UI_KEY, JSON.stringify(state));
  } catch {
    // The panel still works, it just forgets. Not worth a console line.
  }
}
