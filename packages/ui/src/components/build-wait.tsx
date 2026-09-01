import { type JSX, For, Show, createSignal, createMemo, onCleanup } from 'solid-js';
import { Check, CircleAlert } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Notice } from '../ui/notice';
import {
  BLUEPRINT_BG,
  STROKE,
  LINE,
  BORDER,
  ACCENT,
  ACCENT_FILL,
  type BuilderCardTemplateId,
} from './builder-start';

// ─────────────────────────────────────────────────────────────────────────────
// `BuildWait` — what the builder shows while a construct's preview boots.
//
// The screen it replaces was one line of small text ("Starting the preview —
// installing dependencies…"). The owner's brief: something that depicts
// BUILDING, non-interactive — explicitly not a game, because a game turns a
// wait into something to watch rather than something to get through.
//
// So: the chosen template's OWN blueprint draws itself into existence, and the
// real boot phases report underneath it. The animation is the mood; the steps
// are the truth. Nothing here fakes progress — the drawing's timing is fixed
// and says nothing about how far along the boot is, and every claim about the
// boot comes from `steps`/`current`/`error`, which the caller owns.
//
// THE 3-SECOND vs 3-MINUTE PROBLEM (a first run installing dependencies is
// minutes; a warm one is seconds), and why it is solved this way:
//
//   The draw-on finishes in about two and a half seconds, then the blueprint
//   HOLDS, fully drawn, with one slow breathing accent on the single shape
//   that is the kit's own chat surface in that drawing. That accent is the
//   only thing still moving after the draw.
//
//   The alternative — looping the draw — was rejected on meaning, not taste:
//   a blueprint that erases itself and starts over reads as "that restarted",
//   which at minute three is the exact wrong message about a process that is
//   in fact still going fine. A held, finished drawing with a heartbeat reads
//   as "the drawing is done, the machine is still working", which is true.
//   The same heartbeat runs on the active step's dot, so the two halves of the
//   screen are visibly on the same clock, and the steps are what actually
//   changes over a long wait. At three seconds you see a thing being built; at
//   three minutes you see a finished plan and a list that is still moving.
//
// REPRODUCED, NOT IMPORTED. The illustrations in `builder-start.tsx` are the
// visual language this uses, and this file does NOT re-invent it — `STROKE`,
// `LINE`, `BORDER`, `ACCENT`, `ACCENT_FILL` and `BLUEPRINT_BG` are imported
// from there, so the stroke weight and the four inks cannot drift. But the six
// illustration COMPONENTS are module-private there and take no props, and a
// draw-on needs per-shape control (a path length, a build group, a delay), so
// the six drawings are restated here as SHAPE DATA with the same coordinates.
// That is a real copy and it is registered as one: if a drawing changes in
// `builder-start.tsx`, the copy here has to change with it. It could not be
// avoided from this file — the illustrations are not exported and
// `builder-start.tsx` was off-limits this round.
//
// STYLED VIA INLINE STYLE, NOT UTILITY CLASSES, for every shape — the same
// constraint `builder-start.tsx` records at its own illustrations: stroke/fill
// utilities appear nowhere else in the tree, so they are not in the checked-in
// compiled sheet and unstyled SVG falls back to solid black. Arbitrary-value
// utilities are avoided everywhere in this file for the reason `captions.tsx`
// records: their JIT emission has been non-deterministic in this repo, so
// anything load-bearing is an inline token style.
// ─────────────────────────────────────────────────────────────────────────────

/** The boot phases the builder actually goes through, in order. Exported so a
 *  caller (and the tests) use this list rather than retyping it. */
export const BUILD_WAIT_STEPS: readonly BuildWaitStep[] = [
  { id: 'install', label: 'Installing dependencies' },
  { id: 'generate', label: 'Generating the app' },
  { id: 'preview', label: 'Starting the preview' },
];

export interface BuildWaitStep {
  /** Stable id — what `current` names. */
  id: string;
  /** What the person reads. */
  label: string;
}

export type BuildWaitStepStatus = 'done' | 'active' | 'pending' | 'failed';

