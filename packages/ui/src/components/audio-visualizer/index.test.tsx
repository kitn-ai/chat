import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, createEffect, flush } from 'solid-js';
import { render, cleanup, waitFor } from '@solidjs/testing-library';
import { AudioVisualizer } from './index';
import * as UseAudioAnalysisModule from '../../primitives/use-audio-analysis';

afterEach(cleanup);

// Set whenever something asks a canvas for a drawing context during a test.
// Only a REAL shader variant does that (via ShaderCanvas); every mocked
// variant in this file returns null and touches no canvas. It is recorded as
// a flag rather than probed from the DOM afterwards because the evidence does
// not survive: a real shader that mounts in jsdom finds no WebGL, calls
// `onUnavailable`, and the dispatcher swaps it back to bars -- which removes
// the canvas again. Checking `container.querySelector('canvas')` after the
// fact therefore reports false in BOTH the cases below, which is precisely
// how the two got confused in the first place.
let sawRealShaderMount = false;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  sawRealShaderMount = false;
  // Returning null matches what jsdom effectively answers here anyway (it has
  // no canvas backend), so this changes no behaviour -- ShaderCanvas takes the
  // same no-WebGL path either way. It just makes the attempt observable, and
  // as a side effect silences jsdom's "Not implemented: getContext" noise.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    sawRealShaderMount = true;
    return null;
  });
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Runs a shader-mount wait and, if it gives up, says WHY.
 *
 * `waitFor` rethrows its LAST assertion error on timeout, never anything that
 * mentions time (dom-testing-library's `handleTimeout`), and it times out on
 * its own `asyncUtilTimeout` of 1000ms, which is independent of vitest's
 * `testTimeout`. So the two quite different ways these waits fail -- the
 * mocked chunk not resolving inside that budget, and `vi.doMock` not applying
 * at all so the REAL variant mounted instead -- both print an identical
 * `expected false to be true` that points at a component which may be
 * perfectly fine.
 *
 * That ambiguity has already cost one investigation. The failure is rare (one
 * occurrence in 34 full-suite runs) so it cannot be cornered by re-running,
 * and neither the message nor the stack said which case it was.
 * `sawRealShaderMount` separates them: true means the real variant mounted and
 * asked for a GL context, so the mock did not apply; false means the mocked
 * module simply never arrived in time. Recording that one bit makes the next
 * occurrence decisive instead of another hunt.
 *
 * This only changes what a FAILING wait reports. A passing one is untouched.
 */
async function reportingMountFailure(
  what: string,
  container: HTMLElement,
  wait: () => Promise<unknown>,
): Promise<void> {
  try {
    await wait();
  } catch (err) {
    throw new Error(
      `${what} never mounted. Real shader mounted instead (mock did not apply): ` +
        `${sawRealShaderMount}; bars rendered: ` +
        `${container.querySelectorAll('[part~="bar"]').length}`,
      { cause: err },
    );
  }
}

describe('AudioVisualizer dispatch', () => {
  it('renders bars by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
  });

  it('renders cells for the grid variant', () => {
    const { container } = render(() => <AudioVisualizer variant="grid" />);
    expect(container.querySelectorAll('[part~="cell"]').length).toBe(25);
  });

  it('renders spokes for the radial variant', () => {
    const { container } = render(() => <AudioVisualizer variant="radial" />);
    expect(container.querySelectorAll('[data-kai-spoke]').length).toBe(24);
  });

  it('falls back to bars for an unknown variant', () => {
    const { container } = render(() => <AudioVisualizer variant={'nonsense' as never} />);
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
  });

  it('normalizes a LiveKit state alias onto ours', () => {
    const { container } = render(() => <AudioVisualizer state={'initializing' as never} />);
    expect(container.querySelector('[data-kai-state="connecting"]')).toBeTruthy();
  });

  it('passes caller-supplied bands straight through without touching Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const { container } = render(() => (
      <AudioVisualizer variant="bar" state="speaking" barCount={3} bands={[0.2, 0.4, 0.6]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part~="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['20%', '40%', '60%']);
  });

  it('is decorative by default', () => {
    const { container } = render(() => <AudioVisualizer />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
  });

  it('becomes an labelled image when a label is given', () => {
    const { container } = render(() => <AudioVisualizer label="Assistant audio" />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Assistant audio');
    expect(host.getAttribute('aria-hidden')).toBeNull();
  });

  it('renders a bar fallback while a shader variant loads', () => {
    // "aura" is the LiveKit-compatibility alias for "aurora" -- runtime-only,
    // not a member of the VisualizerVariant type, hence the cast.
    const { container } = render(() => <AudioVisualizer variant={'aura' as never} />);
    // The dynamic import has not resolved on the first synchronous frame.
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
  });

  it('freezes the sequence when the user prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(() => <AudioVisualizer variant="radial" state="thinking" />);
    await waitFor(() => {
      const host = container.querySelector('[data-kai-state="thinking"]') as HTMLElement;
      expect(host.className).not.toContain('animate-spin');
    });
  });
});

// The brief's behaviors call out "warn once on failure, do not throw" for a
// shader chunk that fails to load, but the prescribed test list above never
// exercises it. `vi.doMock` makes the dynamic `import('./variant-wave')`
// reject instead of resolve, so this proves the fallback stays on bars
// permanently -- not just before resolution settles -- and that the failure
// is reported once via console.warn rather than thrown.
describe('AudioVisualizer shader load failure', () => {
  // In an afterEach, not at the end of the test body: if an earlier
  // assertion in the test throws, a cleanup step sitting after it never
  // runs, and the mock leaks into whatever test happens to run next.
  afterEach(() => {
    vi.doUnmock('./variant-wave');
    vi.restoreAllMocks();
  });

  it('falls back to bars permanently and warns once when the shader chunk fails to load', async () => {
    vi.doMock('./variant-wave', () => {
      throw new Error('chunk failed');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(() => <AudioVisualizer variant="wave" />);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0]?.[0]).toContain('variant="wave"');
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
  });
});

// A shader chunk can load fine and still be unable to render -- most notably
// no WebGL, which only a MOUNTED component can discover (it is the one
// calling `canvas.getContext('webgl')`). `Shader()` alone can't distinguish
// that from a working component, so a mounted shader reports it via calling
// `onUnavailable`, and the dispatcher must fall back to bars permanently, the
// same as a failed import -- not just on the first render after the call, but
// across later reactive updates too, and reset on switching variants.
describe('AudioVisualizer shader reports itself unavailable', () => {
  afterEach(() => {
    vi.doUnmock('./variant-wave');
    vi.doUnmock('./variant-aurora');
  });

  it('falls back to bars permanently once a mounted shader calls onUnavailable, even across an unrelated rerender', async () => {
    let waveMounted = false;
    vi.doMock('./variant-wave', () => ({
      default: (props: { onUnavailable: () => void }) => {
        waveMounted = true;
        // V2-SHAPE: a synchronous body-time signal write is rejected by v2's
        // owned-scope guard (the real variants report from effects); defer the
        // report one microtask, as an effect would.
        queueMicrotask(() => props.onUnavailable());
        return null;
      },
    }));

    const [cls, setCls] = createSignal('a');
    const { container } = render(() => <AudioVisualizer variant="wave" class={cls()} />);

    // Bars already show on the very first synchronous frame, before the chunk
    // has even resolved -- that is the ORDINARY "still loading" fallback, not
    // proof `onUnavailable` did anything. Wait for the mocked shader to
    // actually mount (and therefore have already called `onUnavailable`)
    // before checking that bars are STILL what's showing, or this assertion
    // would pass trivially regardless of whether the fix exists.
    await reportingMountFailure('the mocked wave variant', container, () =>
      waitFor(() => expect(waveMounted).toBe(true)),
    );
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);

    // Not a flicker: an unrelated prop change must not retry the shader (it
    // would, if the fallback depended on some transient "still loading" state
    // rather than a permanent flag).
    setCls('b');
    flush(); // V2-FLUSH: commit the staged write
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
  });

  it('switching to a different shader variant after a failure attempts the new one rather than staying failed', async () => {
    let waveMounted = false;
    vi.doMock('./variant-wave', () => ({
      default: (props: { onUnavailable: () => void }) => {
        waveMounted = true;
        // V2-SHAPE: a synchronous body-time signal write is rejected by v2's
        // owned-scope guard (the real variants report from effects); defer the
        // report one microtask, as an effect would.
        queueMicrotask(() => props.onUnavailable());
        return null;
      },
    }));
    let auroraMounted = false;
    vi.doMock('./variant-aurora', () => ({
      default: () => {
        auroraMounted = true;
        return null;
      },
    }));

    const [variant, setVariant] = createSignal<'wave' | 'aurora'>('wave');
    const { container } = render(() => <AudioVisualizer variant={variant()} />);

    // Establish that wave really did mount and report itself unavailable
    // before switching, so the next assertion is proof of a RESET, not just
    // aurora happening to succeed on its own.
    await reportingMountFailure('the mocked wave variant', container, () =>
      waitFor(() => expect(waveMounted).toBe(true)),
    );

    setVariant('aurora');
    await Promise.resolve(); // V2-SHAPE: let the staged write commit naturally
    flush(); // V2-FLUSH

    // If `unavailable` were not reset on a variant change, the dispatcher's
    // `<Show>` gate would stay permanently closed and aurora's component
    // would never actually be instantiated here, regardless of its own chunk
    // loading fine -- this would time out rather than fail fast.
    await reportingMountFailure('the mocked aurora variant', container, () =>
      waitFor(() => expect(auroraMounted).toBe(true)),
    );
  });
});

