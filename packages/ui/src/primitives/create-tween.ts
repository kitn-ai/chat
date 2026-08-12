import { createSignal, onCleanup, untrack, type Accessor } from 'solid-js';

export type Transition =
  | { duration: number; ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' }
  | { type: 'spring'; duration: number; bounce: number };

/**
 * Builds an easing function from a CSS-style cubic bezier. The curve's
 * endpoints are fixed at (0, 0) and (1, 1); (x1, y1) and (x2, y2) are the
 * two control points. Given a progress value `t` used as the curve's `x`,
 * solves `X(s) === t` for the curve parameter `s` via Newton-Raphson (a
 * handful of iterations converges for these curves), falls back to
 * bisection if the derivative gets too small or a step would leave
 * [0, 1], then returns `Y(s)`.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const x = (s: number) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const y = (s: number) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  const xDerivative = (s: number) =>
    3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);

  function bisect(t: number): number {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (x(mid) < t) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let s = t;
    for (let i = 0; i < 8; i++) {
      const derivative = xDerivative(s);
      if (Math.abs(derivative) < 1e-6) return y(bisect(t));

      const next = s - (x(s) - t) / derivative;
      if (next <= 0 || next >= 1) return y(bisect(t));

      s = next;
    }
    return y(s);
  };
}

// Matches motion's named curves so the visualizers feel like their LiveKit
// counterparts rather than a plausible-looking approximation.
//
// Every easing here is TOTAL: it clamps `t` into [0, 1] itself rather than
// trusting its caller. `cubicBezier` already did (its Newton solve needs `t`
// in range to converge); `linear` was the bare identity and passed anything
// straight through. `step()` below clamps the top but not the bottom, so a
// frame timestamp EARLIER than the origin `to()` captured yields a negative
// `t` and, through an unclamped easing, a tween that runs backwards.
//
// That timestamp cannot occur in a browser -- requestAnimationFrame's
// timestamp and `performance.now()` share a time origin per spec -- so this is
// robustness, not a live bug. It does occur under vitest + jsdom, where the
// two do not share an origin. The clamp lives in the easings rather than at
// the `step()` call site so the tests can drive a negative `t` through each
// curve individually and prove which ones guard.
const EASINGS = {
  linear: (t: number) => Math.min(1, Math.max(0, t)),
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
} as const;

/**
 * Damped-spring position at normalized time `t` (0..1), settling at 1.
 *
 * `bounce` maps to the damping ratio: 0 is critically damped (no overshoot),
 * higher values overshoot more. Matches the feel of motion's spring defaults
 * closely enough for shader uniforms, without the dependency.
 *
 * `t` is clamped at 0 for the same reason the named easings are (see EASINGS),
 * and the failure here is far louder than theirs: the decay term is
 * `Math.exp(-zeta * omega * t)`, so a negative `t` makes it GROW rather than
 * decay. At t = -0.25 with bounce 0.4 this returned ~5.9 instead of something
 * in [0, ~1.3]. No top clamp: overshooting past 1 is what a spring is for.
 */
function spring(t: number, bounce: number): number {
  t = Math.max(0, t);
  const zeta = Math.max(0.05, 1 - Math.min(0.95, bounce));
  const omega = 10;
  const damped = omega * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  return (
    1 -
    Math.exp(-zeta * omega * t) *
      (Math.cos(damped * t) + ((zeta * omega) / (damped || 1)) * Math.sin(damped * t))
  );
}

function isSpring(tr: Transition): tr is { type: 'spring'; duration: number; bounce: number } {
  return 'type' in tr && tr.type === 'spring';
}

/**
 * A tweened number driven by requestAnimationFrame.
 *
 * Exists so shader uniforms can animate without pulling in a motion library.
 * CSS transitions cannot help here: uniforms are plain JS numbers handed to
 * WebGL every frame.
 *
 * `to()` interrupts whatever is in flight. An array target ping-pongs between
 * its two values forever, which is how the listening and thinking pulses read.
 * `duration: 0` (or no transition) sets instantly, which live volume needs so
 * the picture never lags the audio.
 *
 * `animating` is true exactly while a frame loop is armed: from an animated
 * `to()` until it lands (a ping-pong never lands, so it stays true), false
 * for instant sets and after dispose. It is a real signal on purpose -- the
 * aurora variant's volume-override effect reads it as its upstream-parity
 * "scale tween idle" guard, and being reactive means that effect re-runs
 * the moment a landing settles instead of waiting for the next volume tick.
 */
export function createTween(initial: number): {
  value: Accessor<number>;
  animating: Accessor<boolean>;
  to(target: number | [number, number], transition?: Transition): void;
} {
  const [value, setValue] = createSignal(initial);
  const [animating, setAnimating] = createSignal(false);
  let raf = 0;
  let disposed = false;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  onCleanup(() => {
    disposed = true;
    stop();
    setAnimating(false);
  });

  function to(target: number | [number, number], transition?: Transition) {
    stop();
    if (disposed) return;

    const pingPong = Array.isArray(target);
    // Untracked: `.to()` is an imperative command ("animate to this
    // target"), not a reactive read. Its normal caller is a createEffect
    // reacting to some OTHER signal (e.g. state changing); reading this
    // tween's own `value()` here without untrack() would make that effect
    // implicitly depend on the tween's own signal too. That is invisible
    // for a single tween (it would just restart itself every frame and
    // still crawl toward the target) but is fatal the moment a caller
    // creates a SECOND tween and `.to()`'s both from the same effect (see
    // the wave shader variant, which does exactly this for amplitude and
    // frequency): a browser fires one frame's queued
    // requestAnimationFrame callbacks in the order they were registered, so
    // the FIRST tween's step -- which runs first, and whose `setValue`
    // synchronously re-triggers the (now-dependent) effect -- cancels the
    // SECOND tween's already-queued step before the browser ever reaches
    // it. That repeats identically every single frame, so the second
    // tween's `step` never fires even once and its value never leaves its
    // initial one, permanently, no matter how long the effect keeps
    // "restarting" it.
    const [a, b] = pingPong ? target : [untrack(value), target];

    if (!transition || (!isSpring(transition) && transition.duration === 0)) {
      setAnimating(false);
      setValue(pingPong ? a : b);
      return;
    }

    const durationMs = transition.duration * 1000;
    if (durationMs <= 0) {
      setAnimating(false);
      setValue(b);
      return;
    }

    if (typeof requestAnimationFrame === 'undefined') {
      setAnimating(false);
      setValue(b);
      return;
    }

    const ease = isSpring(transition)
      ? (t: number) => spring(t, transition.bounce)
      : EASINGS[transition.ease ?? 'easeOut'];

    // A ping-pong starts from its first value rather than wherever it was, so
    // the pulse reads the same every time it restarts. `a` is already an
    // untracked read of the current value (or the ping-pong's first target
    // value) from above -- reused here instead of reading `value()` again.
    let from = a;
    let to_ = b;
    if (pingPong) setValue(a);

    // requestAnimationFrame's timestamp and performance.now() share a time
    // origin per spec, so capturing the origin here, at the moment to() is
    // called, is directly comparable to the `now` a later frame reports.
    // That means elapsed time is measured from when this leg actually
    // started, correct on the very first frame with no lazy-capture dance
    // and no risk of an idle gap since the last tween being charged against
    // this one.
    let legStart = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - legStart) / durationMs);
      setValue(from + (to_ - from) * ease(t));

      if (t < 1) {
        raf = requestAnimationFrame(step);
        return;
      }

      if (!pingPong) {
        setValue(to_);
        raf = 0;
        setAnimating(false);
        return;
      }

      // Reverse and run again, from a fresh origin for the new leg.
      setValue(to_);
      [from, to_] = [to_, from];
      legStart = performance.now();
      raf = requestAnimationFrame(step);
    };

    setAnimating(true);
    raf = requestAnimationFrame(step);
  }

  return { value, animating, to };
}
