import { createSignal, onCleanup, onMount } from 'solid-js';
import { defineWebComponent } from './define';
import { CHAT_SLOTS, readSlots } from './slots';
import { ChatThread, type ChatThreadProps, type ChatThreadContextUsage, type ChatThreadController } from '../components/chat-thread';
import { cardComponentsFromTags } from './message';
import { createMessagesGuard } from './validate-messages';
import type { AttachmentData } from '../components/attachments';
import type { RejectedAttachment } from './default-input';
import type { ChatMessage } from './chat-types';
import type { TriggerDef } from '../components/composer';
import type { ComposerDoc } from '../primitives/composer-model';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption, HomeConfig, HomeLinkEntry } from '../types';
import type { ConversationStore } from '../primitives/conversation-store';

type Props = Omit<ChatThreadProps,
  'class' | 'onValueChange' | 'onSubmit' | 'onAttachmentsChange' | 'onSuggestionClick' | 'onModelChange'
  | 'onMessageAction' | 'onWebSearch' | 'onVoice' | 'controllerRef' | 'cardTypes' | 'cardSchemas' | 'cardHostElement' | 'messages'
  | 'accept' | 'onAttachmentsRejected'
  // `conversations`/`store` are re-declared below (own doc comments, matching
  // this element's own attribute/property conventions) rather than left to
  // flow through `Omit`'s pass-through — same reason `messages` is excluded
  // above. Left unexcluded, the intersection carries TWO declarations of the
  // same property (the inherited `ChatThreadProps` one plus the re-declared
  // one below) and `gen-element-api.mjs` concatenates both JSDoc comments into
  // one duplicated, em-dash-laden description.
  | 'conversations' | 'store'
  // `home` is re-declared below for the same reason as `conversations`/`store`
  // above (own element-facing doc comment rather than the ChatThread-level one
  // flowing through `Omit`'s pass-through). `onHomeLink` is wired internally
  // (JSX prop on `<ChatThread>` below) as a dispatched `kai-home-link` event,
  // matching every other ChatThread callback on this element — same reasoning
  // as `onConversationLoad` just below.
  | 'home' | 'onHomeLink'
  // `onConversationLoad` is wired internally (below, JSX prop on
  // `<ChatThread>`) as a dispatched `kai-conversation-load` event — matching
  // every other ChatThread callback on this element — rather than left as a
  // settable JS property: a `JSX.Element`-shaped callback prop has no HTML-
  // consumer analogue the way `store`/`messages` do, and the kai- contract's
  // idiom for "this thread wants to tell you something" is already an event.
  // Excluded from `Props` for the same reason `onValueChange`/`onSubmit`/etc
  // are excluded above: it is not a property a consumer of `<kai-chat>` sets.
  | 'onConversationLoad'
  // `hostOpen`/`onUnreadChange` (unread indicators, 2026-08-26) are the SAME
  // "types without forwarding" trap as `onConversationLoad` above, for the
  // same reason: this facade does not read either off the host element and
  // forward it onto `<ChatThread>` below. Both exist for a caller composing
  // `ChatThread` directly as a Solid component with its OWN show/hide chrome
  // to report through `hostOpen` and its own sibling control (a `Dock`'s
  // `unread` badge) to mirror `onUnreadChange` onto — the construct engine's
  // emitted App is the motivating case (codegen.ts's `emitChatThreadUnreadProps`),
  // exactly like `headerEndContent`/`emptyContent` below. `<kai-chat>` has no
  // such sibling chrome of its own to report to or read from, so there is
  // nothing here for either prop to DO — left unexcluded, `gen-element-api.mjs`
  // would still type them into the public API and docs as settable properties
  // that silently do nothing when set.
  | 'hostOpen' | 'onUnreadChange'
  // `headerEndContent`/`emptyContent` are JSX.Element escape hatches for a caller
  // composing `ChatThread` directly as a Solid component (see their doc comments in
  // chat-thread.tsx — the construct-engine's emitted App is the motivating case).
  // `<kai-chat>` is the OPPOSITE shape: a custom element crossing the shadow-DOM
  // boundary, where a `JSX.Element` value cannot exist for a consumer to construct
  // (React/Vue/plain HTML have no such type) and the facade already has its own
  // working mechanism for both regions — `slot="header-end"` and `slot="empty"`.
  // Omitted here rather than left to flow through `Omit`'s default pass-through:
  // without this, `gen-element-api.mjs` picked them up and put a JSX.Element type
  // (which it stringifies as Solid's internal array-like union — meaningless to a
  // web-component consumer) into `<kai-chat>`'s public prop surface and docs.
  | 'headerEndContent' | 'emptyContent'> & Record<string, unknown> & {
    /** Which attachment media types the user may stage, in HTML `accept` syntax:
     *  `<kai-chat accept="image/*,application/pdf">`. A plain string, so unlike
     *  `messages` it DOES work as an attribute. Omitted means no filter.
     *
     *  MEDIA TYPES ONLY -- exact (`image/png`) or subtype wildcard (`text/*`).
     *  HTML allows a file extension here and this does not: `accept=".py"` THROWS
     *  with the entry named, rather than silently resolving to a picker that
     *  accepts nothing.
     *
     *  It can only NARROW what the kit can already encode: `accept="image/*"`
     *  resolves to the four image formats both APIs take, not to every image type
     *  the OS offers. Pass the SAME string to `toOpenAIMessages(msgs, { accept })`
     *  and the picker and the wire cannot disagree -- both resolve it through
     *  `resolveMediaPolicy` against one declaration. That declaration is readable
     *  as `encodableMediaTypes()` from `@kitn.ai/ui/wire`, if you would rather
     *  build your own picker than use this prop. */
    accept?: string;
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
    /** Turns on the prior-conversations list (a list-toggle button in the
     *  header, plus a second list view sharing the panel, C-1). Attribute-
     *  settable like every other boolean flag on this element:
     *  `<kai-chat conversations>`. Requires `store`. A row select, "new
     *  conversation," or the visitor's mount-time auto-restore all deliver
     *  their messages the same way: listen for `kai-conversation-load` and
     *  set `el.messages` from `event.detail.messages` (a fresh array): this
     *  element does not update `messages` for you. Set with no `store`, the
     *  underlying `ChatThread` decides loudly (one console.error) and stays
     *  visually off; this facade always supplies its own internal load
     *  handler (the `kai-conversation-load` dispatch below), so the second
     *  ChatThread guard, missing `onConversationLoad`, never trips here,
     *  even for a consumer who never listens for the event. Default false. */
    conversations?: boolean;
    /** The adapter this thread persists conversations through: an object of
     *  three functions (`list`/`load`/`save`; `ConversationStore`, exported
     *  from `@kitn.ai/ui`'s `primitives/conversation-store`). A JS PROPERTY
     *  ONLY: `el.store = myAdapter`. It can never be an attribute, since a
     *  function-bearing object has no HTML string form, the same reasoning
     *  that keeps `messages`/`cardSchemas` property-only (the kai- contract:
     *  array/object props are JS properties, never attributes). Two built-ins
     *  ship: `localStorageStore(name, userId?)` and `fetchStore(url, userId?)`. */
    store?: ConversationStore;
    /** Turns on the widget home screen (Intercom-pattern): the panel boots into
     *  a `home` view, with a greeting, most-recent-conversation card, a "new
     *  conversation" CTA, and host-defined links, plus a Home/Messages tab bar
     *  for switching back to the thread. An OBJECT, so it is a JS property only:
     *  `el.home = { greeting: { title: 'Hey' }, links: [...] }`, never an
     *  attribute (the kai- contract: array/object props are JS properties).
     *  A `links` entry with no `href` fires `kai-home-link` with that entry when
     *  tapped, rather than navigating; one WITH `href` opens it directly
     *  (only when the URL passes the kit's own scheme allowlist). Omit for the
     *  no-home widget (chat view only, unchanged). */
    home?: HomeConfig;
  };

