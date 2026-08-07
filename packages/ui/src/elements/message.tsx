import { Show, createSignal, createEffect, onMount, onCleanup, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { defineWebComponent } from './define';
import { readSlots, MESSAGE_SLOTS } from './slots';
import { ChatConfig, useChatConfig, type ProseSize } from '../primitives/chat-config';
import { Message, MessageAvatar, MessageBody } from '../components/message';
import { createMessageFeedback } from '../primitives/message-feedback';
import {
  mergeCardTags,
  BUILTIN_CARD_TAGS,
  BUILTIN_CARD_COMPONENTS,
  type CardTagMap,
  type CardComponentMap,
} from '../primitives/card-registry';
import type { CardEnvelope } from '../primitives/card-contract';
import type { ChatMessage } from './chat-types';

/**
 * Bridges the web-component-facing `cardTypes` (envelope type -> custom-element
 * TAG name, e.g. `{ 'my-widget': 'my-widget-el' }`) into the `CardComponentMap`
 * that `MessageBody`/`Thread` expect. A type the consumer did NOT override keeps
 * rendering its built-in Solid component directly (no extra custom-element
 * indirection); an overridden built-in or a brand-new consumer type renders as a
 * dynamically-created custom element instead, mirroring `<kai-cards>`'s
 * `CardSlot`. A type with no tag at all (unregistered) simply gets no entry, so
 * `CardRenderer`'s own fallback (`CardFallback`) takes over.
 */
export function cardComponentsFromTags(types?: CardTagMap, theme = 'auto'): CardComponentMap {
  const tags = mergeCardTags(types);
  const map: CardComponentMap = {};
  for (const type of Object.keys(tags)) {
    const tag = tags[type];
    map[type] = tag === BUILTIN_CARD_TAGS[type] && BUILTIN_CARD_COMPONENTS[type]
      ? BUILTIN_CARD_COMPONENTS[type]
      : (p) => <CardTagSlot tag={tag} envelope={p.envelope} theme={theme} />;
  }
  return map;
}

/** Renders one envelope as a dynamically-created custom element, setting the
 *  envelope's data/id/title/resolution as DOM properties (reactive) plus the
 *  `theme` + `data-card-id` chrome — mirrors `<kai-cards>`'s `CardSlot` so a
 *  custom card behaves identically whether it arrives via `<kai-cards>` or a
 *  `card` message part here. */
function CardTagSlot(props: { tag: string; envelope: CardEnvelope; theme: string }): JSX.Element {
  let ref: HTMLElement | undefined;
  createEffect(() => {
    if (!ref) return;
    (ref as unknown as { data: unknown }).data = props.envelope.data;
    (ref as unknown as { cardId: string }).cardId = props.envelope.id;
    if (props.envelope.title != null) (ref as unknown as { heading: string }).heading = props.envelope.title;
    (ref as unknown as { resolution: unknown }).resolution = props.envelope.resolution;
    ref.setAttribute('theme', props.theme);
    ref.setAttribute('data-card-id', props.envelope.id);
  });
  return <Dynamic component={props.tag} ref={ref} />;
}

interface Props extends Record<string, unknown> {
  /** The full message object. Set as a JS property. */
  message?: ChatMessage;
  /** Convenience for simple cases when not passing a `message` object. */
  role?: 'user' | 'assistant';
  /** Force markdown on/off. Defaults to on for assistant, off for user. */
  markdown?: boolean;
  /** Text/markdown sizing for the message body. */
  proseSize?: ProseSize;
  /** Shiki theme name used for fenced code blocks in the content. */
  codeTheme?: string;
  /** Disable syntax highlighting for code blocks (no Shiki loads). */
  codeHighlight?: boolean;
  /** Whether the action bar is always visible (`'always'`, default) or only
   *  revealed on hover of the message row (`'hover'`). */
  actionsReveal?: 'always' | 'hover';
  /** Convenience avatar image URL (used when `message.avatar` is not set). */
  avatarSrc?: string;
  /** Convenience avatar fallback text (used when `message.avatar` is not set). */
  avatarFallback?: string;
  /** Avatar rail mode. `'none'` omits the avatar rail entirely so the body spans
   *  the full row (predictable layout when you never show avatars). Any other
   *  value keeps the default behaviour: the built-in avatar when one resolves, or
   *  your `slot="avatar"` content when projected (which REPLACES the built-in). */
  avatar?: 'none' | string;
  /** Optional card type -> custom-element tag overrides/additions for `card`
   *  parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a
   *  plain string map (not the `CardTagMap` alias) so the generated React
   *  wrapper inlines it instead of emitting an unresolved named type. */
  cardTypes?: Record<string, string>;
}

/** Events fired by `<kai-message>`. */
interface Events {
  /** An action button was clicked. `action` is the built-in name or custom id.
   *  `state` is present only for the toggleable feedback votes: `'on'` when a
   *  like/dislike is set, `'off'` when re-tapped to clear. */
  'kai-message-action': { messageId: string; action: string; state?: 'on' | 'off' };
}

/**
 * `<kai-message>` — a single message row: markdown/plain content, reasoning,
 * tool calls, attachments, and action buttons, rendered from one `message`
 * object (the same shape `<kai-chat>` uses per message). The keystone of the
 * "compose your own message list" pattern. Emits `kai-message-action`.
 */
defineWebComponent<Props, Events>('kai-message', {
  message: undefined,
  role: 'assistant',
  markdown: undefined,
  proseSize: 'sm',
  codeTheme: 'github-dark-dimmed',
  codeHighlight: true,
  actionsReveal: 'always',
  avatarSrc: undefined,
  avatarFallback: undefined,
  avatar: undefined,
  cardTypes: undefined,
}, (props, { dispatch, flag, element, expose }) => {
  const outer = useChatConfig();
  const msg = (): ChatMessage =>
    props.message ?? {
      id: 'message',
      role: props.role ?? 'assistant',
      parts: [],
    };
  // `message` is an untyped boundary: a consumer can hand it anything at
  // runtime (a pre-0.20.0 `{ id, role, content }` object, in particular).
  // `parts` is a REQUIRED field, so validate it here rather than let
  // `MessageBody`/`groupMessageParts` throw deep inside a Solid render pass;
  // an uncaught exception there blanks the whole element instead of just this
  // one message. Warn once per bad message (not on every unrelated re-render)
  // and render nothing for it, matching the old pre-parts fallback behavior
  // (an unusable message rendered an empty body, not a crash).
  let lastWarnedMessage: unknown;
  const hasValidParts = (): boolean => {
    const m = msg();
    if (Array.isArray(m.parts)) return true;
    if (m !== lastWarnedMessage) {
      lastWarnedMessage = m;
      console.error(
        "<kai-message>: 'message' must have a 'parts' array. The 'content' string field was removed in 0.20.0.",
      );
    }
    return false;
  };
  // Copy + vote state lives here (above the rendered body) so it survives a
  // re-render when the host swaps in a fresh `message` object during streaming.
  const feedback = createMessageFeedback({
    emit: (detail) => dispatch('kai-message-action', detail),
    // No `target`: a STANDALONE <kai-message> must not anchor its copy/feedback
    // toast to the individual message (that lands mid-thread in a compose-your-own
    // list). Let them route to the global region (top of the viewport), which is
    // where a confirmation belongs across a hand-built thread. (Inside <kai-chat>
    // the chat owns feedback and targets ITSELF, so in-chat toasts still stay in-chat.)
  });

  // Imperative method API — `copy()` runs the exact path of the built-in copy
  // action (`feedback.handleAction(msg, 'copy')`): writes the content to the
  // clipboard, shows the transient copied-check on the bar, and emits
  // `kai-message-action{action:'copy'}`.
  expose({
    /** Copy the message content to the clipboard and show the copied check. */
    copy: () => { if (hasValidParts()) feedback.handleAction(msg(), 'copy'); },
  });

  // Read declarative <kai-action> children from light DOM.
  // Shadow DOM with no <slot> suppresses them visually — they're invisible data carriers.
  const [slottedActions, setSlottedActions] = createSignal<import('../elements/chat-types').CustomAction[]>([]);
  // Which composition slots (before-body / after-body / avatar) the consumer filled.
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => {
      const nodes = [...element.querySelectorAll('kai-action')];
      setSlottedActions(nodes.map(n => ({
        id: n.id || n.getAttribute('action') || '',
        label: n.textContent?.trim() || n.getAttribute('label') || n.id || '',
        icon: n.getAttribute('icon') ?? undefined,
        tooltip: n.getAttribute('tooltip') ?? undefined,
      })));
      setSlots(readSlots(element, MESSAGE_SLOTS));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, attributes: true, subtree: true });
    onCleanup(() => observer.disconnect());
  });
  const isUser = () => msg().role === 'user';
  const avatar = () =>
    msg().avatar ??
    (props.avatarSrc || props.avatarFallback
      ? { src: props.avatarSrc as string | undefined, fallback: props.avatarFallback as string | undefined }
      : undefined);
  // Avatar rail state. `avatar="none"` omits the rail; a filled `slot="avatar"`
  // REPLACES the built-in; otherwise the built-in renders when one resolves.
  const noAvatar = () => props.avatar === 'none';
  const hasAvatarSlot = () => !!slots()['avatar'];
  // The rail shows when not suppressed and there's either a slot or a resolved avatar.
  const showRail = () => !noAvatar() && (hasAvatarSlot() || !!avatar());
  const reveal = () => (props.actionsReveal === 'hover' ? 'hover' : 'always');
  // markdown: explicit prop/attribute wins; otherwise default by role.
  const markdownExplicit = () =>
    element.hasAttribute('markdown') || props.markdown === true || props.markdown === false;
  const useMarkdown = () => (markdownExplicit() ? flag('markdown') : !isUser());

  const mergedActions = () => [...(msg().actions ?? []), ...slottedActions()];
  const body = () => (
    <MessageBody
      parts={msg().parts}
      cardTypes={cardComponentsFromTags(props.cardTypes, (props as { theme?: string }).theme)}
      isUser={isUser()}
      markdown={useMarkdown()}
      actions={mergedActions()}
      actionsReveal={reveal()}
      activeFeedback={feedback.resolveFeedback(msg())}
      copied={feedback.isCopied(msg().id)}
      onAction={(action) => feedback.handleAction(msg(), action)}
      beforeBody={slots()['before-body'] ? <slot name="before-body" /> : undefined}
      afterBody={slots()['after-body'] ? <slot name="after-body" /> : undefined}
    />
  );

  // Row carries `group` so a hover-revealed action bar fades in on row hover.
  const rowGroup = () => (reveal() === 'hover' ? 'group ' : '');

  // The avatar rail: a filled `slot="avatar"` REPLACES the built-in MessageAvatar
  // (the consumer owns that node, wrapped in `part="avatar"` so it's still
  // styleable + consistent with the built-in part name).
  const avatarRail = () => (
    <Show
      when={hasAvatarSlot()}
      fallback={
        <Show when={avatar()}>
          {(av) => <MessageAvatar src={av().src ?? ''} alt={av().alt ?? ''} fallback={av().fallback} />}
        </Show>
      }
    >
      <div part="avatar" class="shrink-0">
        <slot name="avatar" />
      </div>
    </Show>
  );

  return (
    // No fallback: an invalid `message` (missing `parts`) renders nothing for
    // this element rather than crashing. `hasValidParts()` already logged why.
    <Show when={hasValidParts()}>
      <ChatConfig
        proseSize={props.proseSize}
        codeTheme={props.codeTheme}
        codeHighlight={flag('codeHighlight')}
        portalMount={outer.portalMount()}
      >
        <Show
          when={showRail()}
          fallback={
            <Message class={`${rowGroup()}${isUser() ? 'flex-col items-end' : 'flex-col items-start'}`}>
              {body()}
            </Message>
          }
        >
          <Message class={rowGroup()}>
            {avatarRail()}
            <div class={`flex min-w-0 flex-1 flex-col ${isUser() ? 'items-end' : 'items-start'}`}>
              {body()}
            </div>
          </Message>
        </Show>
      </ChatConfig>
    </Show>
  );
});
