import { createSignal } from 'solid-js';
import { defineWebComponent } from './define';
import { ChatScopePicker } from '../components/chat-scope-picker';
import { wireDisclosure } from './disclosure';
import type { DropdownController } from '../ui/dropdown';
import type { SearchFilters } from '../types';

interface Props extends Record<string, unknown> {
  /** Authors to offer as scope filters. Omit to drop the Authors section (for a
   *  tag-only picker). Set as a JS property. */
  availableAuthors?: string[];
  /** Tags to offer as scope filters. Omit to drop the Tags section (for an
   *  author-only picker). Set as a JS property. */
  availableTags?: string[];
  /** The label shown on the trigger for the active scope. */
  currentLabel?: string;
  /** Drive/observe the dropdown's open state (Shoelace-style: settable + reflected
   *  to the `open` attribute, the dropdown still self-manages on click/keyboard).
   *  Set `el.open = true`, or `<kai-scope-picker open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Disable the trigger: click/keyboard and `show()` no longer open the dropdown. */
  disabled?: boolean;
}

/** Events fired by `<kai-scope-picker>`. */
interface Events {
  /** A scope was chosen (`undefined` filters = "All Content"). */
  'kai-scope-change': { filters: SearchFilters | undefined };
  /** The scope dropdown opened or closed (by click, keyboard, Escape, outside-click, or a method). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-scope-picker>` — a dropdown to scope a chat by author or tag.
 * Options via `available-authors`/`available-tags` properties; emits
 * `kai-scope-change`.
 */
defineWebComponent<Props, Events>('kai-scope-picker', {
  availableAuthors: [],
  availableTags: [],
  currentLabel: 'All Content',
  open: undefined,
  defaultOpen: undefined,
  disabled: undefined,
}, (props, ctx) => {
  const { dispatch, flag } = ctx;
  // V2-PORT: a reactive signal, not a plain `let` — the disclosure/controller
  // effects track it, and ownedWrite sanctions the synchronous hand-up from
  // the primitive's body (see elements/tool.tsx, the same fix).
  const [api, setApi] = createSignal<DropdownController | undefined>(undefined, { ownedWrite: true });

  // The standard overlay surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. See ./disclosure.
  wireDisclosure(ctx, api, () => props.open);

  return (
    <ChatScopePicker
      currentLabel={props.currentLabel ?? 'All Content'}
      availableAuthors={props.availableAuthors ?? []}
      availableTags={props.availableTags ?? []}
      onScopeChange={(filters) => dispatch('kai-scope-change', { filters })}
      defaultOpen={flag('defaultOpen')}
      disabled={flag('disabled')}
      controllerRef={(a) => setApi(a)}
    />
  );
});
