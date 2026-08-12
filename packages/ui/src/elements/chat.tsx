import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { CHAT_SLOTS, readSlots } from './slots';
import { ChatThread, type ChatThreadProps, type ChatThreadContextUsage, type ChatThreadController } from '../components/chat-thread';
import { cardComponentsFromTags } from './message';
import { createMessagesGuard } from './validate-messages';
import type { AttachmentData } from '../components/attachments';
import type { ChatMessage } from './chat-types';
import type { TriggerDef } from '../components/composer';
import type { ComposerDoc } from '../primitives/composer-model';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption } from '../types';

type Props = Omit<ChatThreadProps,
  'class' | 'onValueChange' | 'onSubmit' | 'onAttachmentsChange' | 'onSuggestionClick' | 'onModelChange'
  | 'onMessageAction' | 'onSearch' | 'onVoice' | 'controllerRef' | 'cardTypes' | 'cardSchemas' | 'messages'> & Record<string, unknown> & {
    /** The full message thread to render, newest last. Each entry carries its
     *  role, ordered `parts`, and optional actions/avatar/feedback. Set as a JS
     *  property (`el.messages = [...]`); a NEW array reference per streaming
     *  chunk re-renders (mutating in place does not). Omit for an empty thread.
     *
     *  Re-declared here (rather than inherited from `ChatThreadProps`) because
     *  the ELEMENT registers a `[]` default and renders the empty state without
     *  it, while the SolidJS `<ChatThread>` component still requires it. The
     *  facade hands it a validated array either way. Matches `<kai-thread>`. */
    messages?: ChatMessage[];
    /** Optional card type -> custom-element tag overrides/additions for `card`
     *  parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a
     *  plain string map (not the `CardTagMap` alias) so the generated React
     *  wrapper inlines it instead of emitting an unresolved named type. */
    cardTypes?: Record<string, string>;
    /** JSON Schemas for the card types this app renders, keyed by envelope type. The
     *  companion of `cardTypes`, which says what DRAWS a card while this says what a
     *  VALID one looks like. An OBJECT, so it is a JS property only: `el.cardSchemas
     *  = { 'pricing-table': pricingSchema }`, never an attribute.
     *  `createCardRegistry(...).validationSchemas` is exactly this shape.
     *
     *  Without it the kit validates its own seven built-ins and leaves your own card
     *  type, the one your app actually cares about, as the only unchecked thing on
     *  screen. A schema here WINS over a built-in of the same name.
     *
     *  Typed `Record<string, object>` rather than `Record<string, JsonSchema>`
     *  deliberately: an imported `.json` schema widens `"type"` to `string`, and an
     *  authored one carries `$schema`/`title`/`description`/`additionalProperties`,
     *  so the tighter type would reject both of the normal ways to supply one. */
    cardSchemas?: Record<string, object>;
  };

interface Events {
  /** User submitted a message. */
  'kai-submit': { value: string; attachments: AttachmentData[] };
  /** Fired on every input change. */
  'kai-value-change': { value: string };
  /** The staged attachments changed (file added or removed). Carries the full
   *  current list so a consumer can react in real time. */
  'kai-attachments-change': { attachments: AttachmentData[] };
  /** A suggestion chip was clicked (only in `suggestion-mode="fill"`). */
  'kai-suggestion-click': { value: string };
  /** An action button on a message was clicked. `action` is the built-in name or
   *  custom id. `state` is present only for the toggleable feedback votes:
   *  `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. */
  'kai-message-action': { messageId: string; action: string; state?: 'on' | 'off' };
  /** The header model switcher changed. */
  'kai-model-change': { modelId: string };
  /** The Search button was clicked. */
  'kai-search': Record<string, never>;
  /** The Mic / voice button was clicked. */
  'kai-voice': Record<string, never>;
}