// The shader variants drive their entire reactivity from `volume`, a scalar
// -- never from `bands` directly (aurora folds it into ring radius, wave
// into amplitude and frequency). `source()` correctly returns undefined
// whenever caller-supplied `bands` is set (that's what keeps the bands path
// free of an AudioContext), but nothing computed `volume` FROM that array:
// `analysis.volume()` just sat at its initial 0 forever, so a shader fed
// `bands` looked static with no error and no clue why, even though the three
// DOM variants next to it animated correctly from the very same prop.
describe('AudioVisualizer volume from caller-supplied bands', () => {
  afterEach(() => {
    vi.doUnmock('./variant-wave');
    vi.restoreAllMocks();
  });

  it('derives a non-zero volume from bands with no source, and tracks a bands change', async () => {
    let captured: { volume: number } | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: { volume: number }) => {
        // Capture the PROPS OBJECT reference, not a copy of its current
        // value: Solid compiles `volume={volume()}` into a live getter on
        // this component's props, so reading `captured.volume` again later
        // re-evaluates the dispatcher's accessor fresh off the current
        // `bands` signal. Copying the number out now (`{ volume: props.volume }`)
        // would freeze it at this instant instead, the same footgun as
        // capturing a resolved value instead of an accessor in the
        // band-count-reactivity tests above.
        captured = props;
        return null;
      },
    }));

    const [bands, setBands] = createSignal([0.2, 0.4, 0.6]);
    render(() => <AudioVisualizer variant="wave" bands={bands()} />);

    await waitFor(() => expect(captured).toBeDefined());
    const first = captured!.volume;
    expect(first).toBeGreaterThan(0);

    setBands([0.9, 0.9, 0.9]);
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(captured!.volume).not.toBe(first));
    expect(captured!.volume).toBeGreaterThan(0);
  });

  it('gives volume 0 for an all-zero bands array', async () => {
    let captured: { volume: number } | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: { volume: number }) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave" bands={[0, 0, 0]} />);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.volume).toBe(0);
  });

  it('uses the analyser volume unchanged when a real source is given and bands is not', async () => {
    // A regression guard for the live-audio path: this change must not touch
    // what a shader sees when there IS a real source.
    vi.spyOn(UseAudioAnalysisModule, 'useAudioAnalysis').mockReturnValue({
      bands: () => [],
      volume: () => 0.42,
    });

    let captured: { volume: number } | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: { volume: number }) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave" stream={{} as MediaStream} />);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.volume).toBe(0.42);
  });

  it('constructs no AudioContext when bands is supplied, even alongside a real stream and for a shader variant', async () => {
    // A REAL `stream` prop this time, alongside `bands` -- the previous
    // version of this test passed neither `stream` nor `audioElement`, so
    // `source()` (`props.bands ? undefined : props.stream ?? props.audioElement`)
    // returned `undefined` whether or not the `bands ? undefined : ...`
    // short-circuit existed at all: with no stream to fall through to
    // either, deleting the short-circuit would ALSO have left `source()`
    // returning `undefined`, so the assertion below could not tell the two
    // apart. A stream present is what makes it discriminating: if the
    // short-circuit were removed, `source()` would return the stream
    // (truthy) instead, and `useAudioAnalysis`'s effect would reach
    // `getContext()` and call `new AudioContext()` -- exactly what this
    // spy would catch.
    //
    // A spy constructor, not `undefined` like the Round-1 DOM-variant test:
    // this needs to prove the constructor is never CALLED, not merely that
    // the component tolerates it being absent (getContext() already handles
    // a missing AudioContext gracefully either way, so "renders without
    // throwing" alone would not distinguish the two).
    const AudioContextSpy = vi.fn();
    vi.stubGlobal('AudioContext', AudioContextSpy);

    let mounted = false;
    vi.doMock('./variant-wave', () => ({
      default: () => {
        mounted = true;
        return null;
      },
    }));

    const { container } = render(() => (
      <AudioVisualizer variant="wave" bands={[0.1, 0.2, 0.3]} stream={{} as MediaStream} />
    ));

    await reportingMountFailure('the mocked wave variant', container, () =>
      waitFor(() => expect(mounted).toBe(true)),
    );
    expect(AudioContextSpy).not.toHaveBeenCalled();
  });
});

