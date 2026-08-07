import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { CHAT_SLOTS, readSlots } from './slots';
import { ChatThread, type ChatThreadProps, type ChatThreadContextUsage, type ChatThreadController } from '../components/chat-thread';
import { cardComponentsFromTags } from './message';
import type { AttachmentData } from '../components/attachments';
import type { TriggerDef } from '../components/composer';
import type { ComposerDoc } from '../primitives/composer-model';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption } from '../types';

type Props = Omit<ChatThreadProps,
  'class' | 'onValueChange' | 'onSubmit' | 'onAttachmentsChange' | 'onSuggestionClick' | 'onModelChange'
  | 'onMessageAction' | 'onSearch' | 'onVoice' | 'controllerRef' | 'cardTypes'> & Record<string, unknown> & {
    /** Optional card type -> custom-element tag overrides/additions for `card`
     *  parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a
     *  plain string map (not the `CardTagMap` alias) so the generated React
     *  wrapper inlines it instead of emitting an unresolved named type. */
    cardTypes?: Record<string, string>;
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
  actionsReveal: 'always', cardTypes: undefined,
}, (props, { dispatch, flag, element, expose }) => {
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
    focus: (options?: FocusOptions) => controller?.focus(options),
    blur: () => (element.shadowRoot?.activeElement as HTMLElement | null)?.blur(),
    clear: () => controller?.clear(),
    send: () => controller?.send(),
    scrollToBottom: (behavior?: ScrollBehavior) => controller?.scrollToBottom(behavior),
  });

  return (
  <ChatThread
    messages={props.messages} value={props.value as string | ComposerDoc | undefined} placeholder={props.placeholder as string}
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
