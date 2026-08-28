import {
  type JSX,
  type Accessor,
  splitProps,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { cn } from '../utils/cn';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { ChevronDown, Circle } from 'lucide-solid';

// --- ChainOfThoughtItem ---

export interface ChainOfThoughtItemProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function ChainOfThoughtItem(props: ChainOfThoughtItemProps) {
  const [local, rest] = splitProps(props, ['children', 'class']);
  return (
    <div class={cn('text-muted-foreground text-sm', local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// --- ChainOfThoughtTrigger ---

export interface ChainOfThoughtTriggerProps {
  children: JSX.Element;
  class?: string;
  leftIcon?: JSX.Element;
  swapIconOnHover?: boolean;
}

function ChainOfThoughtTrigger(props: ChainOfThoughtTriggerProps) {
  const swapOnHover = () => props.swapIconOnHover ?? true;

  return (
    <CollapsibleTrigger
      class={cn(
        'group text-muted-foreground hover:text-foreground flex cursor-pointer items-center justify-start gap-1 text-left text-meta transition-colors',
        props.class
      )}
    >
      <div class="flex items-center gap-2">
        <Show
          when={props.leftIcon}
          fallback={
            <span class="relative inline-flex size-4 items-center justify-center">
              <Circle class="size-2 fill-current" />
            </span>
          }
        >
          <span class="relative inline-flex size-4 items-center justify-center">
            <span
              class={cn(
                'transition-opacity',
                swapOnHover() && 'group-hover:opacity-0'
              )}
            >
              {props.leftIcon}
            </span>
            <Show when={swapOnHover()}>
              <ChevronDown class="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:rotate-180" />
            </Show>
          </span>
        </Show>
        <span>{props.children}</span>
      </div>
      <Show when={!props.leftIcon}>
        <ChevronDown class="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </Show>
    </CollapsibleTrigger>
  );
}

// --- ChainOfThoughtContent ---

export interface ChainOfThoughtContentProps {
  children: JSX.Element;
  class?: string;
}

function ChainOfThoughtContent(props: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent
      class={cn(
        'text-popover-foreground overflow-hidden',
        props.class
      )}
    >
      <div class="grid grid-cols-[min-content_minmax(0,1fr)] gap-x-4">
        <div class="bg-primary/20 ml-1.75 h-full w-px group-data-[last=true]:hidden" />
        <div class="ml-1.75 h-full w-px bg-transparent group-data-[last=false]:hidden" />
        <div class="mt-2 space-y-2">{props.children}</div>
      </div>
    </CollapsibleContent>
  );
}

// --- ChainOfThought (Root) ---

export interface ChainOfThoughtProps {
  children: JSX.Element;
  class?: string;
}

function ChainOfThought(props: ChainOfThoughtProps) {
  return (
    <div class={cn('space-y-0', props.class)}>
      {props.children}
    </div>
  );
}

// --- ChainOfThoughtStep ---

export interface ChainOfThoughtStepProps {
  children: JSX.Element;
  class?: string;
  isLast?: boolean;
  /** Controlled open state. When provided, the step's Collapsible is driven by
   *  this value (the parent owns it — used by the Accordion model below). When
   *  OMITTED the step stays uncontrolled, preserving the original behaviour
   *  (every step independently toggleable, starting closed). */
  open?: boolean;
  /** Called with the desired next open state when the user clicks the trigger.
   *  Only meaningful when `open` is also provided (controlled mode); the parent
   *  Accordion routes this through its open-set handler. */
  onOpenChange?: (open: boolean) => void;
}

function ChainOfThoughtStep(props: ChainOfThoughtStepProps) {
  return (
    <Collapsible
      class={cn('group', props.class)}
      data-last={props.isLast ?? false}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      {props.children}
      <div class="flex justify-start group-data-[last=true]:hidden">
        <div class="bg-primary/20 ml-1.75 h-4 w-px" />
      </div>
    </Collapsible>
  );
}

// --- Accordion model (the kai-chain-of-thought interaction surface) ---

/** Open-mode: `multiple` (any number of steps open at once — the historical
 *  default) or `single` (at most one open; opening a step closes the others). */
export type ChainOfThoughtType = 'single' | 'multiple';

/**
 * A reasoning step descriptor. `id` is an OPTIONAL stable key — the Accordion's
 * open-set keys use `step.id` when present, else `String(index)`. So a consumer
 * who wants to drive `value`/`defaultValue` (or read `kai-value-change`) by a
 * meaningful key should set `id`; otherwise the step's position is its key.
 */
export interface ChainOfThoughtStepData {
  /** The step's heading (the always-visible trigger). */
  label: string;
  /** Optional expandable detail. */
  content?: string;
  /** Optional stable key for the open-set/value model (defaults to the index). */
  id?: string;
}

/**
 * Imperative handle exposed via `controllerRef` so the `<kai-chain-of-thought>`
 * facade can drive/observe the Accordion's open set. Index-based to match the
 * `expand(index?)`/`collapse(index?)`/`toggle(index?)` method signatures; the
 * controller resolves the index → step key internally. All setters flow through
 * the same open-set mutate path as user clicks, so they all emit
 * `kai-value-change` via `onValueChange`.
 */
export interface ChainOfThoughtController {
  /** Current open keys, normalised per `type` (string in single, string[] in multiple). */
  value: Accessor<string | string[]>;
  /** Open one step by index, or ALL steps when `index` is omitted. */
  expand: (index?: number) => void;
  /** Close one step by index, or ALL steps when `index` is omitted. */
  collapse: (index?: number) => void;
  /** Flip one step's open state by index. */
  toggle: (index?: number) => void;
}

export interface ChainOfThoughtAccordionProps {
  /** The reasoning steps to render. */
  steps: ChainOfThoughtStepData[];
  /** Open mode. Default `multiple` (the historical behaviour). */
  type?: ChainOfThoughtType;
  /** Controlled open step key(s). When provided it WINS over internal state. */
  value?: string | string[];
  /** Uncontrolled initial open step key(s). Seeds the internal open-set. */
  defaultValue?: string | string[];
  /** Fired whenever the open set changes (user click OR a controller method).
   *  The single emit point — the facade turns this into `kai-value-change`. The
   *  payload is a string in `single` mode, a string[] in `multiple` mode. */
  onValueChange?: (value: string | string[]) => void;
  /** Receive the imperative controller once set up (Pattern C). */
  controllerRef?: (api: ChainOfThoughtController) => void;
  class?: string;
}

/** Normalise a `string | string[]` (or undefined) seed to a Set of keys. */
function toKeySet(value: string | string[] | undefined): Set<string> {
  if (value == null) return new Set();
  return new Set(Array.isArray(value) ? value : [value]);
}

/**
 * The full Accordion-model root used by `<kai-chain-of-thought>`. Lifts each
 * step's open state into a controlled/uncontrolled open-set:
 *  - seeded from `defaultValue` (normalised string|string[] → Set);
 *  - when `value` is provided it WINS (controlled);
 *  - a trigger click updates the set respecting `single` vs `multiple` and emits
 *    via `onValueChange` — in single mode opening a step closes the others;
 *  - each step's Collapsible is driven (controlled) by its membership in the set.
 *
 * With NO new props (type defaults to `multiple`, no value/defaultValue), every
 * step starts closed and is independently toggleable — identical to the old
 * behaviour, just with the open state lifted here so methods/events can observe
 * and drive it.
 */
function ChainOfThoughtAccordion(props: ChainOfThoughtAccordionProps) {
  const [internal, setInternal] = createSignal<Set<string>>(toKeySet(props.defaultValue));

  const type = (): ChainOfThoughtType => props.type ?? 'multiple';

  // The step key: explicit id when present, else the index as a string.
  const keyOf = (step: ChainOfThoughtStepData, index: number) => step.id ?? String(index);

  // Controlled `value` wins; otherwise the internal signal owns the open-set.
  const isControlled = () => props.value !== undefined;
  const openSet = (): Set<string> => (isControlled() ? toKeySet(props.value) : internal());

  const isOpen = (key: string) => openSet().has(key);

  // Shape the open-set as the public value: a single string (or '') in single
  // mode, a string[] in multiple mode.
  const toValue = (set: Set<string>): string | string[] => {
    if (type() === 'single') {
      const first = set.values().next();
      return first.done ? '' : first.value;
    }
    return [...set];
  };

  // The single mutate path — shared by trigger clicks and controller methods.
  // Computes the next open-set, writes it (uncontrolled only) and ALWAYS emits
  // onValueChange so both user + programmatic changes flow to kai-value-change.
  const commit = (next: Set<string>) => {
    const cur = openSet();
    // No-op if the set is unchanged (avoids redundant events).
    if (cur.size === next.size && [...cur].every((k) => next.has(k))) return;
    if (!isControlled()) setInternal(next);
    props.onValueChange?.(toValue(next));
  };

  // Set a single key's open state, respecting single vs multiple.
  const setKeyOpen = (key: string, open: boolean) => {
    if (type() === 'single') {
      commit(open ? new Set([key]) : new Set());
      return;
    }
    const next = new Set(openSet());
    if (open) next.add(key); else next.delete(key);
    commit(next);
  };

  // Resolve a step index → key (undefined when out of range).
  const keyAt = (index: number): string | undefined => {
    const step = props.steps[index];
    return step ? keyOf(step, index) : undefined;
  };

  const allKeys = (): string[] => props.steps.map((s, i) => keyOf(s, i));

  // --- Controller (Pattern C): hand the facade an index-based handle. Every
  //     setter routes through commit() so methods + clicks share one emit point.
  props.controllerRef?.({
    value: () => toValue(openSet()),
    expand: (index?: number) => {
      if (index === undefined) {
        // Open all. In single mode only one can be open — keep the last step.
        if (type() === 'single') {
          const keys = allKeys();
          commit(keys.length ? new Set([keys[keys.length - 1]]) : new Set());
        } else {
          commit(new Set(allKeys()));
        }
        return;
      }
      const key = keyAt(index);
      if (key !== undefined) setKeyOpen(key, true);
    },
    collapse: (index?: number) => {
      if (index === undefined) {
        commit(new Set());
        return;
      }
      const key = keyAt(index);
      if (key !== undefined) setKeyOpen(key, false);
    },
    toggle: (index?: number) => {
      if (index === undefined) return;
      const key = keyAt(index);
      if (key !== undefined) setKeyOpen(key, !isOpen(key));
    },
  });

  return (
    <ChainOfThought class={props.class}>
      <For each={props.steps}>
        {(step, i) => {
          const key = () => keyOf(step, i());
          return (
            <ChainOfThoughtStep
              isLast={i() === props.steps.length - 1}
              open={isOpen(key())}
              onOpenChange={(open) => setKeyOpen(key(), open)}
            >
              <ChainOfThoughtTrigger>{step.label}</ChainOfThoughtTrigger>
              <Show when={step.content}>
                <ChainOfThoughtContent>
                  <ChainOfThoughtItem>{step.content}</ChainOfThoughtItem>
                </ChainOfThoughtContent>
              </Show>
            </ChainOfThoughtStep>
          );
        }}
      </For>
    </ChainOfThought>
  );
}

export {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtAccordion,
};
