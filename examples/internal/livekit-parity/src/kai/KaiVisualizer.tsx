import { createElement, useEffect, useRef } from 'react';

interface KaiVisualizerProps {
  variant: 'bar' | 'grid' | 'radial' | 'wave' | 'aura';
  state: string;
  size?: string;
  color?: string;
  /** Live audio. JS property on the element, never an attribute. */
  stream?: MediaStream;
  /** Pre-computed 0..1 levels. JS property; new array reference per update. */
  bands?: number[];
}

/**
 * Thin React shim over `<kai-audio-visualizer>`. Scalars go through as
 * attributes; `stream` and `bands` are set as JS properties in effects on the
 * ref (React 18 writes unknown JSX props on custom elements as attributes,
 * which would stringify them -- the kai- contract requires properties).
 */
export function KaiVisualizer({ variant, state, size = 'md', color, stream, bands }: KaiVisualizerProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current as (HTMLElement & { stream?: MediaStream }) | null;
    if (el) el.stream = stream;
  }, [stream]);

  useEffect(() => {
    const el = ref.current as (HTMLElement & { bands?: number[] }) | null;
    if (el) el.bands = bands;
  }, [bands]);

  return createElement('kai-audio-visualizer', {
    ref,
    variant,
    state,
    size,
    theme: 'dark',
    ...(color ? { color } : {}),
  });
}
