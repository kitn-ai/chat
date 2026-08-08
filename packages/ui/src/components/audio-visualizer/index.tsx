import {
  createSignal, createEffect, onCleanup, Show, Switch, Match,
  type Accessor, type Component, type JSX,
} from 'solid-js';
import { cn } from '../../utils/cn';
import { useAudioAnalysis } from '../../primitives/use-audio-analysis';
import { normalizeState, type VisualizerState } from '../../primitives/visualizer-sequences';
import { BarVisualizer, type VariantProps } from './variant-bar';
import { GridVisualizer } from './variant-grid';
import { RadialVisualizer } from './variant-radial';
import { defaultBarCount, defaultGridCount, defaultRadialBarCount, type VisualizerSize } from './sizes';

export type VisualizerVariant = 'bar' | 'grid' | 'radial' | 'wave' | 'aurora' | 'custom';

const KNOWN_VARIANTS: readonly VisualizerVariant[] = ['bar', 'grid', 'radial', 'wave', 'aurora', 'custom'];

/**
 * `aura` is LiveKit's name for this look. Ours is `aurora`. Accept theirs so
 * markup ported from LiveKit works unchanged, the same way `normalizeState`
 * accepts their room-lifecycle state names.
 */
const VARIANT_ALIASES: Record<string, VisualizerVariant> = { aura: 'aurora' };

export function normalizeVariant(input: string | undefined): VisualizerVariant {
  if (!input) return 'bar';
  if ((KNOWN_VARIANTS as readonly string[]).includes(input)) return input as VisualizerVariant;
  return VARIANT_ALIASES[input] ?? 'bar';
}

/** A consumer-supplied fragment shader, for `variant="custom"`. */
export interface ShaderSpec {
  /** GLSL source defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`. */
  fragment: string;
  /**
   * Custom uniforms. The canvas DECLARES these for you; declaring them in the
   * shader too is a compile error.
   */
  uniforms?: Record<string, { type: string; value: number | number[] }>;
}

export interface AudioVisualizerProps {
  variant?: VisualizerVariant;
  state?: string;
  size?: VisualizerSize;
  barCount?: number;
  rowCount?: number;
  columnCount?: number;
  /** Radial only: distance from center, in px. */
  radius?: number;
  /** Grid only: ring distance for the connecting animation, in cells. */
  spread?: number;
  /** Grid only: ms between scripted frames. */
  interval?: number;
  color?: string;
  /** Shader variants only: pattern density, 0..1. */
  complexity?: number;
  /** Setting this makes the element an announced image instead of decorative. */
  label?: string;
  stream?: MediaStream;
  audioElement?: HTMLMediaElement;
  /** Pre-computed levels. Set this and no AudioContext is ever constructed. */
  bands?: number[];
  shader?: ShaderSpec;
  class?: string;
  /**
   * Render each DOM variant's items yourself -- the same render-prop the
   * underlying bar/grid/radial component takes, imported rather than
   * redeclared so the two cannot drift. Not used by the shader variants
   * (`wave`/`aurora`/`custom`): a fragment shader has no per-item DOM for it
   * to replace.
   */
  children?: VariantProps['children'];
}

/** Tracks `prefers-reduced-motion`, live. */
export function usePrefersReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = createSignal(false);

  createEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    onCleanup(() => mq.removeEventListener?.('change', onChange));
  });

  return reduced;
}

/**
 * Props a shader variant (`wave`, `aurora`, `custom`) receives from the
 * dispatcher: everything a DOM variant gets, minus `children` (a fragment
 * shader has no per-item DOM for a render-prop to replace, so the field is
 * dropped rather than inherited-but-unused), plus the scalar `volume` reading
 * (shaders read one number, not per-band levels) and the shader-specific
 * knobs. This is the compile-time contract Tasks 12 to 15 build against --
 * keep it honest rather than casting around a looser type at the render site.
 */
export interface ShaderVariantProps extends Omit<VariantProps, 'children'> {
  volume: number;
  /** Pattern density, 0..1. */
  complexity?: number;
  /** Only meaningful for `variant="custom"`. */
  shader?: ShaderSpec;
}

/**
 * Shader variants live behind a dynamic import so the WebGL runtime and the
 * GLSL strings (about 25 to 30 KB) never reach a consumer who does not ask for
 * them.
 *
 * This MUST stay dynamic. `vite.config.ts` disables tree-shaking on the
 * register-all bundle by design, so a static import here would put the whole
 * shader path into `kai.es.js` for everyone, including a `<kai-chat>`-only
 * user. A dynamic import splits into its own chunk under `treeshake: false`;
 * a static one does not (verified empirically). Never convert these entries
 * to static imports.
 */