interface Events {
  /** User submitted a message. */
  'kai-submit': { value: string; attachments: AttachmentData[] };
  /** Fired on every input change. */
  'kai-value-change': { value: string };
  /** The staged attachments changed (file added or removed). Carries the full
   *  current list so a consumer can react in real time. */
  'kai-attachments-change': { attachments: AttachmentData[] };
  /** One or more picked files were refused because `accept` excluded them. The
   *  element renders NO message of its own: it reports the facts (name, media
   *  type, whether the kit could have sent it) and what the user should see is
   *  the application's call. Only ever fires when `accept` is set. */
  'kai-attachments-rejected': { rejected: RejectedAttachment[] };
  /** A suggestion chip was clicked (only in `suggestion-mode="fill"`). */
  'kai-suggestion-click': { value: string };
  /** An action button on a message was clicked. `action` is the built-in name or
   *  custom id. `state` is present only for the toggleable feedback votes:
   *  `'on'` when a like/dislike is set, `'off'` when re-tapped to clear. */
  'kai-message-action': { messageId: string; action: string; state?: 'on' | 'off' };
  /** The header model switcher changed. */
  'kai-model-change': { modelId: string };
  /** The web-search (Globe) toolbar button was clicked. */
  'kai-web-search': Record<string, never>;
  /** The Mic / voice button was clicked. */
  'kai-voice': Record<string, never>;
  /** A conversation's history loaded: a row tap in the list, "new
   *  conversation," or the visitor's own mount-time auto-restore of their
   *  most recent thread (only fires when `conversations` is on and a `store`
   *  is set). `detail.id` is that conversation's id, `undefined` for the
   *  "new conversation" case (no id exists until the first message mints
   *  one, C-6). Set `el.messages = event.detail.messages` (already a fresh
   *  array) to actually render it, since this element does not do that for
   *  you; `messages` stays your own state like everywhere else on this
   *  element. */
  'kai-conversation-load': { id: string | undefined; messages: ChatMessage[] };
  /** A `home.links` entry with no `href` was activated (tapped/clicked/Enter).
   *  Meaningful only when `home` is set. */
  'kai-home-link': { entry: HomeLinkEntry };
}

