import { Show, createSignal, createEffect, onSettled, onCleanup, untrack, runWithOwner } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
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
import { hasParts } from './validate-messages';
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
 *  `theme` + `data-card-id` chrome, mirroring `<kai-cards>`'s `CardSlot` so a
 *  custom card behaves identically whether it arrives via `<kai-cards>` or a
 *  `card` message part here. */
function CardTagSlot(props: { tag: string; envelope: CardEnvelope; theme: string }): JSX.Element {
  let ref: HTMLElement | undefined;
  // V2-PORT: one stamping function, called from the REF (pre-upgrade — the
  // house rule: set WC props in ref callbacks) AND from the effect for later
  // envelope changes; mirrors <kai-cards>'s CardSlot. Seeding in the ref
  // matters under v2: the effect's apply lands AFTER the child's mount-time
  // effects, so an un-seeded child would transiently validate undefined data.
  const applyEnvelope = (el: HTMLElement, env: CardEnvelope, theme: string): void => {
    (el as unknown as { data: unknown }).data = env.data;
    (el as unknown as { cardId: string }).cardId = env.id;
    if (env.title != null) (el as unknown as { heading: string }).heading = env.title;
    (el as unknown as { resolution: unknown }).resolution = env.resolution;
    el.setAttribute('theme', theme);
    el.setAttribute('data-card-id', env.id);
  };
  // V2-PORT (R1): envelope/theme reads in the compute; the writes in the apply.
  createEffect(
    () => ({ env: props.envelope, theme: props.theme }),
    ({ env, theme }) => {
      if (ref) applyEnvelope(ref, env, theme);
    },
  );
  return (
    <Dynamic
      component={props.tag}
      ref={(el: HTMLElement) => { ref = el; untrack(() => applyEnvelope(el, props.envelope, props.theme)); }}
    />
  );
}

interface Props extends Record<string, unknown> {
  /** The full message object. Set as a JS property. */
  message?: ChatMessage;
  /** Who is speaking: `'user'` or `'assistant'`. Convenience for simple cases when
   *  not passing a `message` object.
   *
   *  This is the SEMANTIC role of the message, not an ARIA role. The name collides
   *  with the global ARIA `role` attribute, which is why the facade lifts it off
   *  the host (see `liftRoleOffHost`). Neither speaker is a valid ARIA role,
   *  so a `role="user"` left on `<kai-message>` is a CRITICAL axe `aria-roles`
   *  violation. The accessible role lives on the row inside the shadow root
   *  instead: `role="article"` plus an `aria-label` naming the speaker, matching
   *  the SolidJS `<Message>` component. */
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
}

/**
 * Move a `role` the consumer put on the host into the element's own prop store,
 * and off the DOM.
 *
 * `role` names the SPEAKER here (`'user'` / `'assistant'`) — the correct domain
 * word, and the documented attribute — but it is also the global ARIA `role`
 * attribute, and neither speaker is a valid ARIA role. Measured in a real chromium:
 * a host left carrying `role="user"` is a CRITICAL axe `aria-roles` violation
 * ("Role must be one of the valid ARIA roles: user"), and chromium discards the
 * unknown token and computes `generic`, so the row is left with no accessible role
 * and no accessible name rather than a mis-announced one.
 *
 * Capture the value, remove the attribute, then write it back as a PROPERTY.
 * component-register's prop accessors do not reflect, so the write cannot put it
 * back on the DOM, and it feeds the same reactive prop the facade already reads.
 *
 * The ORDER is load-bearing: `removeAttribute` fires component-register's
 * `attributeChangedCallback` with `null`, which sets the property to `null`. The
 * write-back has to come after that, or the scrub destroys the speaker it was
 * meant to preserve.
 *
 * NOTE — this covers every path where the attribute is still on the host by the
 * time the facade runs (`setAttribute` before or after connection, and any later
 * change, via the observer below). It does NOT cover an element authored in HTML
 * and upgraded at registration time: `defineWebComponent` installs its
 * non-reflecting `role` accessor AFTER `customElements.define()`, so for elements
 * already in the document the native ARIAMixin setter runs first in the constructor
 * (`this[prop] = undefined` → `role` is a nullable reflected IDL attribute →
 * `removeAttribute`) and the value is gone before any of this code executes. That
 * is a separate defect in `src/elements/define.tsx`, not something the facade can
 * reach; this function composes correctly with the fix once it lands.
 */
function liftRoleOffHost(element: HTMLElement): void {
  const attr = element.getAttribute('role');
  if (attr === null) return;
  element.removeAttribute('role');
  // V2-PORT: the prop assignment lands on component-register's signal-backed
  // setter, and this runs from the facade BODY — an owned scope where v2's dev
  // guard rejects writes. The write is the whole point here, so run it with no
  // owner (same value, same tick, guard satisfied).
  runWithOwner(null, () => {
    (element as unknown as { role?: string }).role = attr;
  });
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
  cardSchemas: undefined,
}, (props, { dispatch, flag, element, expose }) => {
  const outer = useChatConfig();
  // Do this FIRST, before anything reads `props.role`: it rewrites that prop as a
  // side effect of taking the invalid ARIA role off the host.
  liftRoleOffHost(element);
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
    if (hasParts(m)) return true;
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
  onSettled(() => {
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
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => observer.disconnect();
  });
  // A consumer can set `role` at any point after the element is live
  // (`el.setAttribute('role', 'user')`), which puts the invalid ARIA role back on
  // the host. Keep lifting it off. Scoped to the one attribute so this cannot be
  // mistaken for general attribute handling; no loop, because the write-back is a
  // property and the removal leaves nothing for the next callback to find.
  onSettled(() => {
    const roleObserver = new MutationObserver(() => liftRoleOffHost(element));
    roleObserver.observe(element, { attributes: true, attributeFilter: ['role'] });
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => roleObserver.disconnect();
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
      cardSchemas={props.cardSchemas}
      /* F-26: card parts emit off THIS element as the bubbling `kai-card` event. */
      cardHostElement={element}
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
            // `role` here is `<Message>`'s SPEAKER prop, not an ARIA role: the
            // component turns it into `role="article"` + an `aria-label` naming the
            // speaker, so the row an assistive technology sees has a valid role and
            // a name. This is the same treatment the SolidJS `<Message>` gets when
            // used directly — the facade just always knows its speaker, so unlike
            // the bare component (where `role` is optional and usually omitted) the
            // row is never left unlabelled.
            <Message
              role={msg().role}
              class={`${rowGroup()}${isUser() ? 'flex-col items-end' : 'flex-col items-start'}`}
            >
              {body()}
            </Message>
          }
        >
          <Message role={msg().role} class={rowGroup()}>
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
