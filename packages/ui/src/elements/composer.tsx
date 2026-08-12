import { createSignal } from 'solid-js';
import { defineWebComponent } from './define';
import type { ComposerDoc, EntityRef } from '../primitives/composer-model';
import type { TriggerDef, TriggerItem, HighlightRule, ComposerChange, ComposerController } from '../components/composer';
import { Composer } from '../components/composer';

/**
 * Parse a single light-DOM `<kai-trigger-item>` element into a TriggerItem.
 * Attribute mapping:
 *  - `item-id`     → TriggerItem.id       (required; empty string fallback)
 *  - textContent   → TriggerItem.label    (primary); `label` attr as fallback
 *  - `icon`        → TriggerItem.icon
 *  - `prompt-text` → TriggerItem.promptText
 *  - `data`        is left undefined (complex object, not representable as an attribute)
 *
 * @param n    The `<kai-trigger-item>` element to parse.
 * @param char The trigger character this item belongs to (e.g. `/` or `@`).
 * @param kind The entity kind for this trigger (e.g. `'skill'` or `'mention'`).
 */
export function parseKaiTriggerItemElement(n: Element, char: string, kind: string): TriggerItem {
  // char and kind inform the consumer but are not stored on TriggerItem itself.
  void char;
  void kind;
  return {
    id: n.getAttribute('item-id') ?? '',
    label: n.textContent?.trim() || n.getAttribute('label') || n.getAttribute('item-id') || '',
    icon: n.getAttribute('icon') ?? undefined,
    promptText: n.getAttribute('prompt-text') ?? undefined,
    data: undefined,
  };
}

interface Props extends Record<string, unknown> {
  /** Controlled value: a string or a full ComposerDoc (set as JS property). */
  value?: string | ComposerDoc;
  /** Placeholder text shown when the composer is empty. */
  placeholder?: string;
  /** Disable the composer entirely (non-interactive). */
  disabled?: boolean;
  /** Show a loading/streaming state and block submit. */
  loading?: boolean;
  /** Maximum height in px before the content scrolls. Default 240. */
  maxHeight?: number | string;
  /** Whether pressing Enter (without Shift) submits. Default true. */
  submitOnEnter?: boolean;
  /** Trigger definitions. Set as a JS property. */
  triggers?: TriggerDef[];
  /** Keyword highlight rules. Set as a JS property. */
  highlights?: HighlightRule[];
  /** Default icon per entity kind (kind → image URL/data-URI) for items without
   *  their own `icon`. Overrides the built-in agent/plugin glyphs. JS property. */
  kindIcons?: Record<string, string>;
}

/** Events fired by `<kai-composer>`. */
interface Events {
  /** The user submitted the composer (Enter or programmatic submit). */
  'kai-submit': { doc: ComposerDoc; text: string; entities: EntityRef[] };
  /** The content changed (fires on every input event). */
  'kai-value-change': { doc: ComposerDoc; text: string; entities: EntityRef[] };
  /** An entity pill was inserted into the composer. */
  'kai-entity-add': { entity: EntityRef };
  /** An entity pill was deleted from the composer. */
  'kai-entity-remove': { entity: EntityRef };
  /** A trigger character was detected at the caret (e.g. `/` or `@`). */
  'kai-trigger': { char: string; query: string; rect: DOMRect };
  /** The active trigger was dismissed (Escape, space, or outside click). */
  'kai-trigger-close': Record<string, never>;
  /** The composer gained focus. `focus`/`blur` are NOT composed natively, so they
   *  don't escape the shadow root; these re-expose them on the host. (For
   *  `keydown`/`paste`/`focusin`/`focusout`, listen NATIVELY on `<kai-composer>`:
   *  they're composed and already cross the shadow boundary.) */
  'kai-focus': { originalEvent: FocusEvent };
  /** The composer lost focus. */
  'kai-blur': { originalEvent: FocusEvent };
}

defineWebComponent<Props, Events>('kai-composer', {
  value: undefined,
  placeholder: undefined,
  disabled: false,
  loading: false,
  maxHeight: 240,
  submitOnEnter: true,
  triggers: undefined,
  highlights: undefined,
  kindIcons: undefined,
}, (props, { dispatch, flag, expose }) => {
  // Internal signal for uncontrolled value; when the consumer sets `value` as a
  // JS property the controlled path takes precedence (same pattern as prompt-input).
  const [internal, setInternal] = createSignal<string | ComposerDoc | undefined>(props.value);

  const current = () => props.value ?? internal();

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // Pattern C: the Composer component owns the editable + doc state and hands up
  // a controller; the facade captures it and exposes delegating methods. The
  // composer's own callbacks still fire (clear → onChange → kai-value-change;
  // send → onSubmit → kai-submit; insertEntity → onEntityAdd → kai-entity-add).
  let controller: ComposerController | undefined;
  expose({
    /** Focus the editable element. `focus`/`blur` are NOT composed natively, so a
     *  host-level focus() can't reach the editable inside the shadow root. This is
     *  the only way to focus the composer programmatically. */
    focus: (options?: FocusOptions) => controller?.focus(options),
    /** Blur the editable element. */
    blur: () => controller?.blur(),
    /** Empty the composer to a blank doc (resets the internal value + history
     *  baseline; fires kai-value-change). */
    clear: () => controller?.clear(),
    /** Submit the current content programmatically, on the same path as Enter
     *  (fires kai-submit). Named `send`, not `submit`, to match the shared
     *  vocabulary and avoid any submit collision. */
    send: () => controller?.send(),
    /** Insert an atomic entity pill (skill/agent/plugin) at the caret without
     *  typing a trigger (fires kai-entity-add). */
    insertEntity: (entity: EntityRef) => controller?.insertEntity(entity),
  });

  const handleChange = (change: ComposerChange) => {
    setInternal(change.doc);
    dispatch('kai-value-change', { doc: change.doc, text: change.text, entities: change.entities });
  };

  const handleSubmit = (change: ComposerChange) => {
    dispatch('kai-submit', { doc: change.doc, text: change.text, entities: change.entities });
  };

  return (
    <Composer
      value={current()}
      placeholder={props.placeholder}
      disabled={flag('disabled')}
      loading={flag('loading')}
      maxHeight={props.maxHeight as number | string | undefined}
      submitOnEnter={flag('submitOnEnter')}
      triggers={props.triggers}
      highlights={props.highlights}
      kindIcons={props.kindIcons as Record<string, string> | undefined}
      onChange={handleChange}
      onSubmit={handleSubmit}
      onEntityAdd={(entity) => dispatch('kai-entity-add', { entity })}
      onEntityRemove={(entity) => dispatch('kai-entity-remove', { entity })}
      onTrigger={(info) => dispatch('kai-trigger', info)}
      onTriggerClose={() => dispatch('kai-trigger-close', {})}
      onFocus={(e) => dispatch('kai-focus', { originalEvent: e })}
      onBlur={(e) => dispatch('kai-blur', { originalEvent: e })}
      controllerRef={(c) => (controller = c)}
    />
  );
});
