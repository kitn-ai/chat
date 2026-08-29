import { createSignal, createEffect, createComputed, createMemo, For, Show, Switch, Match, onMount, untrack } from 'solid-js';
import { ChatConfig, useChatConfig } from '../primitives/chat-config';
import { type ComposerDoc, normalizeValue, serializeToText } from '../primitives/composer-model';
import { ChatContainer, ChatContainerContent, ChatContainerScrollAnchor } from './chat-container';
import { Message, MessageAvatar, MessageBody } from './message';
import { type AttachmentData } from './attachments';
import { createMessageFeedback, type MessageActionDetail } from '../primitives/message-feedback';
import { ModelSwitcher } from './model-switcher';
import { ScrollButton } from './scroll-button';
import {
  Context, ContextTrigger, ContextContent, ContextContentHeader,
  ContextContentBody, ContextContentFooter, ContextInputUsage, ContextOutputUsage,
} from './context';
import { DefaultPromptInput, type RejectedAttachment } from '../elements/default-input';
import type { MediaTypeFilter } from '../wire/media-types';
import type { TriggerDef } from './composer';
import type { ChatMessage, ChatMessageAction, CustomAction } from '../elements/chat-types';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption } from '../types';
import type { CardComponentMap } from '../primitives/card-registry';
import type { CardSchemaMap } from './card-renderer';
import type { JSX } from 'solid-js';
import type { ConversationStore } from '../primitives/conversation-store';
import { byRecency } from '../primitives/conversation-store';
import { ConversationPanel } from './conversation-panel';
import { isConversationUnread } from './conversation-item';
import type { ConversationSummary } from '../types';
import { MessagesSquare, ArrowLeft } from 'lucide-solid';
import { Button } from '../ui/button';
import { HomePanel } from './home-panel';
import { WidgetTabBar } from './widget-tab-bar';
import type { HomeConfig, HomeLinkEntry } from '../types';

