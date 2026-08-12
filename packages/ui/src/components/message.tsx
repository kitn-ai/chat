import { type JSX, For, Index, Switch, Match, createMemo, createSignal, splitProps, Show } from "solid-js";
import { Tooltip } from "../ui/tooltip";
import { Copy, Check } from "lucide-solid";
import { cn } from "../utils/cn";
import { Markdown } from "./markdown";
import { Button } from "../ui/button";
import { actionIcon, BUILTIN_ACTION_LABEL } from "../ui/action-icons";
import type { ChatMessageAction, CustomAction, FeedbackVote, MessagePart, MessageSource } from "../elements/chat-types";
import { useChatConfig, textClass } from "../primitives/chat-config";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";
import { Tool } from "./tool";
import { Attachments, Attachment, AttachmentPreview, AttachmentInfo } from "./attachments";
import { Source, SourceTrigger, SourceContent, SourceList } from "./source";
import { CardRenderer, type CardSchemaMap } from "./card-renderer";
import type { CardComponentMap } from "../primitives/card-registry";

// --- Message ---

export interface MessageProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function Message(props: MessageProps) {
  const [local, rest] = splitProps(props, ["children", "class"]);
  return (
    <div part="row" class={cn("flex items-start gap-3", local.class)} {...rest}>
      {local.children}
    </div>
  );
}

// --- MessageAvatar ---

export interface MessageAvatarProps {
  src: string;
  alt: string;
  fallback?: string;
  class?: string;
}

function MessageAvatar(props: MessageAvatarProps) {
  return (
    <div
      part="avatar"
      class={cn("h-8 w-8 shrink-0 overflow-hidden rounded-full", props.class)}
    >
      <Show
        when={props.src}
        fallback={
          <Show when={props.fallback}>
            <div class="flex h-full w-full items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
              {props.fallback}
            </div>
          </Show>
        }
      >
        <img
          src={props.src}
          alt={props.alt}
          class="h-full w-full object-cover"
        />
      </Show>
    </div>
  );
}

// --- MessageContent ---

export interface MessageContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element | string;
  markdown?: boolean;
  /** `::part` name(s) exposed on the content node. The body passes
   *  `"bubble content"` so consumers can target either the rounded bubble or the
   *  text region from outside the shadow boundary. */
  part?: string;
}

function MessageContent(props: MessageContentProps) {
  const [local, rest] = splitProps(props, ["children", "markdown", "class", "part"]);
  const config = useChatConfig();
  const classNames = () =>
    cn(
      "min-w-0 rounded-lg p-2 text-foreground bg-secondary max-w-none break-words whitespace-normal",
      textClass(config.proseSize()),
      local.class,
    );

  return (
    <Show
      when={local.markdown}
      fallback={
        <div part={local.part} class={classNames()} {...rest}>
          {local.children}
        </div>
      }
    >
      <Markdown part={local.part} content={local.children as string} class={classNames()} />
    </Show>
  );
}

// --- MessageActions ---

export interface MessageActionsProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: JSX.Element;
}

