/**
 * Composition slots for `kai-*` elements. A slot is a named region a consumer
 * fills with their own markup. This registry is the SINGLE SOURCE OF TRUTH:
 * the facade derives its detection from it (and, later, docs are generated
 * from it).
 */

/** `inject` = additive (the built-in region still renders, your markup is added
 *  in). `replace` = your markup stands in for the whole region — you own that
 *  region's data + events (a slotted light-DOM node can't read the component's
 *  reactive state). */
export type SlotMode = 'inject' | 'replace';

export interface SlotDef {
  /** Slot name (kebab-case). Also the `::part` name when `part` is true. */
  name: string;
  mode: SlotMode;
  /** Expose `::part(name)` on the region wrapper for consumer styling. */
  part?: boolean;
  /** One-line contract: what the consumer projects / owns. Feeds the docs. */
  doc: string;
}

/** Slots of `<kai-chat>`, in render order. */
export const CHAT_SLOTS: SlotDef[] = [
  { name: 'header-start',     mode: 'inject',  doc: 'Leading header controls, left of the title.' },
  { name: 'header-end',       mode: 'inject',  doc: 'Trailing header controls.' },
  { name: 'header',           mode: 'replace', part: true, doc: 'Full custom header; replaces the built-in title/model/context bar.' },
  { name: 'sidebar',          mode: 'inject',  part: true, doc: 'Left column (your nav / conversation list). Fixed width; use compose-your-own for resizable.' },
  { name: 'home',             mode: 'replace', doc: 'Custom home-tab content in place of the built-in home screen (greeting, recent-conversation card, links). Rendered only while the home view is showing, so it needs the `home` property set; the tab bar and navigation stay built in.' },
  { name: 'empty',            mode: 'replace', doc: 'Custom zero-state rendered in the message area while the thread is empty. Replaces the empty message list only; the composer and any suggestions still render.' },
  { name: 'composer',         mode: 'replace', doc: 'Full custom composer; you own submit + loading, drive the thread via messages.' },
  { name: 'composer-actions', mode: 'inject',  doc: 'Accessory row above the composer.' },
  { name: 'footer',           mode: 'inject',  part: true, doc: 'Row below the composer (disclaimers, token meter).' },
];

/** Slots of `<kai-prompt-input>` (and the default composer inside `<kai-chat>`). Native
 *  shadow slots — an empty slot renders nothing, so no facade flag-gating is required.
 *
 *  These are ONLY positions inside the card's shadow boundary — places a consumer
 *  cannot reach from their own DOM. Content ABOVE/BELOW the whole card is the
 *  consumer's own light-DOM layout (a sibling element), so there is intentionally
 *  no outer block slot here. (When the input is nested inside `<kai-chat>`'s shadow,
 *  that surrounding hole belongs to `kai-chat` — see `composer-actions`/`footer`.) */
export const PROMPT_INPUT_SLOTS: SlotDef[] = [
  { name: 'input-top',     mode: 'inject', doc: 'Inside the card, above the textarea (e.g. an inline status strip). For content above/below the whole card, use your own layout; that is light DOM you control.' },
  { name: 'toolbar-start', mode: 'inject', doc: 'Leading controls in the input toolbar, where a + menu goes.' },
  { name: 'toolbar-end',   mode: 'inject', doc: 'Trailing controls in the toolbar, before the Send button.' },
];

/** Slots of `<kai-conversations>` (also used inside `<kai-chat>`'s `sidebar`).
 *  Names mirror `<kai-chat>`'s so the two compose with one vocabulary. */
export const CONVERSATIONS_SLOTS: SlotDef[] = [
  { name: 'header', mode: 'replace', doc: 'Full custom title bar; replaces the built-in toggle / "Chats" / New-chat row.' },
  { name: 'empty',  mode: 'replace', doc: 'Custom zero-state shown when there are no conversations; replaces the built-in "No conversations yet".' },
  { name: 'footer', mode: 'inject',  doc: 'A row below the list: account, settings, or usage.' },
];

/** Styleable `::part`s of `<kai-conversations>`. */
export const CONVERSATIONS_PARTS: PartDef[] = [
  {
    name: 'trailing',
    doc: 'The right-aligned trailing text on each conversation row (a count, status, or relative time). Set it per item via the `trailing` field; otherwise a short auto relative time is derived from `updatedAt`. Recolor or resize it from outside.',
    recipe: 'kai-conversations::part(trailing) { color: var(--color-primary); font-variant-numeric: tabular-nums }',
  },
  {
    name: 'items',
    doc: 'The item-mode listbox region wrapping your slotted `<kai-conversation-item>` children.',
    recipe: 'kai-conversations::part(items) { gap: 2px }',
  },
];

/** Slots of `<kai-conversation-item>` — one composed row of a consumer-owned
 *  conversation loop (the default slot is the title). */
export const CONVERSATION_ITEM_SLOTS: SlotDef[] = [
  { name: 'leading', mode: 'inject', part: true, doc: 'Leading region before the title (an icon or avatar).' },
  { name: 'meta', mode: 'inject', part: true, doc: 'Meta region under the title (a timestamp or status line).' },
  { name: 'menu', mode: 'inject', part: true, doc: 'Your own row menu (a popover trigger). Never selects the row.' },
];

/** Styleable `::part`s of `<kai-conversation-item>`. (`leading`/`meta`/`menu`
 *  are covered by their slot defs' `part: true` flags.) */
export const CONVERSATION_ITEM_PARTS: PartDef[] = [
  {
    name: 'body',
    doc: 'The activation surface inside the row (button role; carries aria-current and the roving tabindex). The focus ring paints here.',
    recipe: 'kai-conversation-item::part(body) { outline-offset: 2px }',
  },
  {
    name: 'row',
    doc: 'The whole row surface. Carries `data-active` while selected.',
    recipe: 'kai-conversation-item::part(row) { border-radius: 0.5rem }',
  },
  {
    name: 'title',
    doc: 'The title line (the default slot renders inside it).',
    recipe: 'kai-conversation-item::part(title) { font-weight: 600 }',
  },
  {
    name: 'unread',
    doc: 'The unread indicator dot at the body\'s trailing edge, before the `menu` region (renders only while the `unread` flag is set; a screen-reader "Unread" label rides along).',
    recipe: 'kai-conversation-item::part(unread) { background: var(--color-primary) }',
  },
];

/** Slots of `<kai-message>` — per-message composition seams. `before-body` and
 *  `after-body` are INJECT regions inside the message's body column; `avatar`
 *  REPLACES the built-in avatar rail (pair it with `avatar="none"` to omit the
 *  rail entirely). These are the keystone of compose-your-own message lists. */
export const MESSAGE_SLOTS: SlotDef[] = [
  { name: 'before-body', mode: 'inject',  doc: 'A per-message header at the TOP of the body, above reasoning/tools/content: a model-name label, a role + timestamp line.' },
  { name: 'after-body',  mode: 'inject',  doc: 'A row at the BOTTOM of the body, below the action bar: a citation/sources row, a token-cost/latency line.' },
  { name: 'avatar',      mode: 'replace', part: true, doc: 'Replaces the built-in avatar rail with your own node. Use `avatar="none"` to omit the rail and let the body span the full row.' },
];

