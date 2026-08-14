import { Conversations } from '@kitn.ai/ui/react';
import type { Theme } from '../theme';
import type { Conversation } from '../chat-data';

interface SidebarProps {
  theme: Theme;
  conversations: Conversation[];
  activeId: string;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onToggle: () => void;
}

/**
 * The conversation rail — a thin wrapper over `<kai-conversations>`.
 *
 * `conversations` is an ARRAY, so it crosses as a JS property rather than an HTML
 * attribute. That is the half of the contract server rendering makes visible: the
 * SSR pass emits `<kai-conversations></kai-conversations>` with no `conversations`
 * attribute anywhere, because the wrapper assigns the property from a layout
 * effect that only ever runs in the browser.
 *
 * The `.sidebar` div owns the shell's right border (kept OFF the element so it
 * follows the shell's light/dark tokens, not the element's own re-scoped ones).
 */
export function Sidebar({ theme, conversations, activeId, collapsed, onSelect, onNewChat, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <Conversations
        theme={theme}
        groups={[]} /* flat list: the element buckets `conversations` by recency itself */
        conversations={conversations}
        activeId={activeId}
        collapsed={collapsed}
        onConversationSelect={(e) => onSelect(e.detail.id)}
        onNewChat={onNewChat}
        onToggleSidebar={onToggle}
      />
    </aside>
  );
}
