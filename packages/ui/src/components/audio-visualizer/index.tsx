import {
  createSignal, createEffect, onCleanup, Show, Switch, Match,
  type Accessor, type Component, type JSX,
} from 'solid-js';
import { cn } from '../../utils/cn';
import { useAudioAnalysis } from '../../primitives/use-audio-analysis';
import { mirrorBandsCenterOut, mirrorBandsAroundRing } from '../../primitives/audio-bands';
import { normalizeState, type VisualizerState } from '../../primitives/visualizer-sequences';
import { BarVisualizer, type VariantProps } from './variant-bar';
import { createFitScale } from './fit-scale';
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
  /** Grid only: rows and columns of the square grid. */
  count?: number;
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
  /** Live audio to analyze. NOTE: amplitude renders only while
   *  `state === 'speaking'` unless `listeningAmplitude` is set; every other
   *  state plays its scripted animation and the analysis output is unused. */
  stream?: MediaStream;
  /** Same speaking-only amplitude rule as `stream`: see `listeningAmplitude`. */
  audioElement?: HTMLMediaElement;
  /** Pre-computed levels. Set this and no AudioContext is ever constructed.
   *  Same speaking-only amplitude rule as `stream`: see `listeningAmplitude`. */
  bands?: number[];
  /**
   * Opt in to rendering live amplitude during `listening` as well, using the
   * same presentation as `speaking`. Default off, which keeps LiveKit parity:
   * amplitude (from `stream`, `audioElement` or `bands`) renders only while
   * `state === 'speaking'`. Set this to show a real mic-level picture while
   * the USER is the one talking. Forwarded to every variant; see
   * `amplitudeRenderState` in variant-bar for the single mapping they share.
   */
  listeningAmplitude?: boolean;
  /**
   * Custom fragment shader for `variant="custom"`. See `ShaderSpec` for the
   * full contract -- most importantly, `fragment` MUST output premultiplied
   * colour (`vec4(rgb * alpha, alpha)`, not `vec4(rgb, alpha)`), or
   * translucent edges get dark fringes on light backgrounds.
   */
  shader?: ShaderSpec;
  /**
   * Shader variants only (`wave`/`aurora`/`custom`): keep animating while the
   * element is scrolled off screen. Default `false`, which stops the draw loop
   * and releases the WebGL context until it comes back -- see `ShaderCanvas`'s
   * `animateWhenNotVisible` for the context-budget reasoning and the cost of
   * opting out. Does not override `prefers-reduced-motion`.
   */
  animateWhenNotVisible?: boolean;
  class?: string;
  /**
   * Render each DOM variant's items yourself -- the same render-prop the
   * underlying bar/grid/radial component takes, imported rather than
   * redeclared so the two cannot drift. Not used by the shader variants
   * (`wave`/`aurora`/`custom`): a fragment shader has no per-item DOM for it
   * to replace.
   */
  children?: VariantProps['children'];
  /**
   * Explicit `'light'` or `'dark'` wins; `'auto'` (the default) follows a
   * live `prefers-color-scheme` listener -- the same rule
   * `elements/define.tsx`'s `createDarkMode` applies for every `kai-*`
   * element. Only the shader variants read this (aurora/wave pick a colour
   * pipeline with it): the three DOM variants already get dark-mode styling
   * for free via CSS custom properties, which a shader baking colour into a
   * GLSL uniform cannot do. `<kai-audio-visualizer>` forwards its own
   * already-resolved `theme` attribute through this prop; a bare
   * `<AudioVisualizer>` with no wrapping element needs it set directly.
   */
  theme?: 'light' | 'dark' | 'auto';
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
 * Resolves `theme` (`'light' | 'dark' | 'auto'`) to a boolean, mirroring
 * `elements/define.tsx`'s `createDarkMode` rule exactly: an explicit value
 * wins, `'auto'` (the default) follows a live `prefers-color-scheme`
 * listener.
 *
 * This is a SEPARATE implementation of that rule, not an import of it:
 * `components/` is the framework-agnostic layer `elements/` wraps (see the
 * kit's architecture), so it cannot depend on `elements/define.tsx` without
 * inverting that direction. When driven through `<kai-audio-visualizer>`,
 * the facade has already resolved `'auto'` against its OWN listener (the one
 * already wired to the visible `.dark` class) before handing this an
 * explicit `'light'`/`'dark'` -- so this hook's own listener only ever
 * actually decides anything for a bare `<AudioVisualizer>` used directly,
 * with no wrapping element at all.
 */
export function useResolvedDark(theme: () => string | undefined): Accessor<boolean> {
  const [systemDark, setSystemDark] = createSignal(false);

  createEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.('change', onChange);
    onCleanup(() => mq.removeEventListener?.('change', onChange));
  });

  return () => {
    const t = theme() ?? 'auto';
    return t === 'dark' || (t === 'auto' && systemDark());
  };
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
   * Already-resolved: `true` selects the dark colour pipeline, `false`
   * selects light -- matching `elements/define.tsx`'s `createDarkMode`
   * output exactly (`classList={{ dark: isDark() }}`). This is that SAME
   * resolved value forwarded down, not a re-derivation, so a shader baking
   * colour into a GLSL uniform never needs its own `prefers-color-scheme`
   * listener for the common case. Optional: a shader mounted standalone (no
   * dispatcher resolving `theme` above it) may fall back to reading the
   * media query itself.
   */
  dark?: boolean;
  /**
   * Keep animating while off screen instead of releasing the WebGL context.
   * Relayed straight through to `ShaderCanvas`, which owns the behaviour and
   * documents the trade-off; the variants are pure conduits for it.
   */
  animateWhenNotVisible?: boolean;
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
  // Only the shader match arm below reads this; the three DOM variants get
  // dark-mode styling for free via CSS custom properties.
  const resolvedDark = useResolvedDark(() => props.theme);

  const isShader = () => variant() in SHADER_VARIANTS;

  // How many elements the active variant actually renders. Grid keys off its
  // own column default (each column shares one band across every row -- see
  // GridVisualizer), radial off its own bar-count default, everything else
  // off the bar count -- pulled from `sizes.ts` rather than re-derived here,
  // so this stays in sync with what each variant actually renders.
  const elementCount = () => {
    if (variant() === 'grid') return props.count ?? defaultGridCount(size());
    if (variant() === 'radial') return props.barCount ?? defaultRadialBarCount(size());
    return props.barCount ?? defaultBarCount(size());
  };

  // Only ceil(n/2) bands are requested from the analyser, not one per
  // element: useAudioAnalysis's output is mirrored back out to the full
  // elementCount below (centre-out for bar/grid, across the ring's vertical
  // axis for radial), which is what turns a real voice's natural
  // low-to-high spectral tilt into a shape that grows from the centre
  // outward instead of always ramping in one direction. See
  // mirrorBandsCenterOut / mirrorBandsAroundRing in primitives/audio-bands.ts
  // for the full rationale and the real-clip measurements behind it.
  const bandCount = () => Math.ceil(elementCount() / 2);

  // A caller-supplied `bands` array short-circuits Web Audio entirely, which is
  // what keeps the headless and SSR paths free of an AudioContext.
  const source = () => (props.bands ? undefined : props.stream ?? props.audioElement);
  // Pass the ACCESSOR, not its current value: useAudioAnalysis reads it inside
  // its own effect, so a later variant/size/barCount change rebuilds the
  // analyser at the new count instead of leaving it wired to whatever the
  // count happened to be at mount.
  const analysis = useAudioAnalysis(source, { bands: bandCount });

  // A caller-supplied `bands` array is used exactly as given -- it already
  // has whatever shape the caller intends, mirrored or not, and mirroring it
  // again here would be a second, unwanted transform on data we don't own.
  // The analyser's own output is only ceil(n/2) values (bandCount above);
  // mirror it back out to the FULL elementCount so it lines up EXACTLY with
  // what each variant's own `normalizeVolumeBands(props.bands, count())`
  // expects. Matching the count exactly here, rather than leaning on that
  // pad-by-repeating-the-last-value, matters specifically because the mirror
  // makes a length mismatch look like a plausible (but wrong) shape instead
  // of an obviously broken one.
  const bands = () => {
    if (props.bands) return props.bands;
    return variant() === 'radial'
      ? mirrorBandsAroundRing(analysis.bands(), elementCount())
      : mirrorBandsCenterOut(analysis.bands(), elementCount());
  };

  // The shader variants read `volume`, a scalar, not `bands`. When
  // caller-supplied `bands` short-circuits Web Audio above, `analysis.volume()`
  // sits at its initial 0 forever (nothing ever computes it), so a shader
  // fed `bands` would otherwise look static despite the DOM variants next to
  // it correctly animating. Derive it from the same `bands` this component
  // is already using -- root-mean-square, matching how `reduceToVolume` in
  // `primitives/audio-bands.ts` reduces real analyser output to a scalar, so
  // the two paths agree in character. Not reused directly: `reduceToVolume`
  // takes a `Uint8Array` of byte frequency data (0..255), not a `number[]` of
  // already-normalized 0..1 levels, so contorting it to accept both shapes
  // would be worse than the few lines below.
  const volume = () => {
    if (!props.bands) return analysis.volume();
    if (props.bands.length === 0) return 0;
    let sum = 0;
    for (const b of props.bands) sum += b * b;
    return Math.sqrt(sum / props.bands.length);
  };

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
        // Same `cancelled` check as the `.then` above. The two handlers were
        // asymmetric: a rejection arriving after this effect was disposed
        // still warned, even though there is no longer a component to fall
        // back to and nothing the message could usefully tell anyone. Worse,
        // the warning surfaces against whatever is running by the time the
        // rejection lands rather than against the mount that asked for the
        // chunk, so it reads as a fault in unrelated code -- in a test run,
        // in an unrelated test.
        if (cancelled) return;
        console.warn(
          `<kai-audio-visualizer variant="${v}">: failed to load the shader chunk, falling back to bars.`,
          err,
        );
      });
    onCleanup(() => { cancelled = true; });
  });

  // Props every variant shares, MINUS `bands` -- deliberately. Solid compiles
  // a component spread (`{...shared()}` below) into per-key getters that all
  // call this SAME function: reading ANY one key re-invokes the whole thing,
  // so if `bands()` lived in here, reading `state` (or `size`/`frozen`/
  // `color`) would transitively subscribe the reader to `bands()` too, which
  // updates ~31 times a second with live or synthetic audio. That is exactly
  // what caused two real bugs downstream: `use-sequencer.ts`'s effect reading
  // `frozen`/`state` re-ran at band cadence and called `setTick(0)` on every
  // run, so the tick could never advance (every scripted animation looked
  // dead); `shader-canvas.tsx`'s compile effect reading `precision`/`fragment`
  // re-ran the same way and recompiled the GL program 65-70 times in 4
  // seconds while restamping its animation clock (`iTime` pinned under 0.33s,
  // periodically negative). Both were patched locally with memos in those
  // files (kept -- defence in depth, cheap, and they document the hazard),
  // but the leak was still here for the next reader: `variant-wave.tsx`,
  // `variant-aurora.tsx`, and `variant-custom.tsx` each have their OWN
  // state/frozen-driven tween effect with no local memo at all, so they were
  // live instances of the identical bug (`.to()` restarts a tween's clock on
  // every call -- see `create-tween.ts` -- so a 31Hz re-run means a tween
  // never visibly progresses). Fixing it here, at the one place the bundling
  // happens, closes all of those at once rather than requiring every current
  // and future reader to remember to memoize defensively.
  //
  // `bands` GENUINELY must stay reactive -- this split is about not dragging
  // it into unrelated reads, not about freezing it. It is passed explicitly,
  // `bands={bands()}`, at every call site below, exactly like `volume`,
  // `complexity`, etc. already are: an explicit prop gets its OWN getter,
  // entirely independent of this one.
  // `listeningAmplitude` is safe inside this bundle (unlike `bands`): it is a
  // boolean a caller sets once, not a signal driven at audio cadence, so
  // reading it through the shared getters cannot drag in a hot subscription.
  const shared = (): Omit<VariantProps, 'bands'> => ({
    state: state(),
    size: size(),
    frozen: reduced(),
    color: props.color,
    listeningAmplitude: props.listeningAmplitude,
  });

  // The three DOM variants (bar/grid/radial), including the bar fallback
  // shown while a shader chunk loads or fails, additionally get the
  // caller's render-prop. `children` is bundled here (unlike `bands`) because
  // it does not churn -- it is a callback reference a caller sets once, not a
  // signal driven by audio, so reading it cannot drag in anything that does.
  const domShared = (): Omit<VariantProps, 'bands'> => ({ ...shared(), children: props.children });

  const a11y = () =>
    props.label
      ? { role: 'img' as const, 'aria-label': props.label }
      : { 'aria-hidden': 'true' as const };

  // Fit-to-container: measured by createFitScale (see fit-scale.ts for the
  // full design rationale). At or above the natural width this contributes
  // nothing but the `max-width` clamp, so the designed px metrics render
  // exactly; below it, the inner wrapper scales the whole picture down and
  // the outer adopts the scaled height so layout follows the visual.
  const fit = createFitScale();

  return (
    <div
      class={cn('inline-flex', props.class)}
      {...a11y()}
      ref={fit.observeOuter}
      style={{
        // What lets a narrow container actually constrain this element: the
        // content is fixed-px, so without the clamp the host box would just
        // overflow (and clip at the viewport edge, the reported defect).
        'max-width': '100%',
        // While shrunk, the inner wrapper's LAYOUT box deliberately keeps its
        // natural size (that is what keeps the measurement honest above), so
        // it overhangs this box below/right of the scaled visual. `hidden`
        // clips that overhang for BOTH painting and hit-testing -- without it
        // the stale layout box covered a sibling button and ate its pointer
        // events (W5 live finding, mechanism 2). Nothing visible is clipped:
        // the scaled visual is exactly this box by construction.
        // `vertical-align: top` rides along with `overflow: hidden`, which is
        // what makes it necessary: hidden overflow moves an inline-flex box's
        // baseline to its bottom border edge, so the surrounding line box
        // grows by the font strut's descent below it and the host measures
        // ~6px taller than the box (measured in headed Chromium: 107.2 vs
        // 101.2). Top alignment opts out of baseline layout entirely. Scoped
        // to the scaled state so default (unscaled) inline placement beside
        // text keeps its original baseline behavior.
        ...(fit.scaledHeight() !== undefined
          ? { height: `${fit.scaledHeight()}px`, overflow: 'hidden', 'vertical-align': 'top' }
          : {}),
      }}
    >
      <div
        ref={fit.observeInner}
        style={{
          // THE FEEDBACK-LOOP GUARD (W5 live finding, mechanism 1). The inner
          // wrapper is a flex item of the outer, and a flex item's default
          // `align-self: stretch` makes its LAYOUT height follow the outer's
          // -- including the scaled height this component itself adopts below.
          // The ResizeObserver measuring this element for its NATURAL size
          // then reads back the adopted height, k multiplies in again, and
          // the element spirals (measured in headed Chromium: 224px -> 45.7
          // -> 0.85 -> 0.38). `flex-start` + `flex: none` pin this box to its
          // intrinsic content size in BOTH axes, so the measurement can never
          // see anything this component wrote. Unconditional: at scale 1 both
          // are visually identical to the defaults for a single item that
          // defines its container's size.
          flex: '0 0 auto',
          'align-self': 'flex-start',
          ...(fit.scale() < 1
            ? { transform: `scale(${fit.scale()})`, 'transform-origin': 'top left' }
            : {}),
        }}
      >
        <Switch
        fallback={<BarVisualizer {...domShared()} bands={bands()} barCount={props.barCount} />}
      >
        <Match when={variant() === 'grid'}>
          <GridVisualizer
            {...domShared()}
            bands={bands()}
            count={props.count}
            spread={props.spread}
            interval={props.interval}
          />
        </Match>
        <Match when={variant() === 'radial'}>
          <RadialVisualizer
            {...domShared()}
            bands={bands()}
            barCount={props.barCount}
            radius={props.radius}
          />
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
            fallback={<BarVisualizer {...domShared()} bands={bands()} barCount={props.barCount} />}
          >
            {(Comp) => {
              const C = Comp();
              return (
                <C
                  {...shared()}
                  bands={bands()}
                  volume={volume()}
                  complexity={props.complexity}
                  shader={props.shader}
                  dark={resolvedDark()}
                  animateWhenNotVisible={props.animateWhenNotVisible}
                  onUnavailable={() => setUnavailable(true)}
                />
              );
            }}
          </Show>
        </Match>
      </Switch>
      </div>
    </div>
  );
}