export interface ChatThreadContextUsage {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

export interface ChatThreadProps {
  /** Extra classes for the thread root (e.g. `h-full`). */
  class?: string;
  /** The full message thread to render, newest last. Each entry carries its role,
   *  ordered `parts`, and optional actions/avatar/feedback. Set as a JS property
   *  (`el.messages = [...]`). */
  messages: ChatMessage[];
  /** Add/override card type -> component entries, forwarded to `CardRenderer`
   *  for `card` parts. */
  cardTypes?: CardComponentMap;
  /** JSON Schemas for the card types this app renders, keyed by envelope type,
   *  forwarded to `CardRenderer` for `card` parts. The companion of `cardTypes`:
   *  that says what DRAWS a card, this says what a VALID one looks like.
   *  `createCardRegistry(...).validationSchemas` is exactly this shape. Without it
   *  the kit checks its own seven built-ins and leaves your own card type
   *  unvalidated. A schema here WINS over a built-in of the same name. */
  cardSchemas?: CardSchemaMap;
  /** The custom-element host node to emit card events off when no `CardProvider`
   *  is present, forwarded through `MessageBody` to `CardRenderer`. The
   *  element facades pass their own host element so card events leave as the
   *  bubbling `kai-card` CustomEvent. */
  cardHostElement?: HTMLElement;
  /** Value of the input. A **string** is controlled (the host owns the text and
   *  updates it on `kai-value-change`). A **ComposerDoc** is a one-time seed that
   *  pre-populates pills; the user then edits freely. Leave unset for uncontrolled. */
  value?: string | ComposerDoc;
  /** Placeholder text shown in the empty input. */
  placeholder?: string;
  /** When true, shows the loading/streaming state and disables submit (use while
   *  awaiting the assistant's reply). */
  loading?: boolean;
  /** Starter prompts shown above the input when the thread is empty. Clicking one
   *  follows `suggestionMode`. Set as a JS property. */
  suggestions?: string[];
  /** What clicking a suggestion does: `'submit'` (default) sends it immediately
   *  as if typed and submitted; `'fill'` just places it in the input. */
  suggestionMode?: 'submit' | 'fill';
  /** Keep suggestions visible after the conversation starts. By default
   *  suggestions are conversation starters and hide once `messages` is
   *  non-empty; set this to keep them always shown. Default false. */
  persistSuggestions?: boolean;
  /** Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`).
   *  Defaults to `'sm'`. */
  proseSize?: ProseSize;
  /** Shiki theme name for syntax-highlighted code blocks (e.g.
   *  `'github-dark-dimmed'`). */
  codeTheme?: string;
  /** Enable Shiki syntax highlighting in code blocks. Turn off to render plain
   *  `<pre>` blocks (lighter, no highlighter load). Default true. */
  codeHighlight?: boolean;
  /** How `reasoning` parts render across the thread. `'full'` (default) is the
   *  current collapsible-disclosure behavior; `'compact'` shows only a shimmer
   *  loader while a reasoning part streams and nothing once it settles (no
   *  expandable detail); `'off'` renders reasoning parts not at all. Forwarded
   *  to every `MessageBody` as `reasoningMode`. */
  reasoning?: 'full' | 'compact' | 'off';
  /** Seeds the reasoning disclosure open AND keeps it tracking the stream
   *  (open while streaming, closes when it settles): the pre-Task-19f `full`
   *  behavior. Default false/absent: the panel starts closed (just the
   *  "Thinking" shimmer chip) and only opens on click, the current default
   *  (owner ruling, 2026-08-26). Meaningless when `reasoning` is `'compact'`
   *  or `'off'`. Forwarded to every `MessageBody` as `reasoningDefaultOpen`. */
  reasoningOpen?: boolean;
  /** Optional header title shown on the left of the header. */
  chatTitle?: string;
  /** Optional model list. When set (>1 model) a ModelSwitcher is shown in the
   *  header and a `kai-model-change` event fires on selection. */
  models?: ModelOption[];
  /** The currently selected model id (pairs with `models`). */
  currentModel?: string;
  /** Optional context-window token usage. When set, a Context token meter is
   *  shown in the header. */
  context?: ChatThreadContextUsage;
  /** Show the scroll-to-bottom button inside the scroll area. Default true. */
  scrollButton?: boolean;
  /** Whether the host has `slot="header-start"` content (left of the title). Set
   *  by the `<kai-chat>` facade so a custom control forces the header open. */
  headerStart?: boolean;
  /** Whether the host has `slot="header-end"` content (right of the controls). */
  headerEnd?: boolean;
  /** Extra content rendered in the header-end region, AFTER `slot="header-end"`.
   *  This is a JSX escape hatch for a caller composing `ChatThread` directly as a
   *  Solid component (no shadow-DOM host, so there is no light-DOM node to slot) —
   *  the `kai-dock`-docked construct widget is the motivating case: it needs its
   *  own close affordance to sit IN the header row, sharing it with the title
   *  instead of floating as a second control with no visible relationship to the
   *  chat surface. Renders alongside the named slot rather than replacing it, so a
   *  real `slot="header-end"` consumer and this prop can both be present. Counts
   *  toward `showHeader()` the same as `headerEnd`, so a construct with no title
   *  and only this content still gets a header row to sit in. */
  headerEndContent?: JSX.Element;
  /** Turns on the prior-conversations list: a list-toggle button appears in
   *  the header row and the panel gains a second, list, view (C-1 — one
   *  panel, two states, never a persistent sidebar). Off by default, same
   *  convention as every other capability in this file. Requires BOTH
   *  `store` AND `onConversationLoad` — the second is the only path a caller
   *  has to actually receive a loaded conversation's messages back (this
   *  component never mutates `props.messages` itself). Set with either
   *  missing, the feature decides loudly (one `console.error` on mount) and
   *  stays visually off rather than throwing or silently going inert: a
   *  `store` with no `onConversationLoad` would otherwise make row-select/
   *  new/restore fire and do nothing visible, and mount's own auto-restore
   *  would still stamp an active conversation id that the save effect could
   *  then clobber with whatever `props.messages` the caller drives in next. */
  conversations?: boolean;
  /** The adapter this thread persists through when `conversations` is on:
   *  `list()` on mount and on every list-view open, `load(id)` on row select,
   *  `save(id, messages)` on every message-array change for the active
   *  conversation. A kit-owned INTERFACE (C-3) — the dev owns invocation,
   *  transport, auth and retention entirely; `localStorageStore`/`fetchStore`
   *  (`@kitn.ai/ui`'s `primitives/conversation-store`) are the shipped
   *  built-ins. Set as a JS property; never expressible as an attribute (an
   *  adapter is a live object of functions, not scalar data). */
  store?: ConversationStore;
  /** Fires whenever `load(id)` resolves and this thread's `messages` are
   *  about to be replaced with that conversation's history — the hook a
   *  caller uses to actually own and re-render `messages` (this component
   *  does not mutate `props.messages` itself; C-8 keeps the state machine
   *  here but the message ARRAY stays the caller's own state, matching every
   *  other prop in this file). The second argument is the conversation's id
   *  — `undefined` for the "new conversation" case (C-6: no id exists until
   *  the first message mints one). Required whenever `conversations` is on;
   *  see that prop's own doc for the guard this component runs without it. */
  onConversationLoad?: (messages: ChatMessage[], id?: string) => void;
  /** Whether the surrounding chrome that HOSTS this thread is currently
   *  VISIBLE to the visitor — e.g. a docked widget's open/closed state.
   *  `ChatThread` has no knowledge of whatever hosts it (a `Dock`, a plain
   *  page, anything — same boundary `closeConversationsList` documents), so
   *  this is the seam: a host that can hide itself sets it, everyone else
   *  leaves it unset.
   *
   *  Meaningful only when `conversations` is on, where it's the third leg of
   *  "seen" (owner round, 2026-08-26 — unread indicators): the active
   *  conversation counts as seen, and gets `store.markRead` called for it,
   *  only while it's ALSO the active conversation AND the chat view (not the
   *  list) is showing AND this is true. Undeclared/`true` (the default) means
   *  "always visible" — correct for every layout with no show/hide concept at
   *  all (fullscreen/aside/split/custom) and for any widget consumer that
   *  doesn't wire it, which just means unread never distinguishes "closed"
   *  from "open" for them (a smaller inaccuracy than the alternative: without
   *  this leg, a message arriving to the active conversation while the
   *  widget is actually closed would get silently marked read behind the
   *  visitor's back, purely because it happened to be the active id). */
  hostOpen?: boolean;
  /** Fires whenever "is any OTHER conversation (not the active one) unread"
   *  changes — the value this thread already renders as a dot on its own
   *  header toggle, reported outward so a sibling control with no view into
   *  `ChatThread`'s internal conversation-summary state (a `Dock`'s own
   *  `unread` prop, say) can mirror it. Only meaningful with `conversations`
   *  on; never fires otherwise. */
  onUnreadChange?: (unread: boolean) => void;
  /** Turns on the widget home screen (Intercom-pattern, H-1/H-2): the panel
   *  boots into a `home` view — greeting, most-recent-conversation card, a
   *  "new conversation" CTA, and host-defined links — with a Home/Messages
   *  tab bar beneath the content area. The prior-conversations list moves
   *  from the header toggle onto the Messages tab (H-2); a drilled-into chat
   *  (from a list row, the recent card, or "new conversation") hides the tab
   *  bar and shows a back arrow in the header instead. Off by default: unset,
   *  the widget renders byte-for-byte as it does today. */
  home?: HomeConfig;
  /** Fires when a `home.links` entry with no `href` is activated (an
   *  `href`-bearing entry navigates as a real anchor instead — see
   *  `HomePanelProps.onLink`). Meaningful only when `home` is set. */
  onHomeLink?: (entry: HomeLinkEntry) => void;
  // ── Composition slots ─────────────────────────────────────────────────────
  // Each flag below is set by the `<kai-chat>` facade when matching light-DOM
  // `slot="…"` content is projected, and gates one composition slot. Two kinds:
  //   • INJECT  — additive: project YOUR markup into a region (sidebar, footer,
  //               composer-actions, header-start/-end).
  //   • REPLACE — substitutive: your markup stands in for a whole region
  //               (header, empty, composer). A replaced region's projected
  //               content owns its own data/events — a slotted (light-DOM) node
  //               can't read this component's reactive state. That boundary is
  //               the whole reason `messages` stays a data prop, not a slot.
  /** REPLACE: full custom header in place of the built-in title/model/context bar. */
  headerFull?: boolean;
  /** INJECT: left sidebar column (e.g. a conversation list / your own nav). */
  sidebar?: boolean;
  /** REPLACE: custom zero-state rendered in the message area while the thread is empty (replaces the empty message list only; the composer and its suggestions still render). */
  empty?: boolean;
  /** REPLACE, JSX form: the empty-state content itself, for a caller composing
   *  `ChatThread` directly as a Solid component rather than through the `<kai-chat>`
   *  shadow-DOM boundary that `empty`/`slot="empty"` targets. Renders INSIDE this
   *  component's own tree — so a caller passing the kit's own `<Empty>` composition
   *  (`components/empty.tsx`) gets it fully styled by the adopted stylesheet, unlike
   *  `slot="empty"`: that slot only ever receives LIGHT-DOM children of the shadow
   *  HOST, and light-DOM nodes are outside the shadow root's adopted stylesheets, so
   *  Tailwind-utility-class content projected there renders bare. Takes priority
   *  over `empty`/`slot="empty"` when both are set — the two are alternate delivery
   *  mechanisms for the same region, not additive like `headerEndContent`. */
  emptyContent?: JSX.Element;
  /** REPLACE: full custom composer in place of the built-in prompt input. The
   *  projected content wires its own submit (the data-flow boundary). */
  composer?: boolean;
  /** INJECT: accessory row just above the composer (e.g. extra actions). */
  composerActions?: boolean;
  /** INJECT: footer row below the composer (disclaimers, token meter, …). */
  footer?: boolean;
  /** Which attachment media types the user may stage, in HTML `accept` syntax
   *  (`'image/*,application/pdf'`). Omitted means no filter. Narrowed by what the
   *  encoders can actually send — the same string, and the same resolver, as
   *  `toOpenAIMessages(msgs, { accept })`. */
  accept?: MediaTypeFilter;
  /** Files the composer refused because `accept` excluded them. */
  onAttachmentsRejected?: (rejected: RejectedAttachment[]) => void;
  /** When `false`, hides the built-in paperclip attach button. Defaults to
   *  `true` (undeclared keeps today's behavior: attach visible), matching
   *  `DefaultPromptInput`'s own default: only an explicit `false` hides it. */
  attach?: boolean;
  /** Show a web-search (Globe) button in the input toolbar; calls `onWebSearch`. */
  webSearch?: boolean;
  /** Show a Voice (Mic) button in the input toolbar; fires a `voice` event. */
  voice?: boolean;
  /** Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored
   *  menu that inserts an atomic pill (`/` skills, `@` agents/plugins). Set as a
   *  JS property; forwarded to the input. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image src) for pills/menu items. */
  kindIcons?: Record<string, string>;
  /** Whether each message's action bar is always visible (`'always'`, default)
   *  or only revealed on hover of that message row (`'hover'`). */
  actionsReveal?: 'always' | 'hover';
  /** Role-scoped DEFAULT action bars (B-7b): a user message with no `actions`
   *  of its own gets `userActions`; an assistant message, `assistantActions`.
   *  A per-message `m.actions` OVERRIDES the role default (replace, not
   *  merge), so a message that sets `actions: []` renders NO action bar even
   *  when a role default is set. Set as JS properties. */
  userActions?: (ChatMessageAction | CustomAction)[];
  /** See `userActions`, the assistant-role default. */
  assistantActions?: (ChatMessageAction | CustomAction)[];
  /** Hide the citations row consecutive `source` parts collapse into
   *  (`part="citations"`, message.tsx). Named as a HIDE, not `sources:
   *  boolean`, so absence-means-default stays unambiguous: absent/false is
   *  today's rendering, byte-for-byte (B-8). */
  hideSources?: boolean;
  /** JSX rendered immediately BEFORE the composer region — the `emptyContent`
   *  escape-hatch pattern verbatim (plain JSX handed down inside the same
   *  tree, no Portal), for a caller composing ChatThread directly as a Solid
   *  component (B-9). Not reachable through `<kai-chat>` (JSX has no
   *  web-component consumer form — same boundary as `headerEndContent`). */
  composerStart?: JSX.Element;
  /** JSX rendered immediately AFTER the composer region (see composerStart). */
  composerEnd?: JSX.Element;
  // callbacks (the facade maps these to dispatch())
  onValueChange?: (value: string) => void;
  onSubmit?: (detail: { value: string; attachments: AttachmentData[] }) => void;
  onAttachmentsChange?: (attachments: AttachmentData[]) => void;
  onSuggestionClick?: (value: string) => void;
  onModelChange?: (modelId: string) => void;
  onMessageAction?: (detail: MessageActionDetail) => void;
  onWebSearch?: () => void;
  onVoice?: () => void;
  /** Receive the imperative controller once mounted. The kai-chat facade forwards
   *  these as element methods (focus/clear/send/scrollToBottom). */
  controllerRef?: (controller: ChatThreadController) => void;
}

/** Imperative handle exposed via `controllerRef` — the input half of the chat's
 *  interaction surface, forwarded onto `<kai-chat>` as instance methods. */
export interface ChatThreadController {
  focus(options?: FocusOptions): void;
  clear(): void;
  send(): void;
  scrollToBottom(behavior?: ScrollBehavior): void;
  /** Force the widget back to its default landing view — `'home'` when the
   *  `home` prop is set (H-5), `'chat'` otherwise (a no-op if already there,
   *  or if neither `home` nor `conversations` is on). ChatThread has no knowledge of
   *  whatever chrome hosts it — a `Dock`, a plain page, anything — so it
   *  cannot know when that host closes. The seam is this one imperative
   *  call: a host that can go from visible to hidden and back (the `kai-dock`
   *  widget being the motivating case) calls it on every hide, so the NEXT
   *  open always lands on the chat view rather than wherever the list was
   *  left (owner: reopening the widget should show the default screen, not
   *  a stale list view). `Dock`'s own `onOpenChange` already fires on every
   *  close path — header X, the launcher toggle, and Escape — so a single
   *  `onOpenChange={(open) => !open && controller.closeConversationsList()}`
   *  at the call site covers all three with no per-path wiring. */
  closeConversationsList(): void;
  /** Start a fresh conversation — the same path as the list view's "+ New
   *  conversation" row: clears the active id, returns to the chat view,
   *  and delivers `[]` through `onConversationLoad`. The imperative seam
   *  the construct shell palette's "New conversation" entry drives (B-10). */
  startNewConversation(): void;
}

/**
 * THE MESSAGE LIST'S KEY, and the reason it is not the message object. This is
 * the canonical note; `thread.tsx` keys its identical list the same way and
 * points here.
 *
 *  `<For>` is REFERENCE-keyed, and a streaming assistant message gets a brand
 *  new object identity on every delta — `createAssistantStream` rebuilds it as
 *  `{ ...prev[i], parts: next }` because a new reference IS the re-render
 *  signal. Keyed on the objects, every chunk therefore looks like an entirely
 *  new list: the whole message row is torn down and rebuilt, and everything the
 *  user did inside it dies with it. Expanding a tool or reasoning panel
 *  mid-stream did nothing at all — the disclosure opened and was discarded
 *  microseconds later by the next token. (`MessageBody` keys its PARTS by
 *  position for exactly this reason; that fix was dead while its parent kept
 *  destroying the subtree above it.)
 *
 *  So key on `message.id`, which is stable across the object churn: `<For>` over
 *  the id array diffs by string value, a delta produces an identical id list,
 *  and no row moves. The row then reads its message through `messages[i()]` —
 *  `<For>`'s index accessor, which it keeps current across inserts, removals and
 *  moves — so the CONTENT keeps updating through accessors while the DOM stays
 *  put.
 *
 *  WHY NOT `<Index>`, the other way to survive the churn: `<Index>` keys by
 *  POSITION, so a row's local state (an open panel, a half-filled form card)
 *  belongs to the slot rather than to the message. Appends and tail truncations
 *  (regenerate/edit) are fine, but prepending older turns — load-earlier-history,
 *  which every real chat grows — shifts every row, and each open disclosure
 *  stays behind with the wrong message. Position IS a valid key inside a
 *  message, where the folds only ever append or patch a part in place; it is not
 *  one for the message list, where the host owns the array and splices it.
 *  Both approaches require the row to read through accessors — that is inherent
 *  in keeping a row mounted while its object is replaced, not a cost unique to
 *  either.
 *
 *  Contract: `id` must be unique per message. It already had to be — the
 *  feedback/copy state above this list is keyed by it.
 */
/** How an ASSISTANT row aligns its parts across the column (K-D11).
 *
 *  `stretch`, not `start`. An assistant turn is a `flex flex-col` box, so under
 *  `items-start` every part is a flex item with a fit-content cross size —
 *  `min(max-content, column)`. Prose is wider than the column so a text bubble
 *  looked right, and a generative-UI card was as wide as its widest button: the
 *  ops-console parameters form measured 285px inside a 768px column while the
 *  approval card beside it filled all 768. A card in a chat thread filling its
 *  column is a fact about the medium, and no consumer can reach it — the card
 *  element is created inside `<kai-chat>`'s shadow root.
 *
 *  Stretch rather than `w-full` on the cards, for two reasons: it is one lever
 *  instead of one per card surface (the Solid `Card` root AND every `kai-*`
 *  card host, whose shadow wrapper is `display: contents`), and stretching only
 *  applies where the cross size is `auto`, so a part that states its own width
 *  is untouched — `Attachments variant="grid"` stays `w-fit`. `Tool` and
 *  `Reasoning` already asked for `w-full` explicitly; this is the same
 *  intention, applied once.
 *
 *  USER rows keep `items-end`: their bubble is `max-w-[85%]` and right aligned,
 *  and stretching it would break both.
 */
const ASSISTANT_ALIGN = 'items-stretch';

export function ChatThread(props: ChatThreadProps) {
  const outer = useChatConfig();
  const reveal = () => (props.actionsReveal === 'hover' ? 'hover' : 'always');
  const messageKeys = createMemo(() => props.messages.map((m) => m.id));
  // Feedback (copy + vote) state lives ABOVE the per-message <For>, so streaming
  // re-renders (a fresh `messages` array ref per chunk) don't wipe it.
  // The copy/feedback toasts scope to the chat (this thread's root) so they appear
  // in-chat rather than at the page top.
  let rootEl: HTMLElement | undefined;
  const feedback = createMessageFeedback({
    emit: (detail) => props.onMessageAction?.(detail),
    target: () => rootEl,
  });
  const [internal, setInternal] = createSignal<string | ComposerDoc>(props.value ?? '');
  const [attachments, setAttachments] = createSignal<AttachmentData[]>([]);
  // ── Conversations (C-1..C-9) ────────────────────────────────────────────
  // ── Home screen (H-1..H-6, Task 3) ──────────────────────────────────────
  // `home` set adds a THIRD view (the list moves from the header toggle onto
  // the Messages tab — H-2) and boots into it instead of 'chat'. `chatEntry`
  // tracks whether the current 'chat' view is a DRILLED chat (entered from
  // home/list — hides the tab bar, shows a back arrow) or a ROOT chat (the
  // Messages tab with conversations off — tab bar stays, no back arrow).
  const homeEnabled = () => props.home != null;
  type WidgetView = 'home' | 'chat' | 'list';
  const [view, setView] = createSignal<WidgetView>(props.home != null ? 'home' : 'chat');
  const [chatEntry, setChatEntry] = createSignal<'home' | 'list' | null>(null);
  const tabBarVisible = () => homeEnabled() && (view() !== 'chat' || chatEntry() === null);
  const activeTab = (): 'home' | 'messages' => (view() === 'home' ? 'home' : 'messages');
  // The initial `view` signal value freezes the home-landing decision at
  // MOUNT — but the `kai-` contract has consumers set object props (like
  // `home`) as JS properties AFTER the element is appended/upgraded (the
  // React wrapper's `useLayoutEffect` runs post-mount by construction), so
  // `props.home` is routinely still `undefined` on this component's first
  // render. Without this, `<kai-chat>` then `el.home = {...}` renders a
  // tab bar (props.home is set by the time JSX reads it reactively) but
  // stays on `view() === 'chat'` forever — H-5 violated on a primary
  // consumer path. React to the RISING edge instead of relying on the
  // initial value: `home` turning on from off lands on 'home', but only
  // from the untouched default ('chat' with no drilled entry) — a late
  // toggle must never yank a visitor OUT of a chat they're already in
  // (root or drilled). `{ defer: true }` skips the run this effect's own
  // creation would otherwise trigger.
  // Falling edge (symmetric): `home` turning OFF while sitting on the
  // 'home' view leaves a default-configured HomePanel with no tab bar to
  // navigate away from — reset to 'chat', the only view a home-less widget
  // has.
  //
  // NOT `on(homeEnabled, fn, { defer: true })`: Solid's `on()` skips calling
  // `fn` on its first real invocation but does NOT capture the deferred
  // read as `prevInput` — the first non-deferred call always sees `prev ===
  // undefined` (confirmed against `solid-js/dist/solid.js`'s `on()`, not
  // just inferred), so `!isOn && wasOn` can never be true and the falling
  // edge silently never fires. Track the previous value by hand instead: a
  // closure variable seeded with `homeEnabled()`'s value BEFORE the
  // computed exists (so the computed's own first run sees `isOn === wasOn`
  // and no-ops, the same "skip the initial run" behavior `defer` was for)
  // and updated at the end of every run.
  let wasHomeEnabled = untrack(homeEnabled);
  createComputed(() => {
    const isOn = homeEnabled();
    const wasOn = wasHomeEnabled;
    if (isOn !== wasOn) {
      if (isOn && view() === 'chat' && chatEntry() === null) setView('home');
      else if (!isOn && view() === 'home') setView('chat');
    }
    wasHomeEnabled = isOn;
  });
  const [conversationSummaries, setConversationSummaries] = createSignal<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = createSignal<string | undefined>(undefined);
  const conversationsReady = () => props.conversations === true && props.store != null && props.onConversationLoad != null;
  // Set right before a load/restore hands its messages to the caller via
  // `onConversationLoad`, and consumed (read-then-cleared) by the very next
  // run of the save effect below. Plain closure variable, not a signal: it
  // gates a single effect run rather than driving any render, so it needs no
  // reactivity of its own. See the save effect's own comment for why this
  // exists (IMPORTANT-1, 2026-08-26 final review).
  let suppressNextSave = false;

  onMount(() => {
    if (props.conversations && !props.store) {
      console.error('ChatThread: `conversations` is true but no `store` was provided — the conversations feature needs a ConversationStore to persist to. Staying in chat-only mode.');
    } else if (props.conversations && props.store && !props.onConversationLoad) {
      console.error('ChatThread: `conversations` is true but no `onConversationLoad` handler was provided — row-select, "new conversation", and mount auto-restore would have nowhere to deliver the loaded messages, leaving row-tap/new/restore inert (and mount\'s auto-restore would still stamp an active conversation id the save effect could then clobber). Staying in chat-only mode.');
    }
  });

  const refreshConversations = async () => {
    if (!conversationsReady()) return;
    try {
      // Fresh array reference every refresh (reactivity contract) — the
      // adapter already returns a new array per call, so no extra clone is
      // needed here; the signal write is what notifies <ConversationPanel>.
      setConversationSummaries(await props.store!.list());
    } catch (err) {
      // Note this can run in the BACKGROUND, not just from `openList()`: the
      // save effect below calls this after every save() to keep the badge
      // cache fresh. Only bail OUT of the list view here — a transient
      // list() blip mid-drilled-chat (or on the root/home views) must stay a
      // harmless no-op, not teleport the visitor off whatever they're doing;
      // the list view itself has nothing to show without a summaries array,
      // so THAT is the one view this failure has to evacuate.
      console.warn('ChatThread: conversations list() failed; staying in chat-only mode.', err);
      if (view() === 'list') {
        setChatEntry(null);
        setView(homeEnabled() ? 'home' : 'chat');
      }
    }
  };

  const openList = () => { setView('list'); void refreshConversations(); };
  // Messages-tab entry point (H-2): the list moved off the header toggle onto
  // this tab, so it routes through 'list' when the store is wired and 'chat'
  // (the root chat, ambiguity 1 — no back arrow, `chatEntry` stays null)
  // otherwise.
  const openMessagesTab = () => {
    setChatEntry(null);
    if (conversationsReady()) { setView('list'); void refreshConversations(); }
    else setView('chat');
  };

  const selectConversation = async (id: string) => {
    if (!conversationsReady()) return;
    try {
      const messages = await props.store!.load(id);
      setActiveConversationId(id);
      setView('chat');
      // IMPORTANT-1 (2026-08-26 final review): the caller is about to hand
      // this same content straight back in as a new `props.messages`
      // reference (the reactivity contract requires a fresh array on every
      // change, load included). Without this flag the save effect below
      // reads that as "the thread changed," stamps a fresh `updatedAt`, and
      // calls `store.save()` — phantom-unreading a fully-read conversation
      // on every reload and, for `fetchStore`, firing a full-thread PUT on
      // every load for no actual change. Set BEFORE the callback so it's
      // armed no matter how synchronously the caller re-renders.
      suppressNextSave = true;
      // A genuinely new array (never a mutated one) — the reactivity
      // contract's array-reference rule, satisfied at the caller boundary.
      props.onConversationLoad?.([...messages], id);
    } catch (err) {
      console.warn(`ChatThread: conversations load(${id}) failed.`, err);
      // Defensive: a failed load must not leave a stale drilled-chat
      // back-target around from whatever set it before calling this.
      setChatEntry(null);
    }
  };

  const startNewConversation = () => {
    // C-6: lazy id — no id, no save, until the first message. Clearing the
    // active id and the message list (via onConversationLoad) is enough; the
    // id itself is minted the first time the save-on-change effect below
    // sees a non-empty thread with no active id. No `suppressNextSave` here:
    // an empty thread already short-circuits the save effect on its own
    // (`messages.length === 0`), so there is nothing to suppress.
    setActiveConversationId(undefined);
    setView('chat');
    props.onConversationLoad?.([], undefined);
  };

  createEffect(() => {
    if (!conversationsReady()) return;
    const messages = props.messages;
    if (messages.length === 0) return; // C-6: nothing persists until the first message
    // IMPORTANT-1: skip exactly the one save that is this same effect firing
    // on the `props.messages` bounce a load/restore itself caused — see
    // `suppressNextSave`'s own comment at `selectConversation`. Consumed
    // (cleared) unconditionally so only that one run is skipped; a genuine
    // edit right after a load still saves normally.
    if (suppressNextSave) { suppressNextSave = false; return; }
    // `untrack` the read: this effect also WRITES activeConversationId (minting
    // the lazy id below), so a tracked read makes the effect depend on a signal
    // it sets itself — the write re-triggers the same run and store.save() fires
    // twice with identical args for a conversation's first message. Reading it
    // untracked keeps the dependency set to `conversationsReady`/`props.messages`
    // only; the mint-then-set below still updates the signal (for the toggle
    // button/list UI) without feeding back into this effect's own re-run.
    let id = untrack(activeConversationId);
    if (!id) {
      id = crypto.randomUUID();
      setActiveConversationId(id);
    }
    props.store!.save(id, messages)
      // Re-fetch the summary list after every save (not just on mount/list-open):
      // `anyUnread`/the badge read `conversationSummaries()`, a CACHE that
      // otherwise only refreshes on those two paths, so a message arriving on
      // the active conversation while the host is closed (hostOpen === false —
      // `seenNow` below is false, so `markRead` correctly does NOT fire) would
      // update the persisted record's `updatedAt` but leave the cached summary
      // stale, and the badge would never appear until the visitor happened to
      // open the list. `refreshConversations` already no-ops safely if this
      // component unmounts mid-flight (`conversationsReady` guard) and handles
      // its own list() failure (console.warn, degrades to chat-only) — no new
      // error path here.
      .then(() => refreshConversations())
      .catch((err) => {
        // Decide loudly (spec's degradation section): the thread stays usable,
        // the failure is surfaced, never a silent no-op.
        console.error(`ChatThread: conversations save(${id}) failed; the conversation is not persisted for this change.`, err);
      });
  });

  // "Seen" (owner round, 2026-08-26, revised in the follow-up review): the
  // active conversation, AND the chat view (not the list) is showing, AND
  // the host is open (`hostOpen`, defaulting true — see that prop's doc).
  // ONE memo, shared by both consumers below, so they cannot drift: the
  // markRead effect gates on it directly, and `anyUnread` uses it to decide
  // whether the active conversation is still exempt from the "unread"
  // badge. Before this fix the two were separately-written conditions that
  // happened to look alike; `anyUnread` excluded the active id
  // UNCONDITIONALLY, so a message arriving on the active conversation while
  // the host was CLOSED (hostOpen === false) — the canonical "agent replied
  // while your box was shut" case — was dropped from the badge too, even
  // though it was never marked read (markRead's own gate correctly skips it
  // while closed). The active id is only a legitimate exclusion when it is
  // ALSO currently being marked seen.
  const seenNow = createMemo(
    () => activeConversationId() !== undefined && view() === 'chat' && props.hostOpen !== false,
  );

  // Every dependency read here is TRACKED — unlike the save effect above,
  // nothing in this effect writes any of them, so there's no feedback loop
  // to guard against with `untrack`. Re-running on every `props.messages`
  // change is exactly "on new messages arriving while seen holds";
  // re-running on `activeConversationId`/`view`/`hostOpen` changes is "on
  // select/restore/host-visibility-change" (the first two resolve through
  // `selectConversation`, which sets both).
  createEffect(() => {
    if (!conversationsReady()) return;
    const id = activeConversationId();
    const seen = seenNow();
    void props.messages; // tracked on purpose: see the comment above
    if (!seen || id === undefined) return;
    props.store!.markRead?.(id).catch((err) => {
      // Decide loudly, matching the save effect above — this degrades to
      // "unread never clears for this conversation," not a crash.
      console.error(`ChatThread: conversations markRead(${id}) failed.`, err);
    });
  });

  // The header toggle's own dot (rendered below) AND the value reported
  // outward via onUnreadChange are the SAME computation — a Dock (or any
  // other sibling control with no view into this thread's internal
  // conversation-summary state) mirrors it through the callback rather than
  // reaching in. Excludes the active conversation by id — but ONLY while
  // `seenNow()` holds. When it doesn't (list view open, or the host is
  // closed), the active conversation is exactly as unread-eligible as any
  // other row: nothing has marked it seen, so a message landing on it must
  // still surface here. `undefined` never matches a real conversation id, so
  // the exclusion is simply inert (matches nothing) while not seen, rather
  // than needing a second branch. Also excludes the active id (not by its
  // possibly-stale lastReadAt) so switching `activeConversationId` — e.g.
  // selecting a previously-unread row — clears that row's contribution to
  // this badge immediately, without waiting on a fresh list() round-trip.
  const anyUnread = createMemo(() =>
    conversationSummaries().some(
      (c) => c.id !== (seenNow() ? activeConversationId() : undefined) && isConversationUnread(c),
    ),
  );
  createEffect(() => props.onUnreadChange?.(anyUnread()));

  // Visitor continuity (C-7's whole point): a plain-history construct
  // auto-restored the visitor's thread on mount, so upgrading to
  // `conversations` must not regress that — their most recent conversation
  // (migrated legacy thread included) has to reappear without an extra tap
  // into the list. Guarded three ways: only when `list()` actually returned
  // something (a failed list() already degrades to chat-only inside
  // `refreshConversations`, and an empty store is a brand-new visitor who
  // gets the empty-chat welcome screen); only when nothing is active yet
  // (never fights `startNewConversation`/a prior `selectConversation`); and
  // only when `props.messages` is still empty (a parent that seeded its own
  // thread owns that choice — never clobber it). Reuses `selectConversation`
  // so the fresh-array/`onConversationLoad` contract is the same single path
  // as an explicit row click, and stays in `view() === 'chat'` throughout
  // (this never opens the list). One more guard: `view()` is re-checked
  // right before selecting, still 'chat' — mount's own list() and an
  // impatient caller's own `openList()`/manual navigation racing it (both
  // just microtask chains over the same synchronous localStorage) can
  // interleave, and `selectConversation` unconditionally snaps `view` back
  // to 'chat'; without this a visitor who opened the list before this
  // resolved would get yanked back out of it.
  onMount(() => {
    if (!conversationsReady()) return;
    void (async () => {
      await refreshConversations();
      if (untrack(activeConversationId) !== undefined) return;
      if (props.messages.length !== 0) return;
      if (view() !== 'chat') return;
      const summaries = conversationSummaries();
      if (summaries.length === 0) return;
      // Most-recently-updated first. `list()`'s own ordering isn't a
      // contract (`localStorageStore` returns insertion order, not recency),
      // so sort defensively by `updatedAt` rather than trusting index [0];
      // an unparsable/missing date sorts last rather than throwing.
      const newest = [...summaries].sort(byRecency)[0];
      await selectConversation(newest.id);
    })();
  });
  // A string `value` is controlled; a ComposerDoc `value` is a one-time seed that
  // lives in `internal` so the user's (string) edits replace it without a fight.
  const current = (): string | ComposerDoc =>
    typeof props.value === 'string' ? props.value : internal();
  createEffect(() => {
    const v = props.value;
    if (v != null && typeof v !== 'string') setInternal(v);
  });
  const handleChange = (v: string) => { setInternal(v); props.onValueChange?.(v); };
  // After a send, reset the composer. Clear the internal draft ONLY when the value is
  // uncontrolled (props.value === undefined) — a controlled host owns its own value and
  // clears it itself. This lets the batteries-included hooks (useKaiChat/createKaiChat),
  // whose `bind` does not control `value`, get a clean composer after each submit.
  const afterSubmit = () => { setAttachments([]); if (props.value === undefined) setInternal(''); };
  const handleSubmit = () => { props.onSubmit?.({ value: serializeToText(normalizeValue(current())), attachments: attachments() }); afterSubmit(); };
  const handleSuggestionClick = (v: string) => {
    if ((props.suggestionMode ?? 'submit') === 'fill') { handleChange(v); props.onSuggestionClick?.(v); }
    else { props.onSubmit?.({ value: v, attachments: attachments() }); afterSubmit(); }
  };
  const showHeader = () => !!(
    props.chatTitle || props.models || props.context || props.headerStart || props.headerEnd
    || props.headerEndContent || conversationsReady()
    // The back arrow on a drilled chat needs the header row even with no
    // title/models/context/store — a home-only construct (no `conversations`)
    // whose "new conversation" card drills into chat still needs somewhere
    // to put it.
    || (homeEnabled() && view() === 'chat' && chatEntry() !== null)
  );
  // Recent-conversation card (H-1): only when explicitly opted into
  // (`home.recentConversation === true`), summaries are actually hydrated,
  // and at least one exists — the newest by the shared recency rule (#335).
  const recentSummary = createMemo(() => {
    if (!homeEnabled() || props.home?.recentConversation !== true || !conversationsReady()) return undefined;
    const summaries = conversationSummaries();
    return summaries.length ? [...summaries].sort(byRecency)[0] : undefined;
  });
  // Suggestions are conversation starters: show only on an empty thread unless
  // the host opts into persisting them.
  const visibleSuggestions = () =>
    props.persistSuggestions || props.messages.length === 0 ? props.suggestions : undefined;
  const showScrollButton = () => props.scrollButton !== false;

  // Hand the imperative controller to the facade once mounted (rootEl is set).
  onMount(() => {
    props.controllerRef?.({
      focus: (options) =>
        rootEl
          ?.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"]), textarea')
          ?.focus(options),
      clear: () => { setInternal(''); setAttachments([]); props.onValueChange?.(''); },
      send: () => handleSubmit(),
      scrollToBottom: (behavior) => {
        const vp = rootEl?.querySelector<HTMLElement>('.overflow-y-auto');
        vp?.scrollTo({ top: vp.scrollHeight, behavior: behavior ?? 'smooth' });
      },
      closeConversationsList: () => { setChatEntry(null); setView(homeEnabled() ? 'home' : 'chat'); },
      startNewConversation: () => startNewConversation(),
    });
  });

  return (
    <ChatConfig proseSize={props.proseSize} codeTheme={props.codeTheme} codeHighlight={props.codeHighlight !== false} portalMount={outer.portalMount()}>
      {/* The root is a ROW so a `sidebar` slot can sit beside the main column.
          With no sidebar projected it collapses to the original column. */}
      <div ref={(e) => (rootEl = e as HTMLElement)} class={`flex h-full bg-background ${props.class ?? ''}`}>
        <Show when={props.sidebar}>
          <aside part="sidebar" class="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border">
            <slot name="sidebar" />
          </aside>
        </Show>
        <div class="flex h-full min-w-0 flex-1 flex-col">
          {/* Header: a full `header` slot REPLACES the built-in bar; otherwise the
              built-in header renders, itself carrying the header-start/header-end
              INJECT slots. */}
          <Show
            when={props.headerFull}
            fallback={
              <Show when={showHeader()}>
                <header part="header-bar" class="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
                  <div class="flex items-center gap-2">
                    {/* Consumer-injected leading controls (sidebar-toggle, compose, a
                        popover title-button). Projects light-DOM `slot="header-start"`
                        children of <kai-chat>; inert outside a shadow root. */}
                    <slot name="header-start" />
                    <Show when={props.chatTitle}>
                      <div class="text-sm font-semibold text-foreground">{props.chatTitle}</div>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={props.models}>
                      <ModelSwitcher
                        models={props.models!}
                        currentModelId={props.currentModel ?? props.models![0]?.id ?? ''}
                        onModelChange={(modelId) => props.onModelChange?.(modelId)}
                      />
                    </Show>
                    <Show when={props.context}>
                      <Context
                        usedTokens={props.context!.usedTokens} maxTokens={props.context!.maxTokens}
                        inputTokens={props.context!.inputTokens} outputTokens={props.context!.outputTokens}
                        estimatedCost={props.context!.estimatedCost}
                      >
                        <ContextTrigger />
                        <ContextContent>
                          <ContextContentHeader />
                          <ContextContentBody><div class="space-y-1.5"><ContextInputUsage /><ContextOutputUsage /></div></ContextContentBody>
                          <ContextContentFooter />
                        </ContextContent>
                      </Context>
                    </Show>
                    {/* A chat-bubble glyph, not the "menu that does nothing" the retrofit
                        shipped (owner feedback: it "looks like nothing and isn't even
                        the same size as the X"). Same `Button variant="ghost"
                        size="icon-sm"` component AND the same 24px icon size as the
                        widget's own close X (`codegen.ts`'s `headerEndContent` button,
                        which renders `DockCloseGlyph` = `<X size={24} />`) — identical
                        hit-area and optical weight, so the two read as siblings.
                        Swaps to a back arrow while the list is open, returning to chat. */}
                    {/* Back arrow for a DRILLED chat (H-5): entered from home, the
                        recent card, or a list row/new-conversation pill while `home`
                        is set. Returns to whichever surface it was entered from. */}
                    <Show when={homeEnabled() && view() === 'chat' && chatEntry() !== null}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        data-kai-home-back
                        aria-label="Back"
                        onClick={() => { const target = chatEntry()!; setChatEntry(null); setView(target); }}
                      >
                        <ArrowLeft size={24} aria-hidden="true" />
                      </Button>
                    </Show>
                    {/* H-2: with `home` set, the prior-conversations list moved off this
                        header toggle onto the Messages tab — the toggle no longer renders
                        at all (H-3). */}
                    <Show when={props.conversations && props.store && !homeEnabled()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        class="relative"
                        data-kai-conversations-toggle
                        // `aria-label` WINS over any descendant text for a button's
                        // accessible name, so "unread" has to be folded in here rather
                        // than in a sr-only sibling span (which AT would never reach).
                        aria-label={
                          view() === 'list'
                            ? 'Back to chat'
                            : anyUnread() && view() === 'chat'
                              ? 'Conversations (unread)'
                              : 'Conversations'
                        }
                        onClick={() => (view() === 'list' ? setView('chat') : openList())}
                      >
                        <Show when={view() === 'list'} fallback={<MessagesSquare size={24} aria-hidden="true" />}>
                          <ArrowLeft size={24} aria-hidden="true" />
                        </Show>
                        {/* Unread badge (owner round, 2026-08-26): ANY conversation other
                            than the active one is unread. Only over the chat-bubble glyph
                            — once the list is open showing the back arrow, the visitor is
                            already looking at the rows themselves, each carrying its own
                            dot (ConversationPanel), so a second badge on the arrow would be
                            redundant chrome. */}
                        <Show when={anyUnread() && view() === 'chat'}>
                          <span data-kai-conversations-unread aria-hidden="true" class="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-unread" />
                        </Show>
                      </Button>
                    </Show>
                    {/* Consumer-injected trailing controls (share, settings, …).
                        Projects light-DOM `slot="header-end"` children of <kai-chat>. */}
                    <slot name="header-end" />
                    {/* JSX escape hatch for a Solid-composed caller with no shadow-DOM
                        host to slot into (see the prop doc) — a docked widget's own
                        close affordance is the motivating case, sharing this row with
                        the title instead of floating as an unrelated second control. */}
                    {props.headerEndContent}
                  </div>
                </header>
              </Show>
            }
          >
            <header part="header" class="shrink-0"><slot name="header" /></header>
          </Show>
          <div class="relative flex-1 overflow-hidden">
            <Switch
              fallback={
                <ChatContainer class="h-full px-4 py-3">
              <ChatContainerContent class="mx-auto w-full max-w-3xl space-y-4">
                {/* REPLACE — custom empty-state content, shown only while the thread is
                    empty. The component still owns WHEN it shows (data state); the
                    consumer owns WHAT it looks like. `emptyContent` (JSX, rendered
                    in-tree and fully styled) wins over `empty`/`slot="empty"`
                    (light-DOM projection) when both are set — see the prop doc. */}
                <Show when={(props.empty || props.emptyContent) && props.messages.length === 0}>
                  <Show when={props.emptyContent} fallback={<slot name="empty" />}>
                    {props.emptyContent}
                  </Show>
                </Show>
                {/* Keyed by message id (see the note above this component), so a
                    streaming delta updates the row instead of replacing it. */}
                <For each={messageKeys()}>
                  {(_id, i) => (
                    // The row reads its message through <For>'s index accessor,
                    // never through a captured value: the row outlives the delta
                    // that replaced its object, so every read below has to go
                    // through `m()` for the new content to land. <Show> supplies
                    // the non-null accessor and covers the frame where a removal
                    // has shortened the array.
                    <Show when={props.messages[i()]}>
                      {(m) => {
                        const body = (
                          <MessageBody
                            parts={m().parts}
                            /* F-21: streaming-ness = the thread's ONE existing
                               loading signal + being the last message and an
                               assistant turn. No second streaming source. The
                               reasoning disclosure no longer auto-opens on it
                               by default (Task 19f, owner ruling 2026-08-26) —
                               only the trigger's shimmer reflects streaming
                               unless `reasoningOpen` opts back in. */
                            isStreaming={props.loading === true && m().role === 'assistant' && i() === props.messages.length - 1}
                            reasoningMode={props.reasoning}
                            reasoningDefaultOpen={props.reasoningOpen}
                            cardTypes={props.cardTypes}
                            cardSchemas={props.cardSchemas}
                            cardHostElement={props.cardHostElement}
                            isUser={m().role === 'user'}
                            markdown={m().role === 'assistant'}
                            actions={m().actions ?? (m().role === 'user' ? props.userActions : props.assistantActions)}
                            hideSources={props.hideSources}
                            actionsReveal={reveal()}
                            activeFeedback={feedback.resolveFeedback(m())}
                            copied={feedback.isCopied(m().id)}
                            onAction={(action) => feedback.handleAction(m(), action)}
                          />
                        );
                        const rowGroup = () => (reveal() === 'hover' ? 'group ' : '');
                        return (
                          // `role` is the SPEAKER, forwarded on BOTH branches —
                          // see the same note in thread.tsx. `Message` turns it
                          // into `role="article"` + an `aria-label`; without it the
                          // row is a bare div chromium prunes from the
                          // accessibility tree as "uninteresting".
                          <Show
                            when={m().avatar}
                            fallback={
                              <Message role={m().role} class={`${rowGroup()}${m().role === 'user' ? 'flex-col items-end' : `flex-col ${ASSISTANT_ALIGN}`}`}>
                                {body}
                              </Message>
                            }
                          >
                            {(av) => (
                              <Message role={m().role} class={rowGroup()}>
                                <MessageAvatar src={av().src ?? ''} alt={av().alt ?? ''} fallback={av().fallback} />
                                <div class={`flex min-w-0 flex-1 flex-col ${m().role === 'user' ? 'items-end' : ASSISTANT_ALIGN}`}>
                                  {body}
                                </div>
                              </Message>
                            )}
                          </Show>
                        );
                      }}
                    </Show>
                  )}
                </For>
                <ChatContainerScrollAnchor />
              </ChatContainerContent>
              <Show when={showScrollButton()}>
                <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
                  {/* The button now owns its elevation (kai-elevation); a `shadow-sm`
                      here would set box-shadow a second time and the winner would
                      be stylesheet order, not this call site. */}
                  <ScrollButton />
                </div>
              </Show>
                </ChatContainer>
              }
            >
              <Match when={view() === 'home'}>
                <HomePanel
                  greeting={props.home?.greeting}
                  recent={recentSummary()}
                  newChatLabel={props.home?.newConversation?.label}
                  links={props.home?.links}
                  onSelectRecent={(id) => { setChatEntry('home'); void selectConversation(id); }}
                  onNewChat={() => { setChatEntry('home'); startNewConversation(); }}
                  onLink={(entry) => props.onHomeLink?.(entry)}
                />
              </Match>
              <Match when={view() === 'list' && conversationsReady()}>
                <ConversationPanel
                  conversations={conversationSummaries()}
                  activeId={activeConversationId()}
                  onSelect={(id) => { setChatEntry(homeEnabled() ? 'list' : null); void selectConversation(id); }}
                  onNewChat={() => { setChatEntry(homeEnabled() ? 'list' : null); startNewConversation(); }}
                />
              </Match>
            </Switch>
          </div>
          {/* The list view TAKES OVER the full content area (owner: "if we are
              looking at the conversations, i don't think i would see the
              suggestions nor the prompt input... the convo list would be taking
              over the full content area"). The retrofit only swapped the thread;
              this hides the composer-actions row, the composer itself and the
              footer too — nothing below the header renders except the panel. */}
          <Show when={view() === 'chat'}>
            {/* INJECT — accessory row above the composer (extra actions/toolbar). */}
            <Show when={props.composerActions}>
              <div class="shrink-0 px-4">
                <div class="mx-auto flex max-w-3xl items-center gap-2 pb-2"><slot name="composer-actions" /></div>
              </div>
            </Show>
            <div class="shrink-0 px-4 pb-4">
              <div class="mx-auto max-w-3xl">
                {/* JSX escape hatch, rendered immediately before the composer region
                    (built-in or `slot="composer"` replacement) — see the prop doc. */}
                <Show when={props.composerStart}>{props.composerStart}</Show>
                {/* REPLACE — a full `composer` slot stands in for the built-in input.
                    The slotted content owns its own submit/loading wiring. */}
                <Show
                  when={props.composer}
                  fallback={
                    <DefaultPromptInput
                      value={current()} placeholder={props.placeholder} loading={props.loading === true}
                      suggestions={visibleSuggestions()} attachments={attachments()}
                      accept={props.accept} onAttachmentsRejected={props.onAttachmentsRejected}
                      attach={props.attach} webSearch={props.webSearch === true} voice={props.voice === true}
                      triggers={props.triggers} kindIcons={props.kindIcons}
                      onValueChange={handleChange} onSubmit={handleSubmit} onSuggestionClick={handleSuggestionClick}
                      onAttachmentsChange={(a) => { setAttachments(a); props.onAttachmentsChange?.(a); }}
                      onWebSearch={() => props.onWebSearch?.()} onVoice={() => props.onVoice?.()}
                    />
                  }
                >
                  <slot name="composer" />
                </Show>
                {/* JSX escape hatch, rendered immediately after the composer region. */}
                <Show when={props.composerEnd}>{props.composerEnd}</Show>
              </div>
            </div>
            {/* INJECT: footer row below the composer. */}
            <Show when={props.footer}>
              <div part="footer" class="shrink-0 px-4 pb-3">
                <div class="mx-auto max-w-3xl text-center text-xs text-muted-foreground"><slot name="footer" /></div>
              </div>
            </Show>
          </Show>
          {/* Home/Messages tab bar (H-2/H-6): shown on the 'home' and 'list'
              views and on the ROOT chat (Messages tab, conversations off —
              ambiguity 1), hidden on a DRILLED chat so the back arrow above
              is the only way back. */}
          <Show when={tabBarVisible()}>
            <WidgetTabBar
              active={activeTab()}
              onChange={(tab) => (tab === 'home' ? setView('home') : openMessagesTab())}
              unread={anyUnread()}
            />
          </Show>
        </div>
      </div>
    </ChatConfig>
  );
}
