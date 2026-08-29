import type { Component } from 'solid-js';
import {
  Copy, ThumbsUp, ThumbsDown, RefreshCw, Pencil,
  Share, Bookmark, Download, Link, Trash2, Check, X, Star, Flag, Reply, MoreHorizontal, Volume2,
} from 'lucide-solid';
import type { ChatMessageAction } from '../elements/chat-types';

type IconComponent = Component<{ class?: string }>;

/**
 * Curated `name → lucide-solid Component` registry for message action buttons.
 *
 * Fixed allow-list — NO arbitrary SVG/URL. Covers the five built-in action
 * icons plus the common custom ones a host is likely to want. Reused across
 * `kai-message`/`kai-chat` (and, later, kai-checkpoint/kai-empty).
 */
const ICONS: Record<string, IconComponent> = {
  // built-in action icons
  copy: Copy,
  like: ThumbsUp,
  dislike: ThumbsDown,
  regenerate: RefreshCw,
  edit: Pencil,
  speak: Volume2,
  // common custom icons
  share: Share,
  bookmark: Bookmark,
  download: Download,
  link: Link,
  trash: Trash2,
  check: Check,
  x: X,
  star: Star,
  flag: Flag,
  reply: Reply,
  more: MoreHorizontal,
  'volume-2': Volume2,
};

/** Resolve a curated icon name to its component, or `undefined` when unknown
 *  (the caller then renders a label-only button). */
export function actionIcon(name?: string): IconComponent | undefined {
  if (!name) return undefined;
  return ICONS[name];
}

/** Default labels for the built-in actions (also used as the `aria-label`). */
export const BUILTIN_ACTION_LABEL: Record<ChatMessageAction, string> = {
  copy: 'Copy',
  like: 'Like',
  dislike: 'Dislike',
  regenerate: 'Regenerate',
  edit: 'Edit',
  speak: 'Read aloud',
};