/** Slots of `<kai-notice>`. The message is the default slot; these are the named seams. */
export const NOTICE_SLOTS: SlotDef[] = [
  { name: 'action', mode: 'inject',  doc: 'A trailing action beside the message: a link or button.' },
  { name: 'icon',   mode: 'replace', doc: 'A custom leading icon (any inline SVG, inherits `currentColor`). Overrides the severity default and the `icon` prop, the same escape hatch as `kai-button`.' },
];

/** Slots of `<kai-button>` (the label is the default slot). */
export const BUTTON_SLOTS: SlotDef[] = [
  { name: 'icon', mode: 'replace', doc: 'A custom leading icon (any inline SVG, inherits `currentColor`). Wins over the `icon` prop.' },
];

/** Slots of `<kai-hover-card>` (the trigger is the default slot). */
export const HOVER_CARD_SLOTS: SlotDef[] = [
  { name: 'card', mode: 'inject', doc: 'The rich content shown in the floating hover card.' },
];

/** Slots of `<kai-menu>` (the menu items come from the `items` prop). */
export const MENU_SLOTS: SlotDef[] = [
  { name: 'trigger', mode: 'replace', doc: 'Your own trigger element; replaces the built-in button driven by the `trigger-icon` / `trigger-label` props.' },
];

/** A styleable `::part` the kit renders (NOT a slot — you don't project into it;
 *  you restyle it from outside via `::part(name)`). This registry is the source
 *  of truth so the styling surface is discoverable: docs + the `kai` MCP
 *  component reference are generated from it, the same way slots are. The
 *  `recipe` is a copy-pasteable example — including the "just hide it" case that
 *  is pure CSS and therefore intentionally NOT a prop. */
export interface PartDef {
  /** `::part(name)` exposed for consumer styling. */
  name: string;
  /** One-line contract: what the part is. */
  doc: string;
  /** A copy-pasteable styling example for docs / the MCP reference. */
  recipe?: string;
}

/** Styleable `::part`s of `<kai-chat>` (beyond the slot-backed `header`/`sidebar`/
 *  `footer` parts). */
export const CHAT_PARTS: PartDef[] = [
  {
    name: 'header-bar',
    doc: 'The built-in header bar (the title / model-switcher / context row that hosts the header-start/header-end inject slots). Restyle its height, padding, or gap from outside without replacing the whole header via the `header` slot.',
    recipe: 'kai-chat::part(header-bar) { height: 3.5rem; padding-inline: 1rem; gap: 0.5rem }',
  },
];

/** Styleable `::part`s of `<kai-prompt-input>`. */
export const PROMPT_INPUT_PARTS: PartDef[] = [
  {
    name: 'send',
    doc: 'The send button. Restyle from outside, or hide it entirely (Enter-only). Hiding is pure CSS, which is why there is no `submit="never"`.',
    recipe: 'kai-prompt-input::part(send) { display: none } /* Enter-only; or restyle: background, border-radius, … */',
  },
];

/** Styleable `::part`s of `<kai-button>`. */
export const BUTTON_PARTS: PartDef[] = [
  {
    name: 'button',
    doc: 'The button element. Restyle radius, padding, colors, or weight from outside; the `variant`/`size` props set the defaults.',
    recipe: 'kai-button::part(button) { border-radius: 9999px; font-weight: 600 }',
  },
];

/** Styleable `::part`s of `<kai-badge>`. */
export const BADGE_PARTS: PartDef[] = [
  {
    name: 'badge',
    doc: 'The badge pill. Restyle its background, color, or shape; the `variant` prop (default/count/citation) sets the defaults.',
    recipe: 'kai-badge::part(badge) { background: var(--color-primary); color: var(--color-primary-foreground) }',
  },
];

/** Styleable `::part`s of `<kai-icon>`. */
export const ICON_PARTS: PartDef[] = [
  {
    name: 'icon',
    doc: 'The icon wrapper. Inherits `currentColor` and the `size` prop by default; recolor or resize it from outside.',
    recipe: 'kai-icon::part(icon) { color: var(--color-primary) }',
  },
];

/** Styleable `::part`s of `<kai-separator>`. */
export const SEPARATOR_PARTS: PartDef[] = [
  {
    name: 'separator',
    doc: 'The divider line. Restyle its color, thickness, or inset from outside.',
    recipe: 'kai-separator::part(separator) { background: var(--color-border) }',
  },
];

/** Styleable `::part`s of `<kai-scroll-area>`. */
export const SCROLL_AREA_PARTS: PartDef[] = [
  {
    name: 'viewport',
    doc: 'The scrolling container. Add padding or a max-height from outside; the thin scrollbar follows `--color-scrollbar-thumb`.',
    recipe: 'kai-scroll-area::part(viewport) { padding-right: 0.5rem }',
  },
];

/** Styleable `::part`s of `<kai-skeleton>`. */
export const SKELETON_PARTS: PartDef[] = [
  {
    name: 'skeleton',
    doc: 'The shimmer block(s). Recolor or change the opacity from outside; the default is a low-contrast foreground tint that reads in both light and dark.',
    recipe: 'kai-skeleton::part(skeleton) { background: var(--color-primary); opacity: 0.15 }',
  },
];

/**
 * The parts of ONE attachment item, declared by `components/attachments.tsx`
 * and therefore surfaced by every element that renders an attachment — the
 * standalone `<kai-attachments>` AND the thread inside `<kai-message>` /
 * `<kai-chat>`. Shared rather than duplicated so the two can never document
 * different names for the same node.
 *
 * These are a styling seam and a TESTING seam, and the second is why they exist
 * at all. `examples/internal/openrouter-spike` proves "a user can see which file
 * was attached" by locating these; before they existed it pinned the chip by
 * `span.truncate` and broke the day the thread moved to the grid tile, while the
 * filename was still plainly on screen. A published part is what lets an
 * assertion name the thing rather than its current markup.
 */
export const ATTACHMENT_ITEM_PARTS: PartDef[] = [
  {
    name: 'attachment',
    doc: 'One attachment item: the chip, row or tile, whichever variant is rendering. Restyle its background, radius or border from outside without caring which layout it is.',
    recipe: 'kai-chat::part(attachment) { border-radius: 0.25rem }',
  },
  {
    name: 'attachment-name',
    doc: 'The attachment’s filename label. Present in every variant that shows one (a grid tile omits it for an image, which is its own label). Retune its type or hide it entirely.',
    recipe: 'kai-chat::part(attachment-name) { font-size: 0.75rem }',
  },
];

/** Styleable `::part`s of `<kai-message>`. (The `avatar` part is contributed by
 *  the `avatar` slot's `part: true` flag, so it is not repeated here.) */
