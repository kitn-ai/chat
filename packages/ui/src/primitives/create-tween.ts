import { createSignal, onCleanup, type Accessor } from 'solid-js';

export type Transition =
  | { duration: number; ease?: 'linear' | 'easeOut' | 'easeInOut' }
  | { type: 'spring'; duration: number; bounce: number };

const EASINGS = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
} as const;

/**
 * Damped-spring position at normalized time `t` (0..1), settling at 1.
 *
 * `bounce` maps to the damping ratio: 0 is critically damped (no overshoot),
 * higher values overshoot more. Matches the feel of motion's spring defaults
 * closely enough for shader uniforms, without the dependency.
 */
function spring(t: number, bounce: number): number {
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
 */
export function createTween(initial: number): {
  value: Accessor<number>;
  to(target: number | [number, number], transition?: Transition): void;
} {
  const [value, setValue] = createSignal(initial);
  let raf = 0;
  let disposed = false;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  onCleanup(() => {
    disposed = true;
    stop();
  });

  function to(target: number | [number, number], transition?: Transition) {
    stop();
    if (disposed) return;

    const pingPong = Array.isArray(target);
    const [a, b] = pingPong ? target : [value(), target];

    if (!transition || (!isSpring(transition) && transition.duration === 0)) {
      setValue(pingPong ? a : b);
      return;
    }

    const durationMs = transition.duration * 1000;
    if (durationMs <= 0) {
      setValue(b);
      return;
    }

    if (typeof requestAnimationFrame === 'undefined') {
      setValue(b);
      return;
    }

    const ease = isSpring(transition)
      ? (t: number) => spring(t, transition.bounce)
      : EASINGS[transition.ease ?? 'easeOut'];

    // A ping-pong starts from its first value rather than wherever it was, so
    // the pulse reads the same every time it restarts.
    let from = pingPong ? a : value();
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
        return;
      }

      // Reverse and run again, from a fresh origin for the new leg.
      setValue(to_);
      [from, to_] = [to_, from];
      legStart = performance.now();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
  }

  return { value, to };
}
