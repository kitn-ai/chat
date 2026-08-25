import { createSignal, For, onCleanup, onSettled, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { Source, SourceTrigger, SourceContent, SourceList } from '../components/source';
// Public shape of the `sources` prop; lives in ./element-data-types so the ROOT
// entry can re-export it (see that file's header).
import type { KaiSourceItem } from './element-data-types';

// --- <kai-source> — a single citation link with hover preview ---

interface SourceProps extends Record<string, unknown> {
  /** The URL this citation links to (the domain also seeds the default label/favicon). */
  href?: string;
  /** Trigger label (defaults to the domain). */
  label?: string;
  /** Hover-card headline. Attribute: `headline` (`title` is avoided because it
   *  is a global HTML attribute that reflects in a CE constructor and breaks
   *  it). */
  headline?: string;
  /** Hover-card body text describing the source. */
  description?: string;
  /** Show the source's favicon next to the trigger label. */
  showFavicon?: boolean;
}

defineWebComponent<SourceProps>('kai-source', {
  href: '',
  label: undefined,
  headline: '',
  description: '',
  showFavicon: false,
}, (props, { flag }) => (
  <>
    {/* The shared element base sets `:host{display:block}` (styles.css). A block host
        makes each citation chip its own line box, so inline `[n]` markers stack and
        push the trailing prose/period to a new line. inline-flex (like kai-button /
        kai-tooltip) drops the line box so the chip flows inline with the answer text. */}
    <style>{':host{display:inline-flex}'}</style>
    <Show when={props.href}>
      <Source href={props.href!}>
        <SourceTrigger label={props.label} showFavicon={flag('showFavicon')} />
        <SourceContent title={props.headline ?? ''} description={props.description ?? ''} />
      </Source>
    </Show>
  </>
));

// --- <kai-sources> — a wrapped list of citation links ---


interface SourceListProps extends Record<string, unknown> {
  /** The sources to render. Set as a JS property. Omit to supply them as
   *  `<kai-source>` light-DOM children instead; when both are present the
   *  property's sources come first. */
  sources?: KaiSourceItem[];
  /** Show favicons on all items (per-item `showFavicon` overrides). */
  showFavicon?: boolean;
  /**
   * When true, each citation chip is labelled with its 1-based index in the
   * merged (prop + declarative-children) list (`[1]`, `[2]`, …) instead of the
   * per-item `label` or domain fallback.
   *
   * HTML attribute: `numbered` (boolean: a bare attribute or
   * `numbered="true"`). JS property:   `el.numbered = true`.
   */
  numbered?: boolean;
}

/** Parse a single light-DOM `<kai-source>` element into a `KaiSourceItem` descriptor.
 *  Attribute mapping:
 *   - `href`        → KaiSourceItem.href
 *   - `label`       → KaiSourceItem.label
 *   - `headline`    → KaiSourceItem.title  (matches kai-source's prop name; "title" is a
 *                       reserved HTMLElement attribute so kai-source uses "headline")
 *   - `description` → KaiSourceItem.description
 *   - `show-favicon`→ KaiSourceItem.showFavicon (bare boolean attribute)
 */
export function parseKaiSourceElement(n: Element): KaiSourceItem {
  return {
    href: n.getAttribute('href') ?? '',
    label: n.getAttribute('label') ?? undefined,
    title: n.getAttribute('headline') ?? undefined,
    description: n.getAttribute('description') ?? undefined,
    showFavicon: n.hasAttribute('show-favicon') && n.getAttribute('show-favicon') !== 'false',
  };
}

defineWebComponent<SourceListProps>('kai-sources', {
  sources: [],
  showFavicon: false,
  numbered: false,
}, (props, { element, flag }) => {
  // Read declarative <kai-source> children from light DOM.
  // The shadow root has no <slot> for them, so they are invisible — pure data carriers.
  const [slottedSources, setSlottedSources] = createSignal<KaiSourceItem[]>([]);
  onSettled(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-source')];
      setSlottedSources(nodes.map(parseKaiSourceElement));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => observer.disconnect();
  });

  // Prop sources take precedence; slotted children are appended after.
  const allSources = () => [...(props.sources ?? []), ...slottedSources()];

  const isNumbered = () => flag('numbered');

  return (
    <SourceList>
      <For each={allSources()}>
        {(s, i) => (
          <Source href={s.href}>
            <SourceTrigger
              label={isNumbered() ? i() + 1 : s.label}
              showFavicon={s.showFavicon ?? flag('showFavicon')}
            />
            <SourceContent title={s.title ?? ''} description={s.description ?? ''} />
          </Source>
        )}
      </For>
    </SourceList>
  );
});