// `<kai-audio-visualizer theme="light">` on a dark OS must render the
// aurora's LIGHT pipeline, but nothing supplied `props.theme` to the
// dispatcher's resolution, so it fell back to sniffing `prefers-color-scheme`
// locally and an explicit `theme` attribute was silently ignored. These
// mount a real system-prefers-dark media query and prove an explicit
// `theme="light"` still wins, and that `theme="auto"` correctly follows it,
// all the way through to the boolean a shader variant actually receives.
describe('AudioVisualizer theme resolution for shader variants', () => {
  afterEach(() => vi.doUnmock('./variant-wave'));

  it('an explicit theme="light" wins over a dark media query, through to what the shader receives', async () => {
    // Overrides the file-level beforeEach's matchMedia stub (always
    // `matches: false`) for just this test: the system prefers dark.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('dark'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    let captured: { dark: boolean } | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: { dark: boolean }) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave" theme="light" />);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.dark).toBe(false);
  });

  it('theme="auto" follows the media query', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('dark'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    let captured: { dark: boolean } | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: { dark: boolean }) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave" theme="auto" />);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.dark).toBe(true);
  });
});

// Nothing above exercises a prop change after mount, which is exactly how the
// band-count-reactivity bug (index.tsx calling `bandCount()` once instead of
// passing the accessor) went unnoticed: `useAudioAnalysis` is Solid setup
// code, called exactly once per component instance, so the only way to prove
// the COUNT stays live is to capture the accessor it was actually given and
// call it again after a post-mount prop change -- a DOM-level assertion can't
// distinguish this, since every variant re-pads/truncates whatever `bands()`
// array it receives to its own count regardless of the array's real length.
describe('AudioVisualizer band count reactivity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-requests the analyser bucket count when barCount changes post-mount', async () => {
    const spy = vi
      .spyOn(UseAudioAnalysisModule, 'useAudioAnalysis')
      .mockReturnValue({ bands: () => [], volume: () => 0 });

    const [barCount, setBarCount] = createSignal(3);
    render(() => (
      <AudioVisualizer variant="bar" stream={{} as MediaStream} barCount={barCount()} />
    ));

    // Solid components run their setup function once, so useAudioAnalysis
    // must be called exactly once for this instance -- if a future change
    // regressed to calling it per-render, this would catch that too.
    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0]?.[1] as { bands: () => number };
    // ceil(n/2), not n: only half the elements' worth of bands is requested
    // from the analyser -- the dispatcher mirrors them back out to the full
    // barCount centre-out (see mirrorBandsCenterOut in audio-bands.ts).
    // barCount 3 -> ceil(3/2) = 2.
    expect(options.bands()).toBe(2);

    setBarCount(7);
    flush(); // V2-FLUSH: commit the staged write
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    // Same accessor, called again: it must reflect the NEW prop, not a
    // mount-time snapshot. Before the fix this field was a plain number (3),
    // so calling it here would have thrown "options.bands is not a function"
    // -- itself proof the old shape was broken, not just stale.
    // barCount 7 -> ceil(7/2) = 4.
    expect(options.bands()).toBe(4);
  });
});

