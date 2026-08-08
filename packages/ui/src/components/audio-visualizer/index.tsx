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
import type { UniformType } from './shader-canvas';

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
  /**
   * GLSL source defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`.
   *
   * MUST output premultiplied colour: `fragColor = vec4(rgb * alpha, alpha);`,
   * never `vec4(rgb, alpha)`. The canvas composites using the browser's
   * default `premultipliedAlpha: true`; a translucent edge written the
   * natural (straight-alpha) way gets a dark fringe where it meets a light
   * page background.
   */
  fragment: string;
  /**
   * Custom uniforms. The canvas DECLARES these for you; declaring them in the
   * shader too is a compile error.
   *
   * `type` is narrowed to `UniformType`, not a bare string: an unrecognized
   * type here is caught by TypeScript for a TS-authored `shader` prop, before
   * it can produce `uniform undefined <name>;` in the assembled source (a
   * confusing compile error). A consumer reaching this through the
   * `<kai-audio-visualizer>` custom element or an attribute-driven wrapper
   * bypasses this check entirely (it is JS at that boundary, not TS) --
   * `variant-custom.tsx`'s `customUniforms` re-checks `type` at runtime for
   * exactly that reason.
   */
  uniforms?: Record<string, { type: UniformType; value: number | number[] }>;
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
  /**
   * Custom fragment shader for `variant="custom"`. See `ShaderSpec` for the
   * full contract -- most importantly, `fragment` MUST output premultiplied
   * colour (`vec4(rgb * alpha, alpha)`, not `vec4(rgb, alpha)`), or
   * translucent edges get dark fringes on light backgrounds.
   */
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
  /**
   * Call this if the shader cannot render at all -- most commonly
   * `canvas.getContext('webgl')` returning null. Permanent for this mount:
   * the dispatcher swaps to the bar fallback and will not retry the shader
   * on any later reactive update, only on switching to a different variant.
   */
  onUnavailable: () => void;
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
  // A mounted shader can ALSO fail after its chunk loads fine -- most notably
  // WebGL being unavailable, which only a mounted component can discover (it
  // is the one calling `canvas.getContext('webgl')`). This is a separate flag
  // from `Shader` itself: `Shader()` staying undefined already makes a failed
  // *import* permanent (nothing ever sets it), but a shader that DID load and
  // mount needs its own signal to force the fallback despite `Shader()` being
  // truthy. `onUnavailable` below is what a mounted shader calls to set it.
  const [unavailable, setUnavailable] = createSignal(false);
  createEffect(() => {
    const v = variant();
    const load = SHADER_VARIANTS[v];
    setShader(undefined);
    // Switching variants gets a fresh attempt: a failure on `aurora` must not
    // carry over and permanently block `wave` too.
    setUnavailable(false);
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
          {/*
            Bars stand in until the chunk resolves, and permanently if it
            cannot -- either because the import itself failed (`Shader()`
            never becomes truthy) or because the mounted shader called
            `onUnavailable` (checked here via `!unavailable()`, since
            `Shader()` alone cannot tell a working component from one that
            loaded fine but can't actually render, e.g. no WebGL). Both cases
            fall back to the same `BarVisualizer`, and `when` still narrows to
            the component reference on the success path, matching the
            `(Comp) => ...` extraction below.
          */}
          <Show
            when={!unavailable() && Shader()}
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
                  onUnavailable={() => setUnavailable(true)}
                />
              );
            }}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