export const MESSAGE_PARTS: PartDef[] = [
  {
    name: 'row',
    doc: 'The message row wrapper (avatar rail + body column). Restyle its gap or alignment from outside.',
    recipe: 'kai-message::part(row) { gap: 0.75rem }',
  },
  {
    name: 'bubble',
    doc: 'The content bubble wrapper. Restyle its background, radius, or padding; for a user message this is the rounded chat bubble.',
    recipe: 'kai-message::part(bubble) { background: var(--color-primary); color: var(--color-primary-foreground) }',
  },
  {
    name: 'content',
    doc: 'The rendered message text/markdown region (same node as `bubble`). Target it to tune typography from outside.',
    recipe: 'kai-message::part(content) { font-size: 0.9375rem }',
  },
  {
    name: 'actions',
    doc: 'The action-bar row (copy / like / regenerate …). Restyle its spacing or hide it entirely from outside.',
    recipe: 'kai-message::part(actions) { gap: 0.25rem }',
  },
  {
    name: 'citations',
    doc: 'The citation row rendered from the message’s `source` parts: a wrapped row of chips below the bubble, never inside it. Restyle its spacing or hide it entirely from outside.',
    recipe: 'kai-message::part(citations) { gap: 0.5rem }',
  },
  // A message renders its `file` parts through the same Attachment chrome
  // `<kai-attachments>` uses, so it exposes the same handles. Shared, not
  // restated — see ATTACHMENT_ITEM_PARTS.
  ...ATTACHMENT_ITEM_PARTS,
];

/** Styleable `::part`s of `<kai-attachments>`. */
export const ATTACHMENTS_PARTS: PartDef[] = [
  {
    name: 'preview',
    doc: 'The image shown in an attachment’s hover-card preview. Bounded by default (max ~320×256, aspect preserved) so a large image never blows up the card. Raise or lower the cap from outside.',
    recipe: 'kai-attachments::part(preview) { max-width: 32rem; max-height: 24rem }',
  },
  ...ATTACHMENT_ITEM_PARTS,
];

/** Styleable `::part`s of `<kai-status>`. */
export const STATUS_PARTS: PartDef[] = [
  {
    name: 'dot',
    doc: 'The status dot. Recolor or resize it from outside; the `status` prop sets the default hue.',
    recipe: 'kai-status::part(dot) { background: var(--color-tool-green) }',
  },
];

/** Styleable `::part`s of `<kai-tabs>`. */
export const TABS_PARTS: PartDef[] = [
  {
    name: 'tablist',
    doc: 'The tab strip container (role="tablist"). Restyle its gap, padding, background, or radius from outside; the `variant` prop sets the segmented/underline defaults.',
    recipe: 'kai-tabs::part(tablist) { gap: 0.5rem; background: var(--color-card) }',
  },
  {
    name: 'tab',
    doc: 'A single tab button. Restyle from outside; the active tab carries a `[data-active]` attribute, so target `::part(tab)[data-active]` for the selected look.',
    recipe: 'kai-tabs::part(tab)[data-active] { color: var(--color-primary); font-weight: 600 }',
  },
];

/** Styleable `::part`s of `<kai-voice-output>`. */
export const VOICE_OUTPUT_PARTS: PartDef[] = [
  {
    name: 'button',
    doc: 'The speaker/play button. Restyle radius, size, padding, or colors from outside; it is a ghost icon button by default.',
    recipe: 'kai-voice-output::part(button) { border-radius: 9999px; color: var(--color-primary) }',
  },
];

/** Slots of `<kai-screen>` (the default slot is the screen body). */
export const SCREEN_SLOTS: SlotDef[] = [
  { name: 'title', mode: 'replace', part: true, doc: 'Rich header title; overrides the `headline` prop.' },
  { name: 'actions', mode: 'inject', doc: 'Header trailing cluster (e.g. an avatar or overflow menu).' },
];

/** Styleable `::part`s of `<kai-screen>`. */
export const SCREEN_PARTS: PartDef[] = [
  {
    name: 'header',
    doc: 'The back-header bar (back button + title + actions). Restyle its height, padding, or border from outside.',
    recipe: 'kai-screen::part(header) { height: 3.25rem; padding-inline: 1rem }',
  },
  {
    name: 'back',
    doc: 'The back button. Restyle or hide it from outside; `back="false"` removes it entirely.',
    recipe: 'kai-screen::part(back) { border-radius: 9999px }',
  },
  {
    name: 'body',
    doc: 'The full-bleed surface that fills the mount point and scrolls its content. Tune padding or background from outside.',
    recipe: 'kai-screen::part(body) { background: var(--color-card) }',
  },
];

/** Slots of `<kai-card>` — structural regions only (the title/description are body
 *  or `slot="header"` content you mark up). The body is the default slot. */
export const CARD_SLOTS: SlotDef[] = [
  { name: 'media', mode: 'inject', doc: 'Full-bleed media (image/video/illustration) at the top (vertical) or start (horizontal). Clipped to the card corners.' },
  { name: 'header', mode: 'inject', doc: 'Header content, e.g. a title. Rendered above the body.' },
  { name: 'header-actions', mode: 'inject', doc: 'An actions cluster pinned to the end of the header row.' },
  { name: 'footer', mode: 'inject', doc: 'Footer content rendered below the body.' },
  { name: 'footer-actions', mode: 'inject', doc: 'Action buttons pinned to the end of the footer. Do NOT combine with a clickable/href card (nested interactive).' },
];

/** Styleable `::part`s of `<kai-card>`. */
export const CARD_PARTS: PartDef[] = [
  {
    name: 'card',
    doc: 'The card root (a div, or an a when href is set). Restyle its radius, border, or background; set --kai-card-spacing for padding/gaps (the dense prop sets the compact default).',
    recipe: 'kai-card::part(card) { border-radius: 1rem; --kai-card-spacing: 1.5rem }',
  },
  {
    name: 'media',
    doc: 'The full-bleed media region. Cap or crop it from outside (e.g. a fixed height with object-fit).',
    recipe: 'kai-card::part(media) { max-height: 12rem }',
  },
  {
    name: 'header',
    doc: 'The header row (header content + header-actions). Add a divider or adjust its alignment.',
    recipe: 'kai-card::part(header) { border-bottom: 1px solid var(--color-border) }',
  },
  {
    name: 'body',
    doc: 'The default-slot body region.',
    recipe: 'kai-card::part(body) { font-size: 0.9375rem }',
  },
  {
    name: 'footer',
    doc: 'The footer row (footer content + footer-actions).',
    recipe: 'kai-card::part(footer) { border-top: 1px solid var(--color-border) }',
  },
  {
    name: 'dismiss',
    doc: 'The dismiss (×) button shown when dismissible. Recolor or reposition it from outside.',
    recipe: 'kai-card::part(dismiss) { color: var(--color-muted-foreground) }',
  },
];

/** Slots of `<kai-workspace>` (the five shell regions; main also takes the default slot). */
export const WORKSPACE_SLOTS: SlotDef[] = [
  { name: 'header', mode: 'inject', part: true, doc: 'The top band across the full shell width (app bar, tabs, breadcrumbs).' },
  { name: 'start', mode: 'inject', part: true, doc: 'The inline-start aside column (a conversation rail, a nav, a file tree). Resizable and collapsible.' },
  { name: 'main', mode: 'inject', part: true, doc: 'The main region. Unnamed children project here too, via the default slot.' },
  { name: 'end', mode: 'inject', part: true, doc: 'The inline-end aside column (inspector, notes, preview). Resizable and collapsible.' },
  { name: 'footer', mode: 'inject', part: true, doc: 'The bottom band across the full shell width (status bar, disclaimers).' },
];

/** Styleable `::part`s of `<kai-workspace>` (beyond the slot-backed header/start/main/end/footer parts). */
export const WORKSPACE_PARTS: PartDef[] = [
  {
    name: 'aside',
    doc: 'Both aside columns match this part (each also matches its own start/end part). Restyle the shared aside surface or border from outside; the --kai-workspace-start-* and --kai-workspace-end-* custom properties set the widths.',
    recipe: 'kai-workspace::part(aside) { background: var(--color-card) }',
  },
];