// The dispatcher declared `children` on AudioVisualizerProps but never
// forwarded it, so the render-prop each DOM variant supports had no public
// path to it -- dead code from a consumer's perspective. These prove it
// actually reaches each variant (not just that the dispatcher still renders),
// that it works whether passed as nested JSX or an explicit prop, and that
// the shader path is deliberately excluded rather than incidentally so.
describe('AudioVisualizer children render-prop', () => {
  const renderItem = (item: { index: number }) => <span data-custom={item.index} />;

  // In an afterEach, not at the end of the shader test's body: if an earlier
  // assertion there throws, a cleanup step after it never runs and the mock
  // leaks into whatever test happens to run next (same lesson as the
  // shader-load-failure describe above).
  afterEach(() => vi.doUnmock('./variant-wave'));

  it('forwards children to the bar variant, replacing its default markup', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="bar">{renderItem}</AudioVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(0);
  });

  it('forwards children to the grid variant, replacing its default markup', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="grid">{renderItem}</AudioVisualizer>
    ));
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(25);
    expect(container.querySelectorAll('[part~="cell"]')).toHaveLength(0);
  });

  it('forwards children to the radial variant, rendered inside each spoke', () => {
    const { container } = render(() => (
      <AudioVisualizer variant="radial">{renderItem}</AudioVisualizer>
    ));
    // The spoke wrapper stays (radial positions it via CSS transform); only
    // the markup INSIDE it is replaced, unlike bar/grid which swap the node
    // itself.
    expect(container.querySelectorAll('[data-kai-spoke]')).toHaveLength(24);
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(24);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(0);
  });

  it('also works passed as an explicit prop rather than nested JSX', () => {
    const { container } = render(() => <AudioVisualizer variant="bar" children={renderItem} />);
    expect(container.querySelectorAll('[data-custom]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[part~="bar"]')).toHaveLength(0);
  });

  it('does not throw and renders the default markup when no children are given', () => {
    // Guards against Solid ever handing `props.children` a non-nullish,
    // non-function default (e.g. an empty string): every variant calls it as
    // `props.children?.(item)`, which only short-circuits on null/undefined
    // -- a falsy-but-defined value would throw "is not a function" here.
    const { container } = render(() => <AudioVisualizer variant="bar" />);
    expect(container.querySelectorAll('[part~="bar"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-custom]')).toHaveLength(0);
  });

  it('does not forward children to a shader variant', async () => {
    let captured: Record<string, unknown> | undefined;
    vi.doMock('./variant-wave', () => ({
      default: (props: Record<string, unknown>) => {
        captured = props;
        return null;
      },
    }));

    render(() => <AudioVisualizer variant="wave">{renderItem}</AudioVisualizer>);

    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.children).toBeUndefined();
  });
});

