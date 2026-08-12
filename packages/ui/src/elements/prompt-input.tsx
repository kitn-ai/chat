import { createEffect, createSignal, onMount, onCleanup } from 'solid-js';
import { defineWebComponent } from './define';
import { DefaultPromptInput } from './default-input';
import type { AttachmentData } from '../components/attachments';
import type { CustomAction } from './chat-types';
import type { TriggerDef, ComposerChange } from '../components/composer';
import { type ComposerDoc, type EntityRef, normalizeValue, serializeToText, entitiesOf } from '../primitives/composer-model';

interface Props extends Record<string, unknown> {
  /** Value of the input, as a JS property. A **string** is the controlled text
   *  mirror (the host owns it and updates on `kai-value-change`). A **ComposerDoc**
   *  (array of text/entity segments) is a one-time **seed** that pre-populates
   *  pills (skills/agents/plugins); the user then edits freely. Leave unset for
   *  uncontrolled behavior. `kai-submit`/`kai-value-change` always emit `value`
   *  as the flattened string (back-compat) plus the structured `doc` + `entities`. */
  value?: string | ComposerDoc;
  /** Placeholder text shown in the empty input. */
  placeholder?: string;
  /** Disable the input and submit button entirely (non-interactive). */
  disabled?: boolean;
  /** Show the loading/streaming state and block submit (use while awaiting a
   *  reply). */
  loading?: boolean;
  /** Starter prompts shown above the input. Clicking one follows
   *  `suggestionMode`. Set as a JS property. */
  suggestions?: string[];
  /** What clicking a suggestion does: `'submit'` (default) sends it immediately
   *  as if typed and submitted; `'fill'` just places it in the input. */
  suggestionMode?: 'submit' | 'fill';
  /** Show a Search (Globe) button in the left toolbar; clicking it fires a
   *  `search` event. */
  search?: boolean;
  /** Show a Voice (Mic) button in the left toolbar; clicking it fires a `voice`
   *  event. */
  voice?: boolean;
  /** When set and `loading` is true, the send button is replaced by a Stop
   *  button (square icon, "Stop" aria-label). Clicking it fires `kai-stop`. */
  stoppable?: boolean;
  /** Send-button visibility. `'always'` (default) always shows it; `'auto'` shows
   *  it only when there's text/attachments (an empty composer hides it, though
   *  Enter still submits). To hide it entirely (Enter-only), it's pure CSS:
   *  `::part(send){display:none}`, no prop needed. Restyle via `::part(send)`.
   *  The Stop button (`stoppable` + `loading`) is unaffected. */
  submit?: 'always' | 'auto';
  /** When `false`, hides the built-in paperclip attach button even though the
   *  element otherwise supports attachments. Use this when a `+` menu in
   *  `toolbar-start` already exposes "Add files", to avoid a duplicate control.
   *  Defaults to `true`. */
  attach?: boolean;
  /** Attachments to seed the input with (so a consumer can pre-populate staged
   *  files without an upload). Set as a JS property; the element then manages its
   *  own attachment state from there (add via the paperclip, remove per chip). */
  attachments?: AttachmentData[];
  /** Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored menu
   *  that inserts an atomic pill. Convention: `/` → skills, `@` → agents (plugins
   *  are the grouping/provenance of those items). Set as a JS property. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image URL/data-URI) for pills/menu items
   *  without their own `icon`. Overrides the built-in agent/plugin glyphs. JS property. */
  kindIcons?: Record<string, string>;
}

/** Events fired by `<kai-prompt-input>`. */
interface Events {
  /** The user submitted the prompt (Enter or send button). `value` is the
   *  flattened text (back-compat); `doc` is the structured document and
   *  `entities` the inserted pills (skills/agents) for downstream expansion. */
  'kai-submit': { value: string; doc: ComposerDoc; entities: EntityRef[]; attachments: AttachmentData[] };
  /** The input changed (fires on every edit). Carries the flattened `value`
   *  plus the structured `doc` + `entities`. */
  'kai-value-change': { value: string; doc: ComposerDoc; entities: EntityRef[] };
  /** The staged attachments changed: a file was added (via the paperclip) or
   *  removed (per-chip ×). Carries the full current list so a consumer can react
   *  in real time (validate, show upload progress, toggle the send button). */
  'kai-attachments-change': { attachments: AttachmentData[] };
  /** A suggestion was clicked while `suggestion-mode="fill"`. */
  'kai-suggestion-click': { value: string };
  /** The Search (Globe) toolbar button was clicked. */
  'kai-search': Record<string, never>;
  /** The Voice (Mic) toolbar button was clicked. */
  'kai-voice': Record<string, never>;
  /** The Stop button was clicked while `stoppable` and `loading` are both true. */
  'kai-stop': Record<string, never>;
  /** A custom `<kai-action>` toolbar button was clicked. `action` is the `id` of
   *  the `<kai-action>` element that was clicked. */
  'kai-toolbar-action': { action: string };
}