/** Styleable `::part`s of `<kai-nav>`. */
export const NAV_PARTS: PartDef[] = [
  {
    name: 'nav',
    doc: 'The nav list container. Restyle its gap or padding from outside.',
    recipe: 'kai-nav::part(nav) { gap: 0.25rem }',
  },
  {
    name: 'item',
    doc: 'A nav item button (leaf or group parent). The active leaf carries aria-current="page" and a group parent carries aria-expanded; target `::part(item)[aria-current]` for the selected look or `::part(item)[aria-expanded]` for a group row.',
    recipe: 'kai-nav::part(item)[aria-current] { background: var(--color-accent) }',
  },
  {
    name: 'group',
    doc: 'The nested child list rendered under an expanded group item. Add a left guide line or tune its indent from outside.',
    recipe: 'kai-nav::part(group) { border-left: 1px solid var(--color-border); margin-left: 1.1rem }',
  },
  {
    name: 'chevron',
    doc: 'The disclosure chevron on a group row (rotates when expanded). Recolor or resize it from outside.',
    recipe: 'kai-nav::part(chevron) { opacity: 1; color: var(--color-primary) }',
  },
  {
    name: 'status',
    doc: 'The per-item status cluster (a colored dot in the tone hue + an optional label). Shown only when an item carries a `status`; the `pulse` flag animates the dot. Restyle from outside.',
    recipe: 'kai-nav::part(status) { gap: 0.5rem }',
  },
  {
    name: 'meta',
    doc: 'The right-aligned muted trailing text on a row (e.g. a relative time). Shown only when an item carries `meta`; restyle from outside.',
    recipe: 'kai-nav::part(meta) { color: var(--color-foreground); font-variant-numeric: tabular-nums }',
  },
  {
    name: 'item-action',
    doc: 'The trailing per-item action / close button, a sibling of the item button. Shown only when an item carries `action` or `closable`; reveal it on hover or pin it visible from outside.',
    recipe: 'kai-nav::part(item-action) { opacity: 1 }',
  },
];

/** Slots of `<kai-coachmark>` (the anchor/trigger is the default slot). */
export const COACHMARK_SLOTS: SlotDef[] = [
  { name: 'content', mode: 'replace', doc: 'The bubble body text shown under the headline.' },
];

/** Styleable `::part`s of `<kai-coachmark>`. */
export const COACHMARK_PARTS: PartDef[] = [
  { name: 'bubble', doc: 'The hint bubble panel. Restyle its background, radius, or padding from outside; the default is bg-primary.', recipe: 'kai-coachmark::part(bubble) { border-radius: 1rem }' },
  { name: 'arrow', doc: 'The arrow pointing at the anchor. Inherits the bubble color; recolor it alongside the bubble.', recipe: 'kai-coachmark::part(arrow) { background: var(--color-accent) }' },
  { name: 'badge', doc: 'The small badge pill beside the headline (e.g. "New").', recipe: 'kai-coachmark::part(badge) { text-transform: none }' },
  { name: 'title', doc: 'The bold headline text.', recipe: 'kai-coachmark::part(title) { font-size: 0.9375rem }' },
  { name: 'dismiss', doc: 'The dismiss button. Recolor or reposition it from outside.', recipe: 'kai-coachmark::part(dismiss) { color: var(--color-primary-foreground) }' },
];

/** Styleable `::part`s of `<kai-progress-bar>`. */
export const PROGRESS_BAR_PARTS: PartDef[] = [
  { name: 'track', doc: 'The progress track (the background bar). Restyle its height, radius, or background from outside.', recipe: 'kai-progress-bar::part(track) { height: 0.5rem }' },
  { name: 'fill', doc: 'The filled portion; its width follows value/max. Recolor it from outside.', recipe: 'kai-progress-bar::part(fill) { background: var(--color-tool-green) }' },
];

/** Styleable `::part`s of `<kai-context>`. The usage meter is the same shared
 *  ProgressBar `<kai-progress-bar>` renders, mounted inside this element's own
 *  shadow root, so `kai-context` exposes the same two names. Both sit inside the
 *  hover-card breakdown and are in the DOM only while that card is open. */
export const CONTEXT_PARTS: PartDef[] = [
  { name: 'track', doc: 'The usage meter track inside the hover-card breakdown. Carries `role="progressbar"` and is in the DOM only while the card is open. Restyle its height, radius, or background from outside.', recipe: 'kai-context::part(track) { height: 0.5rem }' },
  { name: 'fill', doc: 'The used-tokens portion of that meter. Its width follows `usedTokens / maxTokens`; its default color is the severity hue picked by `warnThreshold` / `dangerThreshold`, so recoloring it from outside replaces that signal.', recipe: 'kai-context::part(fill) { background: var(--color-tool-blue) }' },
];

/** Styleable `::part`s of `<kai-file-tree>` — the changed-files / diff bits, shown
 *  only when a file carries diff metadata (or the `summary` attribute is set). */
export const FILE_TREE_PARTS: PartDef[] = [
  {
    name: 'summary',
    doc: 'The changed-files summary header (the file count, the summed +additions/-deletions, and the Collapse-all/Expand-all toggle). Rendered only when the `summary` attribute is set; restyle or hide it from outside.',
    recipe: 'kai-file-tree::part(summary) { border-bottom: none; padding-block: 0.5rem }',
  },
  {
    name: 'status',
    doc: 'The per-row change-status letter (A/M/D/R/U), shown when a file carries a `status`. Colored with the conventional VCS tool hues; restyle from outside.',
    recipe: 'kai-file-tree::part(status) { font-weight: 700 }',
  },
  {
    name: 'stat-additions',
    doc: 'The trailing `+N` additions stat on a file row (success/green tool hue, tabular-nums). Shown only when a file carries `additions`.',
    recipe: 'kai-file-tree::part(stat-additions) { color: var(--color-tool-green) }',
  },
  {
    name: 'stat-deletions',
    doc: 'The trailing `-N` deletions stat on a file row (error/red tool hue, tabular-nums). Shown only when a file carries `deletions`.',
    recipe: 'kai-file-tree::part(stat-deletions) { color: var(--color-tool-red) }',
  },
];

/**
 * Per-element composition surface — the SINGLE registry the build extracts
 * (`scripts/gen-element-api.mjs`) into `element-meta.json`, the Custom Elements
 * Manifest (`cssParts`/`slots`), `docs/web-components.md`, and the `kai` MCP
 * `component_reference`. Each entry maps a `kai-*` tag to the slots it projects
 * and the `::part`s it exposes for styling. Slots flagged `part: true` are ALSO
 * styleable parts, so they surface in both places.
 *
 * Adding a `part="…"` in a facade/component without registering it here fails the
 * `slots.test.ts` drift guard — keep this in sync with the source.
 */
export interface ElementComposition {
  slots?: SlotDef[];
  parts?: PartDef[];
  /**
   * What the element's DEFAULT (unnamed) `<slot>` projects — i.e. what a consumer
   * puts between the tags. Kept OUT of `slots` on purpose: those arrays are also
   * read at runtime by `readSlots()`, which would query a meaningless `[slot=""]`.
   * scripts/gen-element-api.mjs merges it back in as a slot with the empty name,
   * which is how the Custom Elements Manifest spells the default slot.
   *
   * Every facade that renders a bare `<slot />` needs one; guarded by
   * tests/elements/slot-registry-coverage.test.ts.
   */
  children?: string;
}