// Two real bugs (use-sequencer.ts and shader-canvas.tsx) traced to the same
// root cause: `shared()` bundled `bands` in with `state`/`size`/`frozen`/
// `color`, and Solid's component-spread compiles to per-key getters that ALL
// call the SAME source function -- so reading any one of those static-ish
// keys re-invoked `shared()` in full and transitively subscribed the reader
// to `bands()`, which updates ~31 times a second with live or synthetic
// audio. Both prior bugs were caught by user-visible symptoms in a browser,
// not by a unit test, because every existing test builds props by hand and
// never reproduces the spread-getter chain a real dispatcher render does.
describe('AudioVisualizer bands leak: state/frozen reads must not re-run an unrelated effect', () => {
  afterEach(() => vi.doUnmock('./variant-wave'));

  it('a rapidly-changing bands signal does not re-run an effect that only reads state/frozen', async () => {
    // A faithful probe, not a synthetic stand-in: this is the EXACT shape of
    // the effect already live in variant-wave.tsx/variant-aurora.tsx/
    // variant-custom.tsx's own first createEffect (reads state/frozen only,
    // calls a tween's .to(), no local memo) -- the genuinely UNPROTECTED
    // instance this audit found. `use-sequencer.ts` and `shader-canvas.tsx`
    // already carry their own downstream memo (kept, per instructions), so
    // driving the test through THOSE would prove nothing: they would absorb
    // the leak regardless of whether the fix here exists. The shader path
    // has no such absorber, so it is what actually exercises the fix.
    let runs = 0;
    vi.doMock('./variant-wave', () => ({
      // Closes over `createEffect` (imported at the top of this file) and
      // `runs` from the outer test scope -- vi.doMock's factory is not
      // hoisted, so, unlike vi.mock, referencing outer-scope bindings here
      // is fine (the same pattern already used for `captured` elsewhere in
      // this file).
      default: (props: { state: string; frozen: boolean }) => {
        // V2-PORT: two-argument effect; the tracked reads + counter are the compute.
        createEffect(() => {
          void props.state;
          void props.frozen;
          runs++;
        }, () => {});
        return null;
      },
    }));

    const [bands, setBands] = createSignal([0.1]);
    render(() => <AudioVisualizer variant="wave" state="listening" bands={bands()} />);

    await waitFor(() => expect(runs).toBeGreaterThan(0));
    const afterMount = runs;

    // 20 audio-rate updates, well faster than anything state/frozen-driven
    // should ever fire at. Before the fix, each one would transitively read
    // `bands()` through the state/frozen getters and rerun this effect;
    // after it, `state`/`frozen` genuinely have not changed, so it must not
    // rerun at all.
    for (let i = 0; i < 20; i++) setBands([Math.random(), Math.random()]);
    await Promise.resolve();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(runs).toBe(afterMount);
  });
});

describe('AudioVisualizer relays listeningAmplitude to the variants', () => {
  // The per-variant gate itself is pinned in each variant's own test file;
  // this pins the DISPATCHER wiring: `listeningAmplitude` must travel through
  // `shared()` to what a variant actually receives, or the element facade's
  // new prop would be connected to nothing.
  it('caller-supplied bands drive bar heights while listening once listeningAmplitude is set', () => {
    const { container } = render(() => (
      <AudioVisualizer state="listening" barCount={2} bands={[0.25, 0.75]} listeningAmplitude />
    ));
    const heights = Array.from(container.querySelectorAll('[part~="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['25%', '75%']);
  });

  it('leaves listening scripted without the prop (the default is byte-identical)', () => {
    const { container } = render(() => (
      <AudioVisualizer state="listening" barCount={2} bands={[0.25, 0.75]} />
    ));
    const heights = Array.from(container.querySelectorAll('[part~="bar"]')).map(
      (b) => (b as HTMLElement).style.height,
    );
    expect(heights).toEqual(['0%', '0%']);
  });
});
