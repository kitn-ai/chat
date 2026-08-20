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
  /** Right-aligned trailing text on the row — a count, status, or "days ago".
   *  When omitted, a short relative time is auto-derived from `updatedAt`
   *  (fallback `lastMessageAt`). */
  trailing?: string;
}

export interface ConversationGroup {
  id: string;
  userId?: string;
  teamId?: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}
