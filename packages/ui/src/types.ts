// Types the chat kit components reference. Extracted from the kit's origin
// project (@tab-zen/shared) so the kit is self-contained. Only the types the
// components actually import are kept; the RAG/document/adapter types are dropped.

export interface ModelOption {
  id: string;
  name: string;
  provider?: string;
  /** A short subtitle shown under the name (e.g. "Flagship model"). Takes
   *  precedence over `provider` for the row subtitle when both are set. */
  description?: string;
  /** Optional group name. Models sharing a `group` are collected under a
   *  collapsible section (e.g. "Legacy models"); ungrouped models list first. */
  group?: string;
}

export interface SearchFilters {
  tags?: string[];
  authors?: string[];
  contentType?: 'transcript' | 'markdown';
  dateRange?: { from: string; to: string };
}

export interface ConversationScope {
  type: 'document' | 'collection';
  documentId?: string;
  filters?: SearchFilters;
}

export interface ConversationSummary {
  id: string;
  title: string;
  groupId?: string;
  /** Only meaningful to scope-aware consumers; the list never reads it. */
  scope?: ConversationScope;
  messageCount: number;
  /** Fallback for the auto relative time when updatedAt is absent. */
  lastMessageAt?: string;
  updatedAt: string;
  /** Trailing text describing the row's content, read differently by the two
   *  built-in list surfaces (both optional, same field — no widened shape):
   *  the desktop `ConversationList`/`ConversationItem` renders it right-aligned
   *  as a count/status/"days ago" and auto-derives a short relative time from
   *  `updatedAt` (fallback `lastMessageAt`) when it's absent; the widget-box
   *  `ConversationPanel` list view (owner rework, 2026-08-26) renders it as the
   *  one-line last-message preview under the title instead — that view always
   *  computes its own right-aligned relative time from `updatedAt` separately,
   *  since a box that size has no room for a third line. `localStorageStore`
   *  writes it as the ~80-char truncated last-message preview on every save
   *  (`primitives/conversation-store.ts`). */
  trailing?: string;
  /** ISO timestamp of when this conversation was last SEEN by the visitor
   *  (widened additively, 2026-08-26 — unread indicators; no existing field
   *  fit, since `trailing`/`lastMessageAt`/`updatedAt` are all content-timing
   *  facts, not viewing-state). Unread = `updatedAt` is later than this.
   *  Written by `ConversationStore.markRead` (see that doc for exactly when
   *  and for the decide-loudly default when a store never implements it —
   *  an absent `lastReadAt` reads as "not unread," never as "definitely
   *  unread," so a store that doesn't support the concept at all simply
   *  never shows an indicator rather than guessing). Round-tripped through
   *  `list()`/`save()`; never author this by hand. */
  lastReadAt?: string;
}

export interface ConversationGroup {
  id: string;
  userId?: string;
  teamId?: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

/** One row in a `HomeConfig.links` list — a "docs" / "talk to sales" style
 *  entry. `href` is optional: with it, the row renders as a link (subject to
 *  `isSafeUrl`); without it, the row is a button that emits itself via
 *  `HomePanelProps.onLink`. `icon` is either a `renderIcon` name or a safe
 *  URL, same resolution `renderIcon` already does for every other icon prop
 *  in the kit. */
export interface HomeLinkEntry {
  label: string;
  href?: string;
  description?: string;
  icon?: string;
}

/** The widget home screen's JSON-shaped config (Intercom-pattern home tab).
 *  Consumed by `ChatThread`'s `home` prop, which wires it into `HomePanel`/
 *  `WidgetTabBar` and, from there, into `<kai-chat>`'s own `home` property. */
export interface HomeConfig {
  greeting?: { title?: string; subtitle?: string };
  recentConversation?: boolean;
  newConversation?: { label?: string };
  links?: HomeLinkEntry[];
}