export interface BuildWaitProps {
  /** Which template's blueprint draws. Every registry template has one. */
  templateId: BuilderCardTemplateId;
  /** The phases to report. Defaults to `BUILD_WAIT_STEPS`. */
  steps?: readonly BuildWaitStep[];
  /** The id of the phase in flight. Unknown or unset means the first one. */
  current?: string;
  /** A boot failure. Present means: stop, say so, and mark the current phase
   *  failed — the drawing holds finished and stops breathing rather than
   *  animating forever over a build that is not happening. */
  error?: string;
  /**
   * Force the reduced-motion rendering (finished blueprint, no animation).
   * Unset follows `prefers-reduced-motion`. This exists so a story can SHOW
   * that rendering without changing the reviewer's OS setting; it is not the
   * mechanism that honors the preference, which is both the media query read
   * below and a media rule in the stylesheet, either of which is sufficient.
   */
  reduceMotion?: boolean;
  class?: string;
}

// ── The blueprints ───────────────────────────────────────────────────────────

/** Build order, and the rule behind it, applied identically to all six:
 *  the outer chrome first, then the muted structural companion beside it,
 *  then the accented surface that IS this kit, then everything the surfaces
 *  contain. Frame, rail, surface, details. */
const BUILD_ORDER = ['frame', 'rail', 'surface', 'detail'] as const;
type BlueprintGroup = (typeof BUILD_ORDER)[number];

/** One of the four inks from `builder-start.tsx`. A shape is FILLED when its
 *  ink has a fill — filled shapes have no outline to draw, so they pop in
 *  instead of drawing on. */
type Ink = typeof LINE;

interface ShapeBase {
  group: BlueprintGroup;
  ink: Ink;
  /** The one shape per drawing that keeps breathing after the draw settles —
   *  always the shape that is this kit's own surface in that template. */
  hero?: boolean;
}