/** Slots + styleable `::part`s of `<kai-prompt-dock>`. */
export const PROMPT_DOCK_SLOTS: SlotDef[] = [
  { name: 'top',    mode: 'inject', part: true, doc: 'The top lip: a notice or banner above the input. Rendered only when filled.' },
  { name: 'bottom', mode: 'inject', part: true, doc: 'The bottom lip: a mode or controls row below the input. Rendered only when filled.' },
];
export const PROMPT_DOCK_PARTS: PartDef[] = [
  {
    name: 'tray',
    doc: 'The recessed tray that frames the input. The `appearance`/`frame` props set the defaults; the --kai-prompt-dock-* tokens fine-tune surface/border/radius/inset.',
    recipe: 'kai-prompt-dock::part(tray) { --kai-prompt-dock-radius: 1rem }',
  },
];

/** Slots + styleable `::part`s of `<kai-dock>` (the floating corner launcher — not
 *  `<kai-prompt-dock>`, which is an in-flow tray around a prompt input). */
export const DOCK_SLOTS: SlotDef[] = [
  { name: 'panel',         mode: 'replace', part: true, doc: 'The panel body. ANY element: a `<kai-chat>`, a form, your own component. The dock never reads or types it, and the default slot is the same region.' },
  { name: 'launcher',      mode: 'inject',  doc: 'Content inside the built-in button while CLOSED; defaults to a chat glyph. Text works as well as an icon: the button keeps its height and grows sideways into a pill, so a label like "Support" is not clipped. The BUTTON is never slotted away, because it owns aria-expanded, aria-controls, the toggle wiring and the focus return.' },
  { name: 'launcher-open', mode: 'inject',  doc: 'Content inside the button while OPEN; defaults to a ✕. Fill only `launcher` and that glyph stays while open rather than morphing into a built-in that clashes with it.' },
];
export const DOCK_PARTS: PartDef[] = [
  { name: 'launcher', doc: 'The launcher button pinned to the corner: a disc by default, a pill once you slot a text label. Restyle its surface or shadow; --kai-dock-launcher-size sets its height and its minimum width.', recipe: 'kai-dock::part(launcher) { background: var(--color-info) }' },
  { name: 'badge', doc: 'The unread dot on the launcher, rendered only while closed and only when `unread` is set. Restyle its color or size.', recipe: 'kai-dock::part(badge) { background: var(--color-success) }' },
];

/** Styleable `::part`s of `<kai-segmented>`. */
export const SEGMENTED_PARTS: PartDef[] = [
  { name: 'track', doc: 'The segmented track (the pill container holding the segments). Restyle its background, radius, or padding.', recipe: 'kai-segmented::part(track) { border-radius: 9999px }' },
  { name: 'segment', doc: 'Each segment button. Restyle padding, font weight, or the selected look.', recipe: 'kai-segmented::part(segment) { font-weight: 600 }' },
];

/** Styleable `::part`s of `<kai-settings-group>`. */
export const SETTINGS_GROUP_PARTS: PartDef[] = [
  { name: 'header', doc: 'The group heading + description block. Restyle its spacing or typography.', recipe: 'kai-settings-group::part(header) { margin-bottom: 0.75rem }' },
  { name: 'body', doc: 'The bordered card holding the setting rows. Restyle its surface, border, or radius.', recipe: 'kai-settings-group::part(body) { border-radius: 1rem }' },
];

/** Slots + styleable `::part`s of `<kai-setting-item>`. */
export const SETTING_ITEM_SLOTS: SlotDef[] = [
  { name: 'control', mode: 'inject', part: true, doc: 'The row control (a switch, segmented, select, etc.), right-aligned. Omit it for a label-only row.' },
];
export const SETTING_ITEM_PARTS: PartDef[] = [
  { name: 'label', doc: 'The label + description block on the left of the row. Restyle its typography or spacing.', recipe: 'kai-setting-item::part(label) { gap: 0.125rem }' },
];

/** Slots + styleable `::part`s of `<kai-pane>` (the editor-group pane frame). */
export const PANE_SLOTS: SlotDef[] = [
  { name: 'leading', mode: 'inject', doc: 'A glyph or avatar at the start of the pane header.' },
  { name: 'actions', mode: 'inject', doc: 'Extra header controls, before the built-in window controls.' },
  { name: 'footer', mode: 'inject', part: true, doc: 'A pinned row below the body (e.g. a composer).' },
];
export const PANE_PARTS: PartDef[] = [
  { name: 'header', doc: 'The pane header bar (leading + title/status + actions + window controls).', recipe: 'kai-pane::part(header) { padding-inline: 0.75rem }' },
  { name: 'body', doc: 'The scrolling body region (the default slot).', recipe: 'kai-pane::part(body) { padding: 1rem }' },
  { name: 'controls', doc: 'The window-control cluster (maximize/close, and split/dock when enabled).', recipe: 'kai-pane::part(controls) { gap: 0.25rem }' },
];

/** Styleable `::part`s of `<kai-agent-card>`. */
export const AGENT_CARD_PARTS: PartDef[] = [
  { name: 'status', doc: 'The leading tone-colored status dot.', recipe: 'kai-agent-card::part(status) { width: 0.625rem; height: 0.625rem }' },
  { name: 'menu', doc: 'The trailing overflow ("...") menu button.', recipe: 'kai-agent-card::part(menu) { opacity: 1 }' },
];

/** Styleable `::part`s of `<kai-code-block>` (one syntax-highlighted code block).
 *  The code region itself is not a part — it is rebuilt when the highlight lands,
 *  and its look is owned by the Shiki theme (`code-theme`). */
export const CODE_BLOCK_PARTS: PartDef[] = [
  { name: 'copy', doc: 'The copy-to-clipboard button in the header row. Hide it with `copy="false"` rather than CSS.', recipe: 'kai-code-block::part(copy) { color: var(--color-primary) }' },
];

/** Slots + styleable `::part`s of `<kai-dialog>` (the centered modal). */
export const DIALOG_SLOTS: SlotDef[] = [
  { name: 'header', mode: 'inject', part: true, doc: 'Optional title region at the top of the panel.' },
  { name: 'footer', mode: 'inject', part: true, doc: 'Optional actions region at the bottom of the panel.' },
];
export const DIALOG_PARTS: PartDef[] = [
  { name: 'backdrop', doc: 'The full-area scrim behind the panel. Restyle its color/blur.', recipe: 'kai-dialog::part(backdrop) { background: rgb(0 0 0 / 0.6) }' },
  { name: 'panel', doc: 'The centered modal panel. Restyle width, radius, padding.', recipe: 'kai-dialog::part(panel) { max-width: 32rem }' },
  { name: 'body', doc: 'The scrolling content region (the default slot).', recipe: 'kai-dialog::part(body) { padding: 1.25rem }' },
];

/** Styleable `::part`s of `<kai-pane-group>` (the editor group: a tab strip over
 *  the active tab's pane). The per-tab content slots are NAMED DYNAMICALLY by tab
 *  id (`slot="<tab id>"`) plus a default slot, so they are not enumerable here —
 *  only the styleable parts are registered. */