const SHADER_VARIANTS: Record<string, () => Promise<{ default: Component<ShaderVariantProps> }>> = {
  wave: () => import('./variant-wave'),
  aurora: () => import('./variant-aurora'),
  custom: () => import('./variant-custom'),
};

export function AudioVisualizer(props: AudioVisualizerProps): JSX.Element {
  const variant = () => normalizeVariant(props.variant);
  const size = () => props.size ?? 'md';
  const state = (): VisualizerState => normalizeState(props.state);
  const reduced = usePrefersReducedMotion();

  const isShader = () => variant() in SHADER_VARIANTS;

  // How many buckets the analyser should produce. Grid keys off its own
  // column default, radial off its own bar-count default, everything else
  // off the bar count -- pulled from `sizes.ts` rather than re-derived here,
  // so this stays in sync with what each variant actually renders.
  const bandCount = () => {
    if (variant() === 'grid') return props.columnCount ?? defaultGridCount(size());
    if (variant() === 'radial') return props.barCount ?? defaultRadialBarCount(size());
    return props.barCount ?? defaultBarCount(size());
  };

  // A caller-supplied `bands` array short-circuits Web Audio entirely, which is
  // what keeps the headless and SSR paths free of an AudioContext.
  const source = () => (props.bands ? undefined : props.stream ?? props.audioElement);
  // Pass the ACCESSOR, not its current value: useAudioAnalysis reads it inside
  // its own effect, so a later variant/size/barCount change rebuilds the
  // analyser at the new count instead of leaving it wired to whatever the
  // count happened to be at mount.
  const analysis = useAudioAnalysis(source, { bands: bandCount });
  const bands = () => props.bands ?? analysis.bands();

  // Lazily loaded shader component, or undefined until it resolves. Failure is
  // not fatal: the bar fallback below stays on screen.
  const [Shader, setShader] = createSignal<Component<ShaderVariantProps> | undefined>();
  createEffect(() => {
    const v = variant();
    const load = SHADER_VARIANTS[v];
    setShader(undefined);
    if (!load) return;
    let cancelled = false;
    void load()
      .then((m) => { if (!cancelled) setShader(() => m.default); })
      .catch((err) => {
        console.warn(
          `<kai-audio-visualizer variant="${v}">: failed to load the shader chunk, falling back to bars.`,
          err,
        );
      });
    onCleanup(() => { cancelled = true; });
  });

  // Props every variant shares. Deliberately WITHOUT `children`: this is the
  // object spread into the shader component (`<C>` below), and
  // ShaderVariantProps has no slot for it. Do not add `children` here -- add
  // it to `domShared` instead, or the exclusion below stops meaning anything.
  const shared = (): VariantProps => ({
    state: state(),
    size: size(),
    bands: bands(),
    frozen: reduced(),
    color: props.color,
  });

  // The three DOM variants (bar/grid/radial), including the bar fallback
  // shown while a shader chunk loads or fails, additionally get the
  // caller's render-prop.
  const domShared = (): VariantProps => ({ ...shared(), children: props.children });

  const a11y = () =>
    props.label
      ? { role: 'img' as const, 'aria-label': props.label }
      : { 'aria-hidden': 'true' as const };

  return (
    <div class={cn('inline-flex', props.class)} {...a11y()}>
      <Switch
        fallback={<BarVisualizer {...domShared()} barCount={props.barCount} />}
      >
        <Match when={variant() === 'grid'}>
          <GridVisualizer
            {...domShared()}
            rowCount={props.rowCount}
            columnCount={props.columnCount}
            spread={props.spread}
            interval={props.interval}
          />
        </Match>
        <Match when={variant() === 'radial'}>
          <RadialVisualizer {...domShared()} barCount={props.barCount} radius={props.radius} />
        </Match>
        <Match when={isShader()}>
          {/* Bars stand in until the chunk resolves, and permanently if it cannot. */}
          <Show
            when={Shader()}
            fallback={<BarVisualizer {...domShared()} barCount={props.barCount} />}
          >
            {(Comp) => {
              const C = Comp();
              return (
                <C
                  {...shared()}
                  volume={analysis.volume()}
                  complexity={props.complexity}
                  shader={props.shader}
                />
              );
            }}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