export type BlueprintShape =
  | (ShapeBase & { kind: 'rect'; x: number; y: number; w: number; h: number; r: number })
  | (ShapeBase & { kind: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (ShapeBase & { kind: 'circle'; cx: number; cy: number; r: number });

const rect = (
  group: BlueprintGroup,
  ink: Ink,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  hero?: boolean,
): BlueprintShape => ({ kind: 'rect', group, ink, x, y, w, h, r, hero });

const line = (
  group: BlueprintGroup,
  ink: Ink,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): BlueprintShape => ({ kind: 'line', group, ink, x1, y1, x2, y2 });

const circle = (
  group: BlueprintGroup,
  ink: Ink,
  cx: number,
  cy: number,
  r: number,
  hero?: boolean,
): BlueprintShape => ({ kind: 'circle', group, ink, cx, cy, r, hero });

/** Voice's waveform, from the same bar heights and the same alternating ink
 *  rule the original drawing uses — derived here rather than nine literals,
 *  which is also what makes the bars stagger left to right for free. */
const VOICE_BARS = [18, 32, 46, 60, 40, 54, 24, 44, 30];

/** The six drawings, coordinate-for-coordinate from `TEMPLATE_ILLUSTRATIONS`
 *  in `builder-start.tsx`, regrouped into build order. Same 160×100 viewBox. */
export const BLUEPRINTS: Record<BuilderCardTemplateId, readonly BlueprintShape[]> = {
  widget: [
    rect('frame', BORDER, 4, 4, 152, 92, 6),
    line('rail', LINE, 16, 20, 88, 20),
    line('rail', LINE, 16, 30, 64, 30),
    rect('surface', ACCENT, 92, 30, 56, 48, 6, true),
    line('detail', ACCENT, 100, 40, 130, 40),
    line('detail', LINE, 100, 48, 118, 48),
    circle('detail', ACCENT_FILL, 138, 88, 7),
  ],
  inAppAssistant: [
    rect('frame', BORDER, 4, 4, 152, 92, 6),
    line('rail', LINE, 16, 18, 80, 18),
    line('rail', LINE, 16, 28, 60, 28),
    rect('rail', LINE, 16, 42, 52, 38, 4),
    rect('surface', ACCENT, 112, 4, 44, 92, 6, true),
    line('detail', LINE, 120, 18, 146, 18),
    line('detail', ACCENT, 120, 28, 138, 28),
    line('detail', LINE, 120, 38, 142, 38),
    rect('detail', BORDER, 120, 70, 28, 8, 4),
    rect('detail', ACCENT_FILL, 102, 44, 10, 16, 3),
  ],
  assistant: [
    rect('frame', BORDER, 4, 4, 152, 92, 6),
    line('rail', BORDER, 42, 4, 42, 96),
    line('rail', LINE, 14, 20, 34, 20),
    line('rail', LINE, 14, 30, 34, 30),
    line('rail', LINE, 14, 40, 34, 40),
    rect('surface', ACCENT, 54, 16, 92, 60, 6, true),
    line('detail', LINE, 64, 28, 100, 28),
    line('detail', ACCENT, 64, 38, 112, 38),
    line('detail', LINE, 64, 48, 94, 48),
    rect('detail', BORDER, 64, 60, 72, 8, 4),
  ],
  research: [
    rect('frame', BORDER, 4, 4, 152, 92, 6),
    rect('rail', BORDER, 118, 34, 26, 52, 6),
    line('rail', LINE, 124, 42, 138, 42),
    line('rail', LINE, 124, 50, 138, 50),
    line('rail', LINE, 124, 58, 138, 58),
    // prompt-first: the prompt bar sits at the TOP, and it goes down with the
    // answer column as one surface step — they are the same surface.
    rect('surface', ACCENT, 16, 14, 128, 12, 6),
    rect('surface', ACCENT, 16, 34, 94, 52, 6, true),
    line('detail', LINE, 24, 44, 92, 44),
    line('detail', LINE, 24, 52, 80, 52),
    line('detail', LINE, 24, 60, 88, 60),
  ],
  workspace: [
    rect('frame', BORDER, 4, 4, 152, 92, 6),
    rect('rail', BORDER, 64, 12, 84, 76, 6),
    rect('surface', ACCENT, 12, 12, 44, 76, 6, true),
    line('detail', LINE, 20, 24, 48, 24),
    line('detail', ACCENT, 20, 32, 40, 32),
    line('detail', LINE, 20, 40, 44, 40),
    line('detail', LINE, 74, 24, 120, 24),
    line('detail', LINE, 74, 34, 138, 34),
    rect('detail', LINE, 74, 46, 30, 30, 4),
    rect('detail', LINE, 110, 46, 30, 30, 4),
  ],
  // Voice keeps the original's deliberate departure: no page outline at all.
  // The push-to-talk ring is the anchor that lands first, the waveform is the
  // surface, and the ring is the hero — a breathing microphone is the right
  // resting state for a voice build.
  voice: [
    circle('frame', ACCENT, 80, 82, 12, true),
    ...VOICE_BARS.map((h, i) =>
      rect('surface', i % 3 === 1 ? LINE : ACCENT_FILL, 20 + i * 14, 42 - h / 2, 6, h, 3),
    ),
    circle('detail', ACCENT_FILL, 80, 82, 4),
  ],
};

/** Exact outline length, so a dash offset animation reveals the shape at an
 *  even rate and lands exactly closed. Over-estimating would give the shape a
 *  dead lead-in; under-estimating would leave it permanently unfinished. */
export function drawLength(shape: BlueprintShape): number {
  if (shape.kind === 'line') return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
  if (shape.kind === 'circle') return 2 * Math.PI * shape.r;
  const r = Math.min(shape.r, shape.w / 2, shape.h / 2);
  return 2 * (shape.w - 2 * r) + 2 * (shape.h - 2 * r) + 2 * Math.PI * r;
}

const isFilled = (ink: Ink): boolean => ink.fill !== 'none';

// Timings. One shape draws in DRAW_MS; a group starts GROUP_MS after the one
// before it, and shapes inside a group are offset by WITHIN_MS each so a group
// arrives as a run rather than all at once. A group with more shapes than that
// gap can hold pushes the next group out, so a long detail run never starts
// before the run before it has finished arriving.
const DRAW_MS = 620;
const GROUP_MS = 420;
const WITHIN_MS = 70;
const BREATHE_MS = 5200;
/** The pause between a shape landing and the hero taking up its heartbeat. */
const SETTLE_MS = 400;

/** Delay per shape, index-aligned with the blueprint. Groups that a drawing
 *  does not use (Voice has no rail) cost nothing — the cursor only advances
 *  for groups that actually have shapes, so an unused group is not dead air. */
export function drawDelays(shapes: readonly BlueprintShape[]): number[] {
  const delays = new Array<number>(shapes.length).fill(0);
  let cursor = 0;
  for (const group of BUILD_ORDER) {
    const members = shapes.map((s, i) => [s, i] as const).filter(([s]) => s.group === group);
    if (members.length === 0) continue;
    members.forEach(([, index], within) => {
      delays[index] = cursor + within * WITHIN_MS;
    });
    cursor += Math.max(GROUP_MS, members.length * WITHIN_MS);
  }
  return delays;
}

/** How long the whole draw takes, for a caller that wants to know. */
export function drawDuration(shapes: readonly BlueprintShape[]): number {
  return Math.max(0, ...drawDelays(shapes)) + DRAW_MS;
}

// Keyframe names are global, so they carry a prefix nothing else uses. The
// media rule is the real reduced-motion guarantee: with the animations off,
// a stroke shape falls back to its base dash offset of zero, which is the
// finished drawing, and a filled shape falls back to full opacity. The
// component's own media-query read below is a second, independent path to the
// same rendering — neither depends on the other.
const BUILD_WAIT_CSS = `
@keyframes kai-bw-draw { from { stroke-dashoffset: var(--kai-bw-len); } to { stroke-dashoffset: 0; } }
@keyframes kai-bw-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: none; } }
@keyframes kai-bw-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.42; } }
@media (prefers-reduced-motion: reduce) {
  [data-build-wait] [data-bw-shape],
  [data-build-wait] [data-bw-pulse] { animation: none !important; }
}
`;

/** Reactive `prefers-reduced-motion`, SSR-safe. A local copy of the helper
 *  `toast.tsx` carries: that one is module-private there, and this file is not
 *  the place to promote it to a shared module. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = createSignal(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  );
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    onCleanup(() => mq.removeEventListener?.('change', on));
  }
  return reduced;
}

interface PartProps {
  shape: BlueprintShape;
  delay: number;
  animate: boolean;
}

function BlueprintPart(props: PartProps): JSX.Element {
  // Read once, at setup. A blueprint is static data and `For` is
  // reference-keyed, so a row's shape never changes identity under it — and
  // pulling it out of props is what lets `kind` narrow the union properly
  // instead of casting at every attribute. Only `animate` is reactive, and it
  // is read inside `style()`, which stays a live accessor.
  const shape = props.shape;
  const filled = isFilled(shape.ink);
  const length = drawLength(shape);

  const style = (): JSX.CSSProperties => {
    // `animation` is ALWAYS a key here, `none` when there is nothing to run —
    // the same reason the active step's dot spells it out: a style key that
    // disappears between renders is the case Solid does not clear.
    const base: Record<string, string> = { stroke: shape.ink.stroke, fill: shape.ink.fill, animation: 'none' };
    if (filled) {
      // A transform on an SVG child needs its own box, or `scale` resolves
      // against the whole viewBox and the shape flies in from the corner.
      base['transform-box'] = 'fill-box';
      base['transform-origin'] = 'center';
      if (props.animate) base['animation'] = `kai-bw-pop ${DRAW_MS}ms ease-out ${props.delay}ms both`;
    } else {
      base['--kai-bw-len'] = String(length);
      base['stroke-dasharray'] = String(length);
      if (props.animate) base['animation'] = `kai-bw-draw ${DRAW_MS}ms ease-out ${props.delay}ms both`;
    }
    if (props.animate && shape.hero) {
      const from = props.delay + DRAW_MS + SETTLE_MS;
      base['animation'] = `${base['animation']}, kai-bw-breathe ${BREATHE_MS}ms ease-in-out ${from}ms infinite`;
    }
    return base as JSX.CSSProperties;
  };

  const strokeWidth = filled ? undefined : STROKE;

  if (shape.kind === 'rect') {
    return (
      <rect
        data-bw-shape
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        rx={shape.r}
        style={style()}
        stroke-width={strokeWidth}
        stroke-linejoin="round"
      />
    );
  }
  if (shape.kind === 'line') {
    return (
      <line
        data-bw-shape
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        style={style()}
        stroke-width={strokeWidth}
        stroke-linecap="round"
      />
    );
  }
  return (
    <circle data-bw-shape cx={shape.cx} cy={shape.cy} r={shape.r} style={style()} stroke-width={strokeWidth} />
  );
}

/** Per-step status, derived from `current` and `error`. Exported for the test,
 *  which asserts the derivation rather than re-deriving it. */
export function stepStatuses(
  steps: readonly BuildWaitStep[],
  current: string | undefined,
  failed: boolean,
): BuildWaitStepStatus[] {
  const found = steps.findIndex((s) => s.id === current);
  const at = found === -1 ? 0 : found;
  return steps.map((_, i) => {
    if (i < at) return 'done';
    if (i > at) return 'pending';
    return failed ? 'failed' : 'active';
  });
}

/**
 * The builder's preview-boot wait: the chosen template's blueprint drawing
 * itself, with the real boot phases reported underneath. Non-interactive by
 * design — there is nothing here to click, and nothing here reports progress
 * except `steps`.
 *
 * Dark-first and token-only: every color is a kit custom property, so the
 * blueprint and the step list read correctly in both modes with no per-theme
 * branch. The drawing is `aria-hidden` — it is decoration over a wait, and
 * the step list is the part that carries meaning and gets the live region.
 */
export function BuildWait(props: BuildWaitProps): JSX.Element {
  const systemReduced = usePrefersReducedMotion();
  const reduced = () => props.reduceMotion ?? systemReduced();
  const failed = () => !!props.error;
  const steps = () => props.steps ?? BUILD_WAIT_STEPS;
  const shapes = () => BLUEPRINTS[props.templateId];
  const delays = createMemo(() => drawDelays(shapes()));
  // A failed boot freezes with the drawing finished: the plan is still worth
  // looking at, but nothing about it should still be moving once the thing it
  // was a plan for has stopped.
  const animate = () => !reduced() && !failed();
  const statuses = createMemo(() => stepStatuses(steps(), props.current, failed()));

  return (
    <div
      data-build-wait
      data-error={props.error ? '' : undefined}
      class={cn('mx-auto flex w-full flex-col gap-4', props.class)}
      style={{ 'max-width': '30rem' }}
    >
      <style>{BUILD_WAIT_CSS}</style>

      {/* The drawing surface: the same dotted graph-paper motif the template
          cards use behind their illustrations, imported rather than restated. */}
      <div
        class="w-full overflow-hidden rounded-lg border p-4"
        style={{
          ...BLUEPRINT_BG,
          'background-color': 'var(--color-card)',
          'border-color': 'var(--color-border)',
          // The one visual difference a failure makes to the drawing: it goes
          // quiet. The message still comes from the notice below, not from
          // this, which is a mood and cannot be read.
          opacity: failed() ? '0.55' : '1',
        }}
      >
        <svg
          viewBox="0 0 160 100"
          aria-hidden="true"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <For each={shapes()}>
            {(shape, i) => <BlueprintPart shape={shape} delay={delays()[i()]} animate={animate()} />}
          </For>
        </svg>
      </div>

      {/* The truth half. One polite live region around the whole list: it is
          short, it changes a few times over a wait, and announcing the list as
          it stands beats announcing one step's change out of context. The
          region is a wrapper rather than a role on the list itself — a role
          there would displace the list semantics, and the list is the thing a
          screen reader wants to be able to walk. The error notice below
          carries its own alert role. */}
      <div role="status" aria-live="polite">
        <ol
          data-build-wait-steps
          class="flex flex-col gap-2"
          style={{ 'list-style': 'none', margin: '0', padding: '0' }}
        >
          <For each={steps()}>
            {(step, i) => {
              const status = () => statuses()[i()];
              return (
                <li
                  data-step={step.id}
                  data-status={status()}
                  aria-current={status() === 'active' ? 'step' : undefined}
                  class="flex items-center gap-3 text-sm"
                >
                  <span class="flex size-4 shrink-0 items-center justify-center">
                    <Show when={status() === 'done'}>
                      <Check class="size-4" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    </Show>
                    <Show when={status() === 'failed'}>
                      <CircleAlert class="size-4 text-tool-red" aria-hidden="true" />
                    </Show>
                    <Show when={status() === 'active'}>
                      {/* The same heartbeat as the blueprint's hero shape, on
                          the same duration — the two halves of the screen are
                          deliberately on one clock. */}
                      <span
                        data-bw-pulse
                        class="size-2 rounded-full"
                        style={{
                          'background-color': 'var(--color-primary)',
                          // `none`, never undefined: a style key whose value
                          // goes away is the exact shape of the "Solid drops
                          // computed style keys" trap this repo has recorded,
                          // so the key stays and its VALUE carries the switch.
                          animation: reduced() ? 'none' : `kai-bw-breathe ${BREATHE_MS}ms ease-in-out infinite`,
                        }}
                      />
                    </Show>
                    <Show when={status() === 'pending'}>
                      <span
                        class="size-2 rounded-full"
                        style={{ border: `1px solid var(--color-border)` }}
                      />
                    </Show>
                  </span>
                  <span
                    class={cn(
                      'min-w-0 leading-snug',
                      status() === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            }}
          </For>
        </ol>
      </div>

      <Show when={props.error}>
        {(message) => <Notice severity="error">{message()}</Notice>}
      </Show>
    </div>
  );
}