export const PANE_GROUP_PARTS: PartDef[] = [
  { name: 'tabs', doc: 'The tab strip (role="tablist"). Restyle its background, height, padding, or gap from outside.', recipe: 'kai-pane-group::part(tabs) { background: var(--color-card); gap: 0.25rem }' },
  { name: 'tab', doc: 'A single tab button. The active tab carries `[aria-selected="true"]`; target `::part(tab)[aria-selected="true"]` for the selected look.', recipe: 'kai-pane-group::part(tab)[aria-selected="true"] { background: var(--color-accent) }' },
  { name: 'body', doc: 'The active tab\'s content region (the named/default slot host).', recipe: 'kai-pane-group::part(body) { padding: 0.75rem }' },
  { name: 'menu', doc: 'The per-tab "…" overflow button. Reveal it on hover or pin it visible from outside.', recipe: 'kai-pane-group::part(menu) { opacity: 1 }' },
  { name: 'close', doc: 'The per-tab close ("×") button. Recolor, resize, or hide it from outside.', recipe: 'kai-pane-group::part(close) { color: var(--color-muted-foreground) }' },
];

/** Affix slots + styleable `::part`s of `<kai-input>` (the field shell). */
export const INPUT_SLOTS: SlotDef[] = [
  { name: 'leading', mode: 'inject', doc: 'A glyph, prefix, or affix at the start of the field, inside the border.' },
  { name: 'trailing', mode: 'inject', doc: 'A button, unit, or affix at the end of the field, inside the border.' },
];
export const INPUT_PARTS: PartDef[] = [
  { name: 'field', doc: 'The bordered control box (the row wrapping any affixes plus the input). Restyle its border, radius, surface, or focus ring.', recipe: 'kai-input::part(field) { border-radius: 0.75rem }' },
  { name: 'input', doc: 'The inner input element. Restyle its text, padding, or placeholder.', recipe: 'kai-input::part(input) { font-variant-numeric: tabular-nums }' },
  { name: 'label', doc: 'The field label above the control. Restyle its typography or spacing.', recipe: 'kai-input::part(label) { font-weight: 600 }' },
  { name: 'hint', doc: 'The hint or error line below the control. Restyle its typography.', recipe: 'kai-input::part(hint) { font-style: italic }' },
];

/** Styleable `::part`s of `<kai-search>` (the debounced filter field; composes the
 *  kai-input field plus a clear button). */
export const SEARCH_PARTS: PartDef[] = [
  { name: 'field', doc: 'The bordered control box (the row wrapping the search icon, input, and clear button).', recipe: 'kai-search::part(field) { border-radius: 9999px }' },
  { name: 'input', doc: 'The inner search input element.', recipe: 'kai-search::part(input) { font-size: 0.875rem }' },
  { name: 'clear', doc: 'The trailing clear ("x") button, shown when the field is non-empty.', recipe: 'kai-search::part(clear) { opacity: 1 }' },
];

/** Styleable `::part`s of `<kai-editable-label>` (inline rename; the edit field is the kai-input field). */
export const EDITABLE_LABEL_PARTS: PartDef[] = [
  { name: 'text', doc: 'The read-mode label text. Restyle its typography; it swaps to the input on edit.', recipe: 'kai-editable-label::part(text) { font-weight: 600 }' },
  { name: 'input', doc: 'The edit-mode input (the composed kai-input field).', recipe: 'kai-editable-label::part(input) { font: inherit }' },
];

/** Styleable `::part`s of `<kai-kbd>` (the keyboard-shortcut display). */
export const KBD_PARTS: PartDef[] = [
  { name: 'key', doc: 'Each key cap. Restyle its surface, border, radius, or font.', recipe: 'kai-kbd::part(key) { border-radius: 0.375rem }' },
  { name: 'separator', doc: 'The gap between key caps. Inject a literal joiner (e.g. a plus sign) from outside.', recipe: 'kai-kbd::part(separator)::after { content: "+" }' },
];

/** Styleable `::part`s of `<kai-command>` (the command palette). */
export const COMMAND_PARTS: PartDef[] = [
  { name: 'shortcut', doc: 'The right-aligned per-row keyboard shortcut, rendered as kai-kbd key caps. Shown only when a row carries a `shortcut`.', recipe: 'kai-command::part(shortcut) { opacity: 0.8 }' },
];

/** Styleable `::part`s of `<kai-menu>` (the actions dropdown). */
export const MENU_PARTS: PartDef[] = [
  { name: 'shortcut', doc: 'The right-aligned per-item keyboard shortcut, rendered as kai-kbd key caps. Shown only when an item carries a `shortcut`.', recipe: 'kai-menu::part(shortcut) { opacity: 0.8 }' },
];

/** Slots of `<kai-thread>` (the standalone scrolling message list; messages come
 *  from the `messages` prop). */
export const THREAD_SLOTS: SlotDef[] = [
  { name: 'empty', mode: 'replace', doc: 'Custom zero-state rendered in the message area while the thread is empty; replaces the built-in default.' },
];

/** Slots of `<kai-empty>`. The body is the default slot; `media` is the named seam. */
export const EMPTY_SLOTS: SlotDef[] = [
  { name: 'media', mode: 'replace', doc: 'The leading illustration or icon above the title (any inline SVG or <img>). Replaces the built-in media box.' },
];

/** Slots of `<kai-popover>`. The panel body is the default slot; `trigger` is the
 *  control the panel anchors to and opens from. */
export const POPOVER_SLOTS: SlotDef[] = [
  { name: 'trigger', mode: 'replace', doc: 'The control that opens the popover (a button, an avatar, …). The panel anchors to it.' },
];

/** Slots of `<kai-dropdown>`. The menu body is the default slot; `trigger` is the
 *  VISUAL content of the built-in trigger button (never your own `<button>`/`<a>`,
 *  which would nest interactive elements — the `kai-menu` rule). */
export const DROPDOWN_SLOTS: SlotDef[] = [
  { name: 'trigger', mode: 'replace', doc: 'Visual content of the trigger button (an icon, text, an `<svg>`). Replaces the built-in trigger* content; name it with `label`.' },
];

/** Styleable `::part`s of `<kai-audio-visualizer>`. Every DOM variant (`bar`,
 *  `grid`, `radial`) shares the `bar`/`cell` markup pattern; the shader variants
 *  (`wave`, `aurora`) share the `canvas` part. Lit items ALSO carry the
 *  `highlighted` part token, so `::part(bar highlighted)`/`::part(cell
 *  highlighted)` selects only the lit ones. `::part(bar)[data-kai-highlighted=
 *  "true"]` looks plausible but is invalid CSS: a CSS attribute selector
 *  cannot follow a pseudo-element (`CSS.supports(selector(...))` returns
 *  `false` for it in Chromium, and `insertRule` throws). `data-kai-index` /
 *  `data-kai-highlighted` still exist on the element for consumers reading
 *  them from INSIDE the shadow root or via the Solid render-prop; they are
 *  just not reachable from an external `::part()` selector. */