defineWebComponent<Props, Events>('kai-chat', {
  messages: [], value: undefined, placeholder: 'Send a message...', loading: false,
  suggestions: undefined, suggestionMode: 'submit', persistSuggestions: false, proseSize: 'sm',
  codeTheme: 'github-dark-dimmed', codeHighlight: true, chatTitle: undefined,
  models: undefined, currentModel: undefined, context: undefined, scrollButton: true,
  search: false, voice: false, triggers: undefined, kindIcons: undefined,
  actionsReveal: 'always', cardTypes: undefined, cardSchemas: undefined,
}, (props, { dispatch, flag, element, expose }) => {
  // `messages` is an untyped boundary: a consumer can hand it anything at
  // runtime (a pre-0.20.0 `{ id, role, content }` array, in particular). Skip
  // the invalid entries rather than let `groupMessageParts` throw deep inside a
  // render pass, which would blank the whole chat instead of one message.
  const validMessages = createMessagesGuard('kai-chat');

  // Slot detection is driven by the CHAT_SLOTS registry (single source of truth)
  // so slot names never drift between the view, the facade, and the docs.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  const slot = (name: string) => slots()[name] === true;
  onMount(() => {
    const read = () => setSlots(readSlots(element, CHAT_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    onCleanup(() => observer.disconnect());
  });

  // Reflect streaming state to a host attribute so slotted composer/notice CSS
  // can react without reading internals (e.g. :host([loading]) ::slotted(...)).
  createEffect(() => { element.toggleAttribute('loading', flag('loading')); });

  // Imperative method API — forward the chat-thread controller onto the host
  // (focus the composer, clear it, send programmatically, scroll the thread).
  let controller: ChatThreadController | undefined;
  expose({
    /** Focus the composer, meaning the contenteditable (or textarea) inside the
     *  shadow root. A native `focus()` on the host lands on the host itself and
     *  never reaches it, so this is the only way to focus the input
     *  programmatically. */
    focus: (options?: FocusOptions) => controller?.focus(options),
    /** Blur whatever currently holds focus inside the shadow root. The companion
     *  to `focus()`, for the same reason: a native `blur()` on the host misses
     *  the real focus target. */
    blur: () => (element.shadowRoot?.activeElement as HTMLElement | null)?.blur(),
    /** Empty the COMPOSER: drops the draft text and every staged attachment, then
     *  fires `kai-value-change` with `''`. It does NOT touch the thread. `messages`
     *  is the consumer's own state, so clearing history stays the consumer's call. */
    clear: () => controller?.clear(),
    /** Submit whatever the composer currently holds, on the same path as Enter or
     *  the send button: fires `kai-submit` with that value plus the staged
     *  attachments, then drops the attachments. It takes no argument, so to send
     *  text the user never typed, set `el.value` first. There is no empty-check,
     *  so an empty composer still fires. The draft is cleared afterwards only when
     *  `value` is uncontrolled; a controlled host owns its value and clears it
     *  itself. Named `send`, not `submit`, to match the shared vocabulary. */
    send: () => controller?.send(),
    /** Scroll the message viewport to the newest message. Defaults to `'smooth'`;
     *  pass `'instant'` to jump without animating. */
    scrollToBottom: (behavior?: ScrollBehavior) => controller?.scrollToBottom(behavior),
  });

  return (
  <ChatThread
    messages={validMessages(props.messages)} value={props.value as string | ComposerDoc | undefined} placeholder={props.placeholder as string}
    loading={flag('loading')} suggestions={props.suggestions as string[] | undefined}
    suggestionMode={props.suggestionMode as 'submit' | 'fill'} persistSuggestions={flag('persistSuggestions')}
    proseSize={props.proseSize as ProseSize}
    codeTheme={props.codeTheme as string} codeHighlight={flag('codeHighlight')}
    chatTitle={props.chatTitle as string | undefined} models={props.models as ModelOption[] | undefined}
    currentModel={props.currentModel as string | undefined} context={props.context as ChatThreadContextUsage | undefined}
    scrollButton={props.scrollButton !== false} search={flag('search')} voice={flag('voice')}
    triggers={props.triggers as TriggerDef[] | undefined}
    kindIcons={props.kindIcons as Record<string, string> | undefined}
    actionsReveal={props.actionsReveal as 'always' | 'hover'}
    cardTypes={cardComponentsFromTags(props.cardTypes as Record<string, string> | undefined, (props as { theme?: string }).theme)}
    cardSchemas={props.cardSchemas as Record<string, object> | undefined}
    onValueChange={(value) => dispatch('kai-value-change', { value })}
    onSubmit={(detail) => dispatch('kai-submit', detail)}
    onAttachmentsChange={(attachments) => dispatch('kai-attachments-change', { attachments })}
    onSuggestionClick={(value) => dispatch('kai-suggestion-click', { value })}
    onModelChange={(modelId) => dispatch('kai-model-change', { modelId })}
    onMessageAction={(detail) => dispatch('kai-message-action', detail)}
    onSearch={() => dispatch('kai-search', {})}
    onVoice={() => dispatch('kai-voice', {})}
    controllerRef={(c) => (controller = c)}
    headerStart={slot('header-start')}
    headerEnd={slot('header-end')}
    headerFull={slot('header')}
    sidebar={slot('sidebar')}
    empty={slot('empty')}
    composer={slot('composer')}
    composerActions={slot('composer-actions')}
    footer={slot('footer')}
  />
  );
});
