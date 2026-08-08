import type { JSX } from 'solid-js';
import { AudioVisualizer, type ShaderSpec, type VisualizerVariant } from '../components/audio-visualizer';
import type { VisualizerSize } from '../components/audio-visualizer/sizes';
import { defineWebComponent, type WebComponentContext } from './define';

interface Props extends Record<string, unknown> {
  /** Look to render: `bar` (default), `grid`, `radial`, `wave`, `aurora`, `custom`.
   *  `aura` is accepted as a LiveKit-markup alias for `aurora`. Attribute: `variant`. */
  variant?: string;
  /** `idle` (default), `connecting`, `listening`, `thinking`, `speaking`. LiveKit's
   *  room-lifecycle state names are accepted as aliases. Attribute: `state`. */
  state?: string;
  /** `icon` | `sm` | `md` (default) | `lg` | `xl`. Attribute: `size`. */
  size?: string;
  /** Bars to draw. Bar and radial only. Attribute: `bar-count`. */
  barCount?: number;
  /** Grid rows. Attribute: `row-count`. */
  rowCount?: number;
  /** Grid columns. Attribute: `column-count`. */
  columnCount?: number;
  /** Radial only: ring distance from center, in px. Attribute: `radius`. */
  radius?: number;
  /** Grid only: ring distance for the connecting animation, in cells. Attribute: `spread`. */
  spread?: number;
  /** Grid only: ms between scripted frames. Attribute: `interval`. */
  interval?: number;
  /** CSS color for the geometry, overriding the inherited `currentColor`. Attribute: `color`. */
  color?: string;
  /** Shader variants only: pattern density, 0..1. Attribute: `complexity`. */
  complexity?: number;
  /** Setting this makes the element an announced image (`role="img"`) instead of
   *  decorative (`aria-hidden`). Attribute: `label`. */
  label?: string;
  /** Live microphone or WebRTC audio to analyze. JS property only. */
  stream?: MediaStream;
  /** An `<audio>` or `<video>` element to tap for its audio. JS property only. */
  audioElement?: HTMLMediaElement;
  /** Pre-computed levels, 0..1. Set this and no AudioContext is ever built, which is
   *  what keeps headless/SSR rendering and browser-speech-synthesis playback (which
   *  exposes no audio node) free of Web Audio entirely. JS property only. A new
   *  array reference is required for each update; mutating the existing array in
   *  place will not re-render. */
  bands?: number[];
  /** Custom fragment shader for `variant="custom"`. JS property only. */
  shader?: ShaderSpec;
}

/**
 * Parse a numeric attribute or JS property value. Attribute values arrive as
 * strings, so a missing or non-numeric one must resolve to `undefined` (which
 * the composed component then defaults itself), never `NaN`, which would
 * poison the downstream geometry (bar counts, radii, grid dimensions).
 */
export function num(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The facade's render logic, extracted to a named function so it can be
 * exercised directly in tests (a plain Solid component call, no shadow DOM
 * involved) without needing `defineWebComponent`'s browser-only custom-element
 * upgrade path. Identical to what was previously an inline arrow passed to
 * `defineWebComponent` below, plus forwarding the resolved theme (see `dark`
 * below) once that context field existed to forward.
 *
 * `ctx` is optional so the existing declarative test (which calls this
 * directly with just `props`, the way it did before `dark` existed) keeps
 * working unchanged. `defineWebComponent` always supplies a real one; the
 * `false` fallback only matters for that reduced, no-shadow-DOM call path.
 */
export function AudioVisualizerFacade(
  props: Props,
  ctx?: Pick<WebComponentContext, 'dark'>,
): JSX.Element {
  // Every element already resolves `theme='light'|'dark'|'auto'` against a
  // live `prefers-color-scheme` listener in `defineWebComponent` (see
  // `createDarkMode`), to drive the `.dark` class every element's content
  // sits inside. A WebGL shader cannot read that class or a CSS custom
  // property, so `<kai-audio-visualizer variant="aurora">` needs the ALREADY
  // -RESOLVED boolean forwarded explicitly instead. Passing it through as a
  // definite 'light'/'dark' (never 'auto') means the resolution RULE itself
  // -- explicit wins, 'auto' follows the media query -- lives in exactly one
  // place (`createDarkMode`); this is a plain relay, not a second
  // implementation of that rule.
  const dark = ctx?.dark?.() ?? false;

  return (
    <AudioVisualizer
      variant={props.variant as VisualizerVariant | undefined}
      state={props.state as string | undefined}
      size={props.size as VisualizerSize | undefined}
      barCount={num(props.barCount)}
      rowCount={num(props.rowCount)}
      columnCount={num(props.columnCount)}
      radius={num(props.radius)}
      spread={num(props.spread)}
      interval={num(props.interval)}
      color={props.color as string | undefined}
      complexity={num(props.complexity)}
      label={props.label as string | undefined}
      stream={props.stream as MediaStream | undefined}
      audioElement={props.audioElement as HTMLMediaElement | undefined}
      bands={props.bands as number[] | undefined}
      shader={props.shader as ShaderSpec | undefined}
      theme={dark ? 'dark' : 'light'}
    />
  );
}

/**
 * `<kai-audio-visualizer>` renders live audio as bars, a grid, a ring, a wave,
 * or a glowing aurora. It also animates from `state` alone with no audio at
 * all, which is what you want when the source cannot be tapped (browser
 * speech synthesis exposes no audio node).
 *
 * ```html
 * <kai-audio-visualizer variant="bar" state="speaking" size="md"></kai-audio-visualizer>
 * <kai-audio-visualizer variant="radial" size="lg" bar-count="24"></kai-audio-visualizer>
 * ```
 *
 * Audio sources and rich data are JS properties, never attributes:
 * ```js
 * el.stream = micStream            // MediaStream
 * el.audioElement = audioRef       // HTMLMediaElement
 * el.bands = [0.2, 0.8, 0.4]       // pre-computed, skips Web Audio; new array each update
 * el.shader = { fragment: glsl }   // variant="custom" only
 * ```
 *
 * This is a display element: no methods, no events.
 *
 * Restyle from outside via `::part(bar)` / `::part(cell)` / `::part(canvas)`,
 * the bar and cell parts each carrying `data-kai-index` and `data-kai-highlighted`.
 */
defineWebComponent<Props>('kai-audio-visualizer', {
  variant: 'bar',
  state: 'idle',
  size: 'md',
  barCount: undefined,
  rowCount: undefined,
  columnCount: undefined,
  radius: undefined,
  spread: undefined,
  interval: undefined,
  color: undefined,
  complexity: undefined,
  label: undefined,
  stream: undefined,
  audioElement: undefined,
  bands: undefined,
  shader: undefined,
}, AudioVisualizerFacade);