export const AUDIO_VISUALIZER_PARTS: PartDef[] = [
  {
    name: 'bar',
    doc: 'A single bar in the `bar` variant, or a single spoke in the `radial` variant. Also carries `data-kai-index` and `data-kai-highlighted` ("true"/"false") for use inside the shadow root; to style the lit state from OUTSIDE, combine with the `highlighted` part below rather than an attribute selector.',
    recipe: 'kai-audio-visualizer::part(bar) { border-radius: 2px }\nkai-audio-visualizer::part(bar highlighted) { background: var(--brand) }',
  },
  {
    name: 'cell',
    doc: 'A single dot in the `grid` variant. Also carries `data-kai-index` and `data-kai-highlighted` ("true"/"false") for use inside the shadow root; to style the lit state from OUTSIDE, combine with the `highlighted` part below rather than an attribute selector.',
    recipe: 'kai-audio-visualizer::part(cell) { border-radius: 9999px }\nkai-audio-visualizer::part(cell highlighted) { background: var(--brand) }',
  },
  {
    name: 'highlighted',
    doc: 'A second part TOKEN present on a `bar` or `cell` exactly when the sequencer or live audio has it lit, not a standalone styleable element. Combine it in the same `::part()` argument: `::part(bar highlighted)` or `::part(cell highlighted)`. This is the external equivalent of the internal `data-kai-highlighted="true"` attribute, which a `::part()` selector cannot reach (an attribute selector cannot follow a pseudo-element).',
    recipe: 'kai-audio-visualizer::part(bar highlighted) { background: var(--brand) }\nkai-audio-visualizer::part(cell highlighted) { background: var(--brand) }',
  },
  {
    name: 'canvas',
    doc: 'The WebGL canvas backing the `wave` and `aurora` variants. Restyle its size or radius, or layer a mask/filter, from outside.',
    recipe: 'kai-audio-visualizer::part(canvas) { border-radius: 0.75rem }',
  },
];

/** Slots of `<kai-panel>` — the widget panel frame (blocks-and-parts P-1). The
 *  default slot is the view container. */
export const PANEL_SLOTS: SlotDef[] = [
  { name: 'header', mode: 'inject', part: true, doc: 'The header region above the view container: put a `<kai-panel-header>` there, or anything. Keeps its natural height and never scrolls away.' },
  { name: 'footer', mode: 'inject', part: true, doc: 'The row below the view container (a "Powered by" line, a disclaimer). Keeps its natural height and never scrolls away.' },
];

/** Styleable `::part`s of `<kai-panel>`. (`header`/`footer` are covered by
 *  their slot defs' `part: true` flags.) */
export const PANEL_PARTS: PartDef[] = [
  {
    name: 'panel',
    doc: 'The panel frame itself: the flex column that fills the host. With the `frame` flag it carries the standalone border, radius and shadow.',
    recipe: 'kai-panel::part(panel) { border-radius: 1.25rem }',
  },
  {
    name: 'body',
    doc: 'The view container between header and footer: fills the remaining height, clips, and anchors floating children.',
    recipe: 'kai-panel::part(body) { background: var(--color-muted) }',
  },
];

/** Slots of `<kai-panel-header>` — the default slot is the title text. */
export const PANEL_HEADER_SLOTS: SlotDef[] = [
  { name: 'start', mode: 'inject', doc: 'The leading cluster, before the title: a back arrow, an avatar.' },
  { name: 'end', mode: 'inject', doc: 'The trailing cluster, after the title: a close or overflow button.' },
];

/** Styleable `::part`s of `<kai-panel-header>`. */
export const PANEL_HEADER_PARTS: PartDef[] = [
  {
    name: 'header',
    doc: 'The 56px header row itself (bottom border included).',
    recipe: 'kai-panel-header::part(header) { border-bottom: none }',
  },
  {
    name: 'start',
    doc: 'The leading cluster wrapper (the `start` slot renders inside it).',
    recipe: 'kai-panel-header::part(start) { gap: 0.25rem }',
  },
  {
    name: 'title',
    doc: 'The title line (the default slot renders inside it).',
    recipe: 'kai-panel-header::part(title) { font-weight: 700 }',
  },
  {
    name: 'end',
    doc: 'The trailing cluster wrapper (the `end` slot renders inside it).',
    recipe: 'kai-panel-header::part(end) { gap: 0.25rem }',
  },
];

/** Styleable `::part`s of `<kai-tab-bar>` (the tabs themselves are your
 *  slotted `<kai-tab-bar-item>` children). */
export const TAB_BAR_PARTS: PartDef[] = [
  {
    name: 'tablist',
    doc: 'The bar itself: the `role="tablist"` row the item children slot into.',
    recipe: 'kai-tab-bar::part(tablist) { border-top: 1px solid var(--color-border) }',
  },
];

/** Styleable `::part`s of `<kai-tab-bar-item>`. */
export const TAB_BAR_ITEM_PARTS: PartDef[] = [
  {
    name: 'tab',
    doc: 'The tab button (icon-over-label column). Carries `data-active` while selected.',
    recipe: 'kai-tab-bar-item::part(tab) { gap: 2px }',
  },
];

/** Slots of `<kai-row>` — the generic mobile list row (blocks-and-parts P-4).
 *  The default slot is the title; these are the named regions around it. */
export const ROW_SLOTS: SlotDef[] = [
  { name: 'leading', mode: 'inject', part: true, doc: 'Leading region before the title (an icon or avatar).' },
  { name: 'subtitle', mode: 'inject', part: true, doc: 'Secondary line under the title.' },
  { name: 'trailing', mode: 'inject', part: true, doc: 'Right-aligned trailing region (a timestamp, value, or badge).' },
];

/** Styleable `::part`s of `<kai-row>`. (`leading`/`subtitle`/`trailing` are
 *  covered by their slot defs' `part: true` flags.) */
export const ROW_PARTS: PartDef[] = [
  {
    name: 'row',
    doc: 'The whole row surface: the button when interactive, the anchor when `href` is set, a plain div otherwise.',
    recipe: 'kai-row::part(row) { border-radius: 0 }',
  },
  {
    name: 'title',
    doc: 'The title line (the default slot renders inside it).',
    recipe: 'kai-row::part(title) { font-weight: 600 }',
  },
  {
    name: 'chevron',
    doc: 'The trailing chevron affordance (renders only with the `chevron` flag).',
    recipe: 'kai-row::part(chevron) { color: var(--color-primary) }',
  },
];