defineWebComponent<Props, Events>('kai-chat', {
  messages: [], value: undefined, placeholder: 'Send a message...', loading: false,
  suggestions: undefined, suggestionMode: 'submit', persistSuggestions: false, proseSize: 'sm',
  codeTheme: 'github-dark-dimmed', codeHighlight: true, chatTitle: undefined,
  models: undefined, currentModel: undefined, context: undefined, scrollButton: true,
  attach: true, webSearch: false, voice: false, triggers: undefined, kindIcons: undefined,
  actionsReveal: 'always', cardTypes: undefined, cardSchemas: undefined, accept: undefined,
  reasoning: undefined, reasoningOpen: undefined, conversations: false, store: undefined,
  home: undefined,
}, (props, { dispatch, flag, reflectFlag, element, expose }) => {
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
  // reflectFlag, not a hand-rolled toggleAttribute effect: the reflection is what
  // makes the property read back `undefined`, so the two belong in one call. See
  // WebComponentContext.reflectFlag.
  reflectFlag('loading');

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
    scrollButton={props.scrollButton !== false} attach={flag('attach')} webSearch={flag('webSearch')} voice={flag('voice')}
    reasoning={props.reasoning as 'full' | 'compact' | 'off' | undefined}
    reasoningOpen={flag('reasoningOpen')}
    triggers={props.triggers as TriggerDef[] | undefined}
    kindIcons={props.kindIcons as Record<string, string> | undefined}
    actionsReveal={props.actionsReveal as 'always' | 'hover'}
    cardTypes={cardComponentsFromTags(props.cardTypes as Record<string, string> | undefined, (props as { theme?: string }).theme)}
    cardSchemas={props.cardSchemas as Record<string, object> | undefined}
    conversations={flag('conversations')}
    store={props.store as ConversationStore | undefined}
    onConversationLoad={(messages, id) => dispatch('kai-conversation-load', { id, messages })}
    home={props.home as HomeConfig | undefined}
    onHomeLink={(entry) => dispatch('kai-home-link', { entry })}
    /* F-26: card parts emit off THIS element as the bubbling `kai-card` event,
       so `listenForCardEvents(el)` / addEventListener('kai-card') work. */
    cardHostElement={element}
    onValueChange={(value) => dispatch('kai-value-change', { value })}
    onSubmit={(detail) => dispatch('kai-submit', detail)}
    accept={props.accept as string | undefined}
    onAttachmentsChange={(attachments) => dispatch('kai-attachments-change', { attachments })}
    onAttachmentsRejected={(rejected) => dispatch('kai-attachments-rejected', { rejected })}
    onSuggestionClick={(value) => dispatch('kai-suggestion-click', { value })}
    onModelChange={(modelId) => dispatch('kai-model-change', { modelId })}
    onMessageAction={(detail) => dispatch('kai-message-action', detail)}
    onWebSearch={() => dispatch('kai-web-search', {})}
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
