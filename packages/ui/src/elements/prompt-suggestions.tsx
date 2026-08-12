import { For, createSignal, onMount, onCleanup } from 'solid-js';
import { defineWebComponent } from './define';
import { PromptSuggestion } from '../components/prompt-suggestion';

type Item = string | { label: string; value?: string; icon?: string };

interface Props extends Record<string, unknown> {
  /** The suggestions. Strings, or `{ label, value }` when the displayed text
   *  and the emitted value differ. Set as a JS property. Omit to supply them as
   *  `<kai-suggestion>` light-DOM children instead; when both are present the
   *  property's suggestions come first. */
  suggestions?: Item[];
  /** Chip style: `'outline'` (default), `'ghost'`, or `'default'` (filled). */
  variant?: 'outline' | 'ghost' | 'default';
  /** Row height for `layout="list"`: `'md'` (default) or `'lg'` for taller rows.
   *  Chips are unaffected. */
  size?: 'md' | 'lg';
  /** Layout: `'chips'` (default) renders a wrapping row of rounded pills;
   *  `'list'` renders a vertical, full-width "Ideas for you" list where each
   *  row is left-aligned with a leading `icon`, a label, and a hover
   *  background. */
  layout?: 'chips' | 'list';
  /** Full-width left-aligned rows instead of pills. */
  block?: boolean;
  /** Substring to highlight within each suggestion. */
  highlight?: string;
}

/** Events fired by `<kai-suggestions>`. */
interface Events {
  /** A suggestion was clicked. */
  'kai-select': { value: string };
}

const labelOf = (s: Item) => (typeof s === 'string' ? s : s.label);
const valueOf = (s: Item) => (typeof s === 'string' ? s : s.value ?? s.label);
const iconOf = (s: Item) => (typeof s === 'string' ? undefined : s.icon);

/** Parse a single `<kai-suggestion>` node into an `Item` descriptor. */
export function parseSuggestionNode(n: Element): Item {
  const text = n.textContent?.trim() ?? '';
  const value = n.getAttribute('value') ?? text;
  return { label: text, value, icon: n.getAttribute('icon') ?? undefined };
}

/**
 * `<kai-suggestions>` — a row/list of suggestion chips. Data via the
 * `suggestions` property; `variant`/`layout`/`block`/`highlight` attributes;
 * emits `select`. `layout="list"` renders the vertical "Ideas for you" list
 * (leading icon + label + hover background) instead of pills.
 *
 * Alternatively, declare chips as `<kai-suggestion>` child elements
 * (light-DOM data carriers — hidden by the Shadow DOM):
 *
 * ```html
 * <kai-suggestions>
 *   <kai-suggestion value="vue">Use Vue</kai-suggestion>
 *   <kai-suggestion value="react">Use React</kai-suggestion>
 * </kai-suggestions>
 * ```
 */
defineWebComponent<Props, Events>('kai-suggestions', {
  suggestions: [],
  variant: 'outline',
  size: 'md',
  layout: 'chips',
  block: false,
  highlight: undefined,
}, (props, { dispatch, flag, element }) => {
  // Read declarative <kai-suggestion> children from light DOM.
  // Shadow DOM with no <slot> suppresses them visually — they're invisible data carriers.
  const [slottedSuggestions, setSlottedSuggestions] = createSignal<Item[]>([]);
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-suggestion')];
      setSlottedSuggestions(nodes.map(parseSuggestionNode));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // Merge prop suggestions (first) with declarative children (after).
  const allSuggestions = () => [...(props.suggestions ?? []), ...slottedSuggestions()];

  const isList = () => props.layout === 'list';

  const containerClass = () =>
    isList() ? 'flex flex-col gap-0.5'
      : flag('block') ? 'flex flex-col gap-2'
        : 'flex flex-wrap gap-2';

  return (
    <div class={containerClass()}>
      <For each={allSuggestions()}>
        {(s) => (
          <PromptSuggestion
            variant={props.variant}
            size={props.size}
            icon={iconOf(s)}
            block={flag('block')}
            list={isList()}
            highlight={props.highlight}
            onClick={() => dispatch('kai-select', { value: valueOf(s) })}
          >
            {labelOf(s)}
          </PromptSuggestion>
        )}
      </For>
    </div>
  );
});
