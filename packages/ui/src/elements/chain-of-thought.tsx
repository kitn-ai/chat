import { createSignal, onMount, onCleanup } from 'solid-js';
import { defineWebComponent } from './define';
import {
  ChainOfThoughtAccordion,
  type ChainOfThoughtController,
  type ChainOfThoughtStepData,
  type ChainOfThoughtType,
} from '../components/chain-of-thought';

/**
 * A reasoning step descriptor.
 *
 * `id` is an OPTIONAL stable key. The Accordion's open-set keys (used by `value`,
 * `defaultValue`, the `kai-value-change` payload, and the index→key resolution
 * behind the methods) are `step.id` when present, else `String(index)`. Set `id`
 * if you want to drive/observe a step by a meaningful key rather than position.
 */
type Step = ChainOfThoughtStepData;

interface Props extends Record<string, unknown> {
  /** The reasoning steps. Set as a JS property. Compound sub-parts collapse to
   *  this one data model (Route 1). Each `{ label, content?, id? }`. Omit to
   *  supply the steps as `<kai-step>` light-DOM children instead; when both are
   *  present the property's steps come first. */
  steps?: Step[];
  /** Open mode: `'multiple'` (default — any number of steps open at once) or
   *  `'single'` (at most one open; opening a step closes the others). */
  type?: ChainOfThoughtType;
  /** Controlled open step key(s). When set, it WINS over user interaction (the
   *  consumer owns the open set). String in `single` mode, string[] in
   *  `multiple` mode. Set as a JS property. */
  value?: string | string[];
  /** Uncontrolled INITIAL open step key(s) — seeds which steps render expanded.
   *  Ignored once `value` is provided. Set as a JS property. */
  defaultValue?: string | string[];
}

/** Events fired by `<kai-chain-of-thought>`. */
interface Events {
  /** The open set changed — by user click OR an expand()/collapse()/toggle()
   *  call. `value` is a string in `single` mode, a string[] in `multiple` mode.
   *  (Maps Radix Accordion's onValueChange.) */
  'kai-value-change': { value: string | string[] };
}

/** Parse a single light-DOM `<kai-step>` element into a `Step` descriptor.
 *  Attribute mapping:
 *   - `label`       → Step.label   (the always-visible heading)
 *   - `step-id`     → Step.id      (optional stable open-set key)
 *   - textContent   → Step.content (optional expandable detail)
 */
export function parseKaiStepElement(n: Element): Step {
  return {
    label: n.getAttribute('label') ?? '',
    content: n.textContent?.trim() || undefined,
    id: n.getAttribute('step-id') ?? undefined,
  };
}

/**
 * `<kai-chain-of-thought>` — step-by-step reasoning with connectors and
 * per-step collapsible detail. An Accordion: by default every step is
 * independently collapsible (`type="multiple"`, all closed); set
 * `type="single"` for one-open-at-a-time.
 *
 * **Route 1 — JS property:** set the `steps` property to an array of
 * `{ label, content?, id? }` objects.
 *
 * **Route 2 — declarative children:** compose `<kai-step>` child elements in
 * light DOM (hidden by the Shadow DOM — pure data carriers). The `label`
 * attribute becomes the step heading; `textContent` becomes the expandable
 * detail; an optional `step-id` becomes the open-set key. Children are merged
 * after any prop steps.
 *
 * ```html
 * <kai-chain-of-thought>
 *   <kai-step label="Understand the request">The user wants composable web components.</kai-step>
 *   <kai-step label="Design the API">Route 1: variant + flags; rich data via properties.</kai-step>
 *   <kai-step label="Build & verify"></kai-step>
 * </kai-chain-of-thought>
 * ```
 */
defineWebComponent<Props, Events>('kai-chain-of-thought', {
  steps: [],
  type: undefined,
  value: undefined,
  defaultValue: undefined,
}, (props, { element, dispatch, expose }) => {
  // Read declarative <kai-step> children from light DOM.
  // Shadow DOM with no <slot> suppresses them visually — they're invisible data carriers.
  const [slottedSteps, setSlottedSteps] = createSignal<Step[]>([]);
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-step')];
      setSlottedSteps(nodes.map(parseKaiStepElement));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // Prop steps first; declarative children appended after.
  const allSteps = () => [...(props.steps ?? []), ...slottedSteps()];

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // Pattern C: the Accordion component owns the open-set; the facade captures its
  // controller and exposes index-based methods. Every setter routes through the
  // component's onValueChange (handleValueChange below) — the single emit point —
  // so user clicks AND method calls both fire kai-value-change. No prop collisions:
  // the only props are steps/type/value/defaultValue.
  let controller: ChainOfThoughtController | undefined;
  expose({
    /** Open one step's detail by index, or — with no arg — ALL steps. In `single`
     *  mode opening one step closes the others (expand-all keeps the last). */
    expand: (index?: number) => controller?.expand(index),
    /** Close one step's detail by index, or — with no arg — ALL steps. */
    collapse: (index?: number) => controller?.collapse(index),
    /** Flip one step's open state by index. */
    toggle: (index?: number) => controller?.toggle(index),
  });

  // Single emit point for the open set — both user clicks and the methods above
  // flow through the component's onValueChange to here.
  const handleValueChange = (value: string | string[]) => {
    dispatch('kai-value-change', { value });
  };

  return (
    <ChainOfThoughtAccordion
      steps={allSteps()}
      type={props.type as ChainOfThoughtType | undefined}
      value={props.value as string | string[] | undefined}
      defaultValue={props.defaultValue as string | string[] | undefined}
      onValueChange={handleValueChange}
      controllerRef={(c) => (controller = c)}
    />
  );
});