defineWebComponent<Props, Events>('kai-prompt-input', {
  value: undefined,
  placeholder: 'Send a message...',
  disabled: false,
  loading: false,
  suggestions: undefined,
  suggestionMode: 'submit',
  search: false,
  voice: false,
  stoppable: false,
  submit: 'always',
  attach: true,
  attachments: undefined,
  triggers: undefined,
  kindIcons: undefined,
}, (props, { dispatch, flag, element, expose }) => {
  const [internal, setInternal] = createSignal<string | ComposerDoc>(props.value ?? '');
  // Seed staged attachments from the `attachments` property; the element manages
  // its own state from there (paperclip adds, per-chip remove deletes).
  const [attachments, setAttachments] = createSignal<AttachmentData[]>(props.attachments ?? []);
  // Re-seed when the `attachments` property is (re)assigned by the consumer
  // (e.g. set via a `ref` after mount). Subsequent in-element edits stay local.
  createEffect(() => {
    if (props.attachments) setAttachments(props.attachments);
  });

  // Read declarative <kai-action> children from light DOM — same pattern as
  // kai-message. Shadow DOM with no <slot> suppresses them visually; they are
  // invisible data carriers.
  const [toolbarActions, setToolbarActions] = createSignal<CustomAction[]>([]);
  onMount(() => {
    const readActions = () => {
      const nodes = [...element.querySelectorAll('kai-action')];
      setToolbarActions(nodes.map(n => ({
        id: n.id || n.getAttribute('action') || '',
        label: n.textContent?.trim() || n.getAttribute('label') || n.id || '',
        icon: n.getAttribute('icon') ?? undefined,
        tooltip: n.getAttribute('tooltip') ?? undefined,
      })));
    };
    readActions();
    const observer = new MutationObserver(readActions);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });

  // A string `value` is controlled (the host owns it). A ComposerDoc `value` is a
  // one-time seed: it lives in `internal` and the user's edits (which arrive as
  // strings) replace it there, so the seed never fights the edits.
  const current = (): string | ComposerDoc =>
    typeof props.value === 'string' ? props.value : internal();

  // Latest structured change from the composer (doc + entities). Captured before
  // the string value-change fires (the bridge calls onComposerChange first), so
  // the dispatched events can carry the doc. Reset to a text-only doc when a value
  // is set that didn't come from the composer (e.g. a suggestion fill).
  let lastChange: ComposerChange = { doc: [], text: '', entities: [] };

  // Seed from a ComposerDoc `value`: push it into `internal` (so `current()`
  // reflects the seed) and into `lastChange` (so a submit-WITHOUT-edit still
  // carries the seeded doc + entities). Re-runs only when `value` is reassigned.
  createEffect(() => {
    const v = props.value;
    if (v != null && typeof v !== 'string') {
      const doc = normalizeValue(v);
      setInternal(doc);
      lastChange = { doc, text: serializeToText(doc), entities: entitiesOf(doc) };
    }
  });

  const handleChange = (v: string) => {
    setInternal(v);
    if (v !== lastChange.text) lastChange = { doc: normalizeValue(v), text: v, entities: [] };
    dispatch('kai-value-change', { value: v, doc: lastChange.doc, entities: lastChange.entities });
  };
  const handleSubmit = () => {
    // `value` is always the flattened string (back-compat); a seeded doc is
    // serialized. The structured `doc`/`entities` carry the pills.
    dispatch('kai-submit', { value: serializeToText(normalizeValue(current())), doc: lastChange.doc, entities: lastChange.entities, attachments: attachments() });
    setAttachments([]);
  };
  const handleSuggestionClick = (v: string) => {
    if ((props.suggestionMode ?? 'submit') === 'fill') {
      handleChange(v);
      dispatch('kai-suggestion-click', { value: v });
    } else {
      // Default: behave as if the user typed the suggestion and pressed submit.
      dispatch('kai-submit', { value: v, doc: normalizeValue(v), entities: [], attachments: attachments() });
      setAttachments([]);
    }
  };

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // The input half of the interaction surface; counterpart to the kai-* events.
  expose({
    /** Focus the text editor inside the shadow root (not the hidden file input). */
    focus: (options?: FocusOptions) => {
      const root = element.shadowRoot;
      const target =
        root?.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"]), textarea') ??
        root?.querySelector<HTMLElement>('input:not([type="file"])');
      target?.focus(options);
    },
    /** Blur the focused input control. */
    blur: () =>
      (element.shadowRoot?.activeElement as HTMLElement | null)?.blur(),
    /** Clear the text and any staged attachments (fires kai-value-change /
     *  kai-attachments-change so a controlled consumer can react). */
    clear: () => {
      handleChange('');
      if (attachments().length) { setAttachments([]); dispatch('kai-attachments-change', { attachments: [] }); }
    },
    /** Send the current value programmatically, on the same path as Enter / the
     *  send button (fires kai-submit, then clears staged attachments). Named
     *  `send`, not `submit`, to avoid colliding with the `submit` prop. */
    send: () => handleSubmit(),
  });

  return (
    <DefaultPromptInput
      value={current()}
      placeholder={props.placeholder}
      disabled={flag('disabled')}
      loading={flag('loading')}
      stoppable={flag('stoppable')}
      submit={props.submit as 'always' | 'auto'}
      attach={flag('attach')}
      suggestions={props.suggestions}
      attachments={attachments()}
      search={flag('search')}
      voice={flag('voice')}
      toolbarActions={toolbarActions()}
      triggers={props.triggers}
      kindIcons={props.kindIcons as Record<string, string> | undefined}
      onComposerChange={(c) => { lastChange = c; }}
      onValueChange={handleChange}
      onSubmit={handleSubmit}
      onSuggestionClick={handleSuggestionClick}
      onAttachmentsChange={(a) => { setAttachments(a); dispatch('kai-attachments-change', { attachments: a }); }}
      onSearch={() => dispatch('kai-search')}
      onVoice={() => dispatch('kai-voice')}
      onStop={() => dispatch('kai-stop')}
      onAction={(id) => dispatch('kai-toolbar-action', { action: id })}
    />
  );
});