export const ELEMENT_COMPOSITION: Record<string, ElementComposition> = {
  'kai-chat': { slots: CHAT_SLOTS, parts: CHAT_PARTS },
  'kai-command': { parts: COMMAND_PARTS },
  'kai-conversations': { slots: CONVERSATIONS_SLOTS, parts: CONVERSATIONS_PARTS, children: 'Your own `<kai-conversation-item>` rows (item mode: the consumer-owned loop). Data rows do not render while any are present.' },
  'kai-conversation-item': { slots: CONVERSATION_ITEM_SLOTS, parts: CONVERSATION_ITEM_PARTS, children: 'The row title. `leading`, `meta` and `menu` are the named regions around it.' },
  'kai-message': { slots: MESSAGE_SLOTS, parts: MESSAGE_PARTS },
  'kai-thread': { slots: THREAD_SLOTS },
  'kai-prompt-input': { slots: PROMPT_INPUT_SLOTS, parts: PROMPT_INPUT_PARTS },
  'kai-button': { slots: BUTTON_SLOTS, parts: BUTTON_PARTS, children: 'The button\'s label. Omit it for an icon-only button (pair with `aria-label`).' },
  'kai-badge': { parts: BADGE_PARTS, children: 'The badge\'s label: text, or a small inline icon plus text.' },
  'kai-icon': { parts: ICON_PARTS },
  'kai-separator': { parts: SEPARATOR_PARTS },
  'kai-scroll-area': { parts: SCROLL_AREA_PARTS, children: 'The scrollable content.' },
  'kai-notice': { slots: NOTICE_SLOTS, children: 'The notice message. `icon` and `action` are the named seams around it.' },
  'kai-hover-card': { slots: HOVER_CARD_SLOTS, children: 'The TRIGGER the card hovers off. The card body is the `card` slot.' },
  'kai-menu': { slots: MENU_SLOTS, parts: MENU_PARTS },
  'kai-skeleton': { parts: SKELETON_PARTS },
  'kai-attachments': { parts: ATTACHMENTS_PARTS },
  'kai-status': { parts: STATUS_PARTS },
  'kai-tabs': { parts: TABS_PARTS },
  'kai-voice-output': { parts: VOICE_OUTPUT_PARTS },
  'kai-screen': { slots: SCREEN_SLOTS, parts: SCREEN_PARTS, children: 'The screen body, below the title bar.' },
  'kai-card': { slots: CARD_SLOTS, parts: CARD_PARTS, children: 'The card body, below the header/media regions.' },
  'kai-workspace': { slots: WORKSPACE_SLOTS, parts: WORKSPACE_PARTS, children: 'The main region content (same region as the `main` slot): your `<kai-chat>`, or any app view.' },
  'kai-nav': { parts: NAV_PARTS },
  'kai-coachmark': { slots: COACHMARK_SLOTS, parts: COACHMARK_PARTS, children: 'The ANCHOR the coachmark points at: the element it attaches to and positions against. The bubble body is the `content` slot.' },
  'kai-progress-bar': { parts: PROGRESS_BAR_PARTS },
  'kai-context': { parts: CONTEXT_PARTS },
  'kai-file-tree': { parts: FILE_TREE_PARTS },
  'kai-prompt-dock': { slots: PROMPT_DOCK_SLOTS, parts: PROMPT_DOCK_PARTS, children: 'The input the dock wraps, typically a `<kai-prompt-input>`. The `top`/`bottom` slots are the lips around it.' },
  'kai-segmented': { parts: SEGMENTED_PARTS },
  'kai-settings-group': { parts: SETTINGS_GROUP_PARTS, children: 'The `<kai-setting-item>` rows in this group.' },
  'kai-setting-item': { slots: SETTING_ITEM_SLOTS, parts: SETTING_ITEM_PARTS },
  'kai-pane': { slots: PANE_SLOTS, parts: PANE_PARTS, children: 'The pane body, below the header row.' },
  'kai-pane-group': { parts: PANE_GROUP_PARTS, children: 'Content shown for every tab. Use it INSTEAD of the per-tab `slot="<tab id>"` seams when you swap the content yourself.' },
  'kai-agent-card': { parts: AGENT_CARD_PARTS },
  'kai-dialog': { slots: DIALOG_SLOTS, parts: DIALOG_PARTS, children: 'The dialog body, between the `header` and `footer` slots.' },
  'kai-dock': { slots: DOCK_SLOTS, parts: DOCK_PARTS, children: 'The panel body, the same region as `slot="panel"`.' },
  'kai-input': { slots: INPUT_SLOTS, parts: INPUT_PARTS },
  'kai-search': { parts: SEARCH_PARTS },
  'kai-kbd': { parts: KBD_PARTS, children: 'Literal key text, when you are not using the `keys` prop to render key caps.' },
  'kai-editable-label': { parts: EDITABLE_LABEL_PARTS },
  'kai-empty': { slots: EMPTY_SLOTS, children: 'The empty-state body below the title/description, usually the call to action.' },
  'kai-file-upload': { children: 'Custom dropzone content, replacing the default label (the `label` prop is the fallback).' },
  'kai-popover': { slots: POPOVER_SLOTS, children: 'The popover panel body. The control that opens it is the `trigger` slot.' },
  'kai-dropdown': { slots: DROPDOWN_SLOTS, children: 'The menu body: your own rows. Give each `role="menuitem"`. The control that opens it is the `trigger` slot.' },
  'kai-resizable': { children: 'The `<kai-resizable-item>` panels, in order. Dividers are inserted between them.' },
  'kai-resizable-item': { children: 'This panel\'s content.' },
  'kai-tooltip': { children: 'The TRIGGER the tooltip describes. The tip text is the `text` prop.' },
  'kai-code-block': { parts: CODE_BLOCK_PARTS },
  'kai-audio-visualizer': { parts: AUDIO_VISUALIZER_PARTS },
  'kai-panel': { slots: PANEL_SLOTS, parts: PANEL_PARTS, children: 'The view content that fills the body region (a `<kai-thread>`, a `<kai-view-stack>`, a home screen). Stretched to fill the remaining height between the `header` and `footer` slots.' },
  'kai-panel-header': { slots: PANEL_HEADER_SLOTS, parts: PANEL_HEADER_PARTS, children: 'The title text. `start` and `end` are the clusters around it: back arrows and close buttons are slotted content, never props.' },
  'kai-tab-bar': { parts: TAB_BAR_PARTS, children: 'The `<kai-tab-bar-item>` tabs, direct children in tab order.' },
  'kai-tab-bar-item': { parts: TAB_BAR_ITEM_PARTS, children: 'The tab\'s label text (it also names the tab for assistive tech, even in icon-only mode).' },
  'kai-view-stack': { children: 'The named `<kai-view>` children: tab roots (`tab-root`) side by side behind a tab bar, the rest drill views reached by `push()`.' },
  'kai-view': { children: 'This view\'s content. It stays mounted while hidden, so switching views resets nothing.' },
  'kai-row': { slots: ROW_SLOTS, parts: ROW_PARTS, children: 'The row title. `leading`, `subtitle` and `trailing` are the named regions around it.' },
};

/**
 * Which slots have VISIBLE projected light-DOM content: a DIRECT child of
 * `host` carrying the matching `slot` attribute and not `hidden`. Pure and
 * synchronous; safe in jsdom and SSR (returns all-false when `host` has no
 * matching children). The facade calls this on mount and on every childList
 * mutation.
 *
 * `:not([hidden])` is the whole of the visibility test, and it is here rather
 * than at each call site because this function is the ONE definition every
 * facade reads. A hidden assigned node still fills its slot as far as the
 * platform is concerned, so a built-in region wrapped around one reserved real
 * space for nothing anybody can see: measured at 2px on a conversation row
 * whose optional preview line is authored once and toggled with `hidden`,
 * against the same row built by adding and removing the node. That difference
 * is not a corner case under the authored block contract -- declarative markup
 * toggles VISIBILITY, where imperative markup toggled EXISTENCE -- so the two
 * shapes have to agree.
 *
 * Deliberately narrow: `hidden` only, not `display: none` or `visibility`.
 * Computed style is neither pure nor available in SSR, and `hidden` is the
 * channel the contract's `:hidden` binding writes.
 */
export function readSlots(host: Element, defs: SlotDef[] = CHAT_SLOTS): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const def of defs) {
    out[def.name] = !!host.querySelector(`:scope > [slot="${def.name}"]:not([hidden])`);
  }
  return out;
}