function MessageActions(props: MessageActionsProps) {
  const [local, rest] = splitProps(props, ["children", "class"]);
  return (
    <div
      class={cn(
        "flex items-center gap-0.5 mt-0.5",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- MessageActionBar ---

export interface MessageActionBarProps {
  /** Built-in action names and/or custom action descriptors, in order. */
  actions: (ChatMessageAction | CustomAction)[];
  /** `'always'` (default) keeps the bar visible; `'hover'` reveals it on
   *  parent `.group` hover. */
  reveal?: 'always' | 'hover';
  /** Fired with the built-in name or the custom action id when a button is clicked. */
  onAction: (id: string) => void;
  /** The active feedback vote. When `'like'`/`'dislike'` is set, that button is
   *  marked pressed (filled) and the OTHER vote button animates out. `undefined`
   *  shows both. Pure/prop-driven so the bar survives re-renders. */
  activeFeedback?: FeedbackVote;
  /** When true, the `copy` button shows its emerald check icon instead of the
   *  copy glyph (cleared by the owner after ~2s). */
  copied?: boolean;
  class?: string;
}

/** Normalize a bar entry (string built-in or custom object) to a uniform shape. */
function normalizeAction(a: ChatMessageAction | CustomAction) {
  if (typeof a === 'string') {
    return { id: a, label: BUILTIN_ACTION_LABEL[a], Icon: actionIcon(a) };
  }
  return { id: a.id, label: a.label, Icon: actionIcon(a.icon) };
}

/** Is this entry one of the two feedback votes? */
function feedbackVoteOf(a: ChatMessageAction | CustomAction): FeedbackVote | undefined {
  return a === 'like' || a === 'dislike' ? a : undefined;
}

/**
 * The shared message action toolbar. Renders one ghost icon button per entry —
 * built-in names pull their label+icon from the curated registry; custom
 * descriptors use their `label` plus `actionIcon(icon)` (label-only when the
 * icon is unknown or absent). `reveal="hover"` makes the bar fade in on the
 * parent `.group`'s hover.
 *
 * Pure/prop-driven: feedback (`activeFeedback`) and copy (`copied`) state are
 * owned by the parent facade and passed in — the bar holds no internal signals,
 * so it survives the new-array-per-chunk re-renders of a streaming thread. With
 * a vote active, the chosen `like`/`dislike` button is marked `aria-pressed` +
 * filled and the other vote button collapses its width (sliding the active thumb
 * into its place) via a 0fr↔1fr grid transition. The
 * `copy` button swaps to an emerald check while `copied`.
 */
function MessageActionBar(props: MessageActionBarProps) {
  return (
    <MessageActions
      part="actions"
      class={cn(
        'mt-1 flex gap-0',
        props.reveal === 'hover' && 'opacity-0 transition-opacity group-hover:opacity-100',
        props.class,
      )}
    >
      <For each={props.actions}>
        {(a) => {
          const item = normalizeAction(a);
          const tooltipText = () => (typeof a !== 'string' && a.tooltip) ? a.tooltip : item.label;
          const vote = feedbackVoteOf(a);
          // A vote button is the active one when it matches the resolved vote.
          const isActiveVote = () => vote !== undefined && props.activeFeedback === vote;
          // The COPY button reflects the copied check.
          const isCopy = item.id === 'copy';
          const showCheck = () => isCopy && props.copied === true;

          // Factory (not a shared node): each Show branch gets its own Button so
          // the eager DOM node is never referenced from two places.
          const button = () => (
            <Button
              variant="ghost"
              size="icon-sm"
              class={cn('rounded-full', isActiveVote() && 'text-primary')}
              data-action={item.id}
              aria-label={showCheck() ? 'Copied' : item.label}
              aria-pressed={vote !== undefined ? isActiveVote() : undefined}
              onClick={() => props.onAction(item.id)}
            >
              <Show
                when={showCheck()}
                fallback={
                  <Show when={item.Icon} fallback={<span class="px-1 text-xs">{item.label}</span>}>
                    {(Icon) => {
                      const I = Icon();
                      return <I class={cn('size-3.5', isActiveVote() && 'fill-current')} />;
                    }}
                  </Show>
                }
              >
                <Check class="size-3.5 text-emerald-400" />
              </Show>
            </Button>
          );
          // Icon-only buttons get a tooltip; label-only buttons (text already
          // visible) don't.
          const rendered = () => (
            <Show when={item.Icon} fallback={button()}>
              <Tooltip content={tooltipText()}>{button()}</Tooltip>
            </Show>
          );

          // When the OTHER vote is active, this vote button collapses — its WIDTH
          // animates to zero via a 0fr↔1fr grid so the remaining thumb slides into
          // its place, while it fades out; it slides + fades back on un-vote. (Kept
          // mounted-but-collapsed, not unmounted, so the sibling can slide.) No
          // vote active → both shown; non-vote entries always render.
          return (
            <Show when={vote !== undefined} fallback={rendered()}>
              {(() => {
                const show = () => props.activeFeedback === undefined || props.activeFeedback === vote;
                return (
                  <span
                    data-feedback-collapsed={show() ? undefined : ''}
                    class={cn(
                      'grid transition-[grid-template-columns,opacity] duration-300 ease-out',
                      show() ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0',
                    )}
                  >
                    <span class="min-w-0 overflow-hidden">{rendered()}</span>
                  </span>
                );
              })()}
            </Show>
          );
        }}
      </For>
    </MessageActions>
  );
}

// --- MessageBody ---

export interface MessageBodyProps {
  /** The message's ordered parts (text, reasoning, tool, card, source, file),
   *  rendered in a single pass in the order they appear. A run of consecutive
   *  `source` parts renders as ONE citation row (`part="citations"`), placed
   *  OUTSIDE the message bubble so a citation is never confused with a link the
   *  model typed into its prose. */
  parts: MessagePart[];
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
  /** Whether this is a user message (right-aligned bubble) vs an assistant
   *  message (full-width transparent). */
  isUser: boolean;
  /** Whether text parts render as markdown. */
  markdown: boolean;
  /** Action-bar entries — built-in names and/or custom descriptors. When empty
   *  the bar is not rendered. */
  actions?: (ChatMessageAction | CustomAction)[];
  /** `'always'` (default) keeps the bar visible; `'hover'` reveals it on parent
   *  `.group` hover. */
  actionsReveal?: 'always' | 'hover';
  /** Fired with the built-in name or custom id when an action is clicked. */
  onAction?: (id: string) => void;
  /** The currently-active feedback vote, so the bar can mark like/dislike and
   *  hide the other. */
  activeFeedback?: FeedbackVote;
  /** When true, the copy button shows its "copied" check icon. */
  copied?: boolean;
  /** INJECT slot projected at the TOP of the body — above the reasoning / tools /
   *  content. A per-message header: a model-name label, a role + timestamp line.
   *  In the `<kai-message>` shadow this is `<slot name="before-body" />`. */
  beforeBody?: JSX.Element;
  /** INJECT slot projected at the BOTTOM of the body — below the action bar. A
   *  citation / sources row, a token-cost / latency line. In the `<kai-message>`
   *  shadow this is `<slot name="after-body" />`. */
  afterBody?: JSX.Element;
}

/** One render group over an ordered `parts` array. Two part types collapse runs:
 *  consecutive `file` parts become a single `'files'` group so they share one
 *  `<Attachments>` row (matching the pre-parts layout) instead of each opening
 *  its own, and consecutive `source` parts become a single `'sources'` group so
 *  the N citations one search produced are ONE wrapped row rather than N stacked
 *  rows. Every other part is its own `'single'` group. Pure and order-preserving:
 *  it only decides where the wrapper boundaries fall, never reorders or drops
 *  anything, so a group sits exactly where its parts sat in `parts`. */
export type MessagePartGroup =
  | { kind: 'single'; part: Exclude<MessagePart, { type: 'file' } | { type: 'source' }> }
  | { kind: 'files'; parts: Extract<MessagePart, { type: 'file' }>[] }
  | { kind: 'sources'; parts: Extract<MessagePart, { type: 'source' }>[] };

export function groupMessageParts(parts: MessagePart[]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  for (const part of parts) {
    if (part.type === 'file') {
      const last = groups[groups.length - 1];
      if (last?.kind === 'files') {
        groups[groups.length - 1] = { kind: 'files', parts: [...last.parts, part] };
        continue;
      }
      groups.push({ kind: 'files', parts: [part] });
      continue;
    }
    if (part.type === 'source') {
      const last = groups[groups.length - 1];
      if (last?.kind === 'sources') {
        groups[groups.length - 1] = { kind: 'sources', parts: [...last.parts, part] };
        continue;
      }
      groups.push({ kind: 'sources', parts: [part] });
      continue;
    }
    groups.push({ kind: 'single', part });
  }
  return groups;
}

/** The citation chip's label. `index` when the model numbered its citations;
 *  otherwise `undefined` so `SourceTrigger` falls back to the domain. A source
 *  with NO url has no domain to fall back to, so its title (then a generic word)
 *  stands in rather than rendering an empty chip. */
function citationLabel(s: MessageSource): string | number | undefined {
  if (s.index !== undefined) return s.index;
  if (s.url) return undefined;
  return s.title || 'Source';
}

/** The hover card's headline. Every field is optional, so fall back through
 *  title -> url -> a generic word. */
function citationTitle(s: MessageSource): string {
  return s.title || s.url || 'Source';
}

/** Narrow a group to one variant IN A SINGLE READ.
 *
 *  The render body below reads its group/part through accessors (see the
 *  `<Index>` note in `MessageBody`), and TypeScript cannot narrow a
 *  discriminated union across two separate accessor CALLS —
 *  `g().kind === 'files' && g()` leaves the second call widened, because as far
 *  as the compiler knows the two calls could return different values. So the
 *  test and the cast happen together, on one already-read value. Returns
 *  `false` rather than `undefined` so it reads as a plain falsy `<Match when>`. */
function groupAs<T extends MessagePartGroup['kind']>(
  group: MessagePartGroup,
  kind: T,
): Extract<MessagePartGroup, { kind: T }> | false {
  return group.kind === kind ? (group as Extract<MessagePartGroup, { kind: T }>) : false;
}

/** The same single-read narrowing for `MessagePart`. */
function partAs<T extends MessagePart['type']>(
  part: MessagePart,
  type: T,
): Extract<MessagePart, { type: T }> | false {
  return part.type === type ? (part as Extract<MessagePart, { type: T }>) : false;
}

/**
 * The shared message body: the message's `parts` rendered in a single ordered
 * pass (text, reasoning, tool calls, generative-UI cards, citations and file
 * attachments interleaved exactly as they appear), followed by the action bar.
 * Runs of `source` and `file` parts each collapse into one row. This is the
 * single source of truth for how a message renders, consumed by `ChatThread`
 * (the `<For>` over `messages`), the standalone `<kai-message>` facade, and (in
 * future) `kai-compare` for each candidate. Pure/prop-driven: all interaction
 * state (copied, feedback vote) is owned above and passed in.
 */
function MessageBody(props: MessageBodyProps) {
  const groups = createMemo(() => groupMessageParts(props.parts));
  return (
    <>
      {/* before-body (inject): a per-message header above everything else. */}
      <Show when={props.beforeBody}>{props.beforeBody}</Show>
      {/* <Index>, NOT <For>, on purpose — this is load-bearing.
       *
       *  A streaming message re-renders once per delta with a brand-new `parts`
       *  array (a new reference IS the re-render signal), and
       *  `groupMessageParts` allocates fresh wrapper objects on top of that. A
       *  <For> is REFERENCE-keyed, so every chunk looks like an entirely new
       *  list and every row is torn down and rebuilt. Everything the user has
       *  done inside a row dies with it: expanding a tool panel or a reasoning
       *  block mid-stream silently did nothing, because the disclosure opened
       *  and was discarded microseconds later by the next token (a live probe
       *  caught the collapsibles' `createUniqueId()` walking cl-9 -> cl-11 ->
       *  cl-15 across three deltas).
       *
       *  <Index> keys by POSITION and hands each row its value as a SIGNAL, so
       *  a row stays mounted while its content keeps updating. That is exactly
       *  the shape of a stream: the folds behind `parts`
       *  (appendTextPart/appendReasoningPart/upsertToolPart) only ever append
       *  to the end or replace one part IN PLACE with the same variant — never
       *  reorder, never change a part's type — so a part's position is a stable
       *  identity, and a growing text/reasoning block or a tool patched from
       *  `input-streaming` to `output-available` reaches the DOM through the
       *  accessor instead of through a remount.
       *
       *  The trade-off of position-keying: splicing a part out of the MIDDLE of
       *  a message shifts the rows after it, so their local state (an open
       *  disclosure) stays with the position rather than following the part.
       *  <For> got that right for a STATIC array and got streaming wrong every
       *  single time — no consumer splices mid-message, every consumer streams.
       *
       *  This only works while the children read through the accessors below:
       *  capturing `g().part` once re-freezes the row at its first delta. */}
      <Index each={groups()}>
        {(group) => (
          <Switch fallback={null}>
            <Match when={groupAs(group(), 'files')}>
              {(g) => (
                <Attachments variant="inline" class={props.isUser ? 'mb-2 justify-end' : 'mb-2'}>
                  {/* Reference-keyed <For> is right HERE: the run's part objects
                      are carried over untouched by the folds, and an attachment
                      holds no state worth preserving. */}
                  <For each={g().parts}>
                    {(fp) => (
                      <Attachment data={fp.attachment}>
                        <AttachmentPreview />
                        <AttachmentInfo />
                      </Attachment>
                    )}
                  </For>
                </Attachments>
              )}
            </Match>
            <Match when={groupAs(group(), 'sources')}>
              {(g) => (
                // OUTSIDE the bubble, deliberately. A citation nested inside
                // `MessageContent` is indistinguishable from a link the MODEL
                // typed into its prose — which is exactly how the first version
                // of the S12 conformance check passed while proving nothing.
                // `SourceList` is its own container, so the row is a sibling of
                // the content part, and `part="citations"` lets a consumer target
                // it through the shadow boundary.
                <SourceList part="citations" class={props.isUser ? 'justify-end' : undefined}>
                  {/* Reference-keyed <For> is right HERE, as with files: the
                      run's part objects are carried over untouched by the folds. */}
                  <For each={g().parts}>
                    {(sp) => (
                      <Source href={sp.source.url}>
                        <SourceTrigger label={citationLabel(sp.source)} />
                        <SourceContent
                          title={citationTitle(sp.source)}
                          description={sp.source.snippet ?? ''}
                        />
                      </Source>
                    )}
                  </For>
                </SourceList>
              )}
            </Match>
            <Match when={groupAs(group(), 'single')}>
              {(g) => {
                // An ACCESSOR, never a captured value: the row outlives the
                // delta that rebuilt this part, so every read below has to go
                // through here for the new content to land. `partAs` does the
                // type test and the narrowing cast in one read (see its note).
                const part = () => g().part;
                const reasoning = () => partAs(part(), 'reasoning');
                // A reasoning part with NO text is a round-trip carrier, not
                // something to show. Anthropic's redacted_thinking blocks carry
                // an opaque blob with no readable text, and the block assembled
                // at content_block_stop carries the verbatim payload the encoder
                // must echo back. Both are empty-text parts that MUST stay in
                // `parts` (the encoder needs them, in order) and must not render
                // a blank disclosure.
                const carrierOnly = () => { const r = reasoning(); return r !== false && r.text === ''; };
                const shownReasoning = () => { const r = reasoning(); return r !== false && r.text !== '' && r; };
                return (
                  <Switch fallback={null}>
                    <Match when={partAs(part(), 'text')}>
                      {(p) => (
                        <MessageContent
                          part="bubble content"
                          markdown={props.markdown}
                          class={props.isUser
                            ? 'bg-muted text-primary max-w-[85%] rounded-2xl px-4 py-2'
                            : 'bg-transparent p-0'}
                        >
                          {p().text}
                        </MessageContent>
                      )}
                    </Match>
                    <Match when={carrierOnly()}>{null}</Match>
                    <Match when={shownReasoning()}>
                      {(p) => (
                        <Reasoning class="mb-2 w-full">
                          <ReasoningTrigger>{p().label ?? 'Reasoning'}</ReasoningTrigger>
                          <ReasoningContent markdown>{p().text}</ReasoningContent>
                        </Reasoning>
                      )}
                    </Match>
                    <Match when={partAs(part(), 'tool')}>
                      {(p) => <Tool toolPart={p().tool} class="mb-2 w-full" />}
                    </Match>
                    <Match when={partAs(part(), 'card')}>
                      {(p) => <CardRenderer envelope={p().envelope} types={props.cardTypes} schemas={props.cardSchemas} />}
                    </Match>
                    {/* No `source` match here on purpose: source parts never
                        reach a 'single' group — they are collapsed into a
                        'sources' run above and rendered as one citation row. */}
                  </Switch>
                );
              }}
            </Match>
          </Switch>
        )}
      </Index>
      <Show when={(props.actions?.length ?? 0) > 0}>
        <MessageActionBar
          actions={props.actions!}
          reveal={props.actionsReveal === 'hover' ? 'hover' : 'always'}
          activeFeedback={props.activeFeedback}
          copied={props.copied}
          onAction={(id) => props.onAction?.(id)}
        />
      </Show>
      {/* after-body (inject): a citation row / cost line below the action bar. */}
      <Show when={props.afterBody}>{props.afterBody}</Show>
    </>
  );
}

// --- MessageAction ---

export interface MessageActionProps {
  tooltip: string;
  children: JSX.Element;
  side?: "top" | "bottom" | "left" | "right";
  class?: string;
}

function MessageAction(props: MessageActionProps) {
  return <>{props.children}</>;
}

// --- MessageCopyButton ---

export interface MessageCopyButtonProps {
  content: string;
  size?: number;
  class?: string;
}

function MessageCopyButton(props: MessageCopyButtonProps) {
  const [copied, setCopied] = createSignal(false);
  const iconSize = () => props.size ?? 14;

  return (
    <button
      class={props.class}
      aria-label={copied() ? 'Copied' : 'Copy message'}
      onClick={() => {
        navigator.clipboard.writeText(props.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Show when={copied()} fallback={<Copy size={iconSize()} />}>
        <Check size={iconSize()} class="text-emerald-400" />
      </Show>
    </button>
  );
}

export { Message, MessageAvatar, MessageContent, MessageActions, MessageActionBar, MessageBody, MessageAction, MessageCopyButton };
